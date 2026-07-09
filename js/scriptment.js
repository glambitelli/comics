// ════════════════════════════════════════════════════════
// SCRIPTMENT — editor di scrittura libera a tutto schermo
// Prosa + dialoghi mischiati (metodo Cameron). Courier 12 default.
// ════════════════════════════════════════════════════════
import { getProject, currentId } from './state.js';
import { scheduleSave } from './firebase.js';
import { getScriptment } from './home.js';

const FONT_CLASS = {
  courier: 'sm-font-courier',
  serif:   'sm-font-serif',
  sans:    'sm-font-sans',
};
let _savedTimer = null;

// ── Helper editor contenteditable ──
// Legge il testo "pulito" (logico) dal contenteditable.
// Cammina ricorsivamente l'albero ed è robusto a qualunque annidamento
// che il browser crea durante la digitazione (div annidati, <br>, span...).
function editorGetText(el){
  if(!el) return '';
  const lines = [];
  let buf = '';
  const pushLine = ()=>{ lines.push(buf); buf = ''; };

  function walk(node){
    const kids = node.childNodes;
    for(let i=0;i<kids.length;i++){
      const child = kids[i];
      if(child.nodeType === 3){            // nodo di testo
        buf += child.textContent.replace(/\n/g,'');
        continue;
      }
      if(child.nodeType !== 1) continue;
      const tag = child.tagName;
      const cls = child.className || '';

      if(tag === 'BR'){ pushLine(); continue; }

      // marcatore d'atto: ricostruisci "# label"
      if(cls && cls.includes && cls.includes('sp-act')){
        if(buf !== '') pushLine();
        buf = '# ' + child.textContent.trim();
        pushLine();
        continue;
      }
      // riga vuota esplicita
      if(cls && cls.includes && cls.includes('sp-blank')){
        if(buf !== '') pushLine();
        pushLine();
        continue;
      }

      // elemento di blocco → nuova riga
      const isBlock = (tag === 'DIV' || tag === 'P' || tag === 'LI');
      if(isBlock){
        if(buf !== '') pushLine();   // chiudi il testo inline accumulato
        const before = lines.length;
        walk(child);                 // raccogli il contenuto del blocco
        if(buf !== '') pushLine();
        else if(lines.length === before) pushLine(); // blocco vuoto = riga vuota
      } else {
        walk(child);                 // inline (span, b, i...) → continua
      }
    }
  }

  walk(el);
  if(buf !== '') pushLine();

  let result = lines.map(l => l.replace(/\u00a0/g,' ').replace(/\s+$/,''));
  while(result.length > 1 && result[result.length-1] === '') result.pop();
  const joined = result.join('\n');

  // CONTROLLO DI COMPLETEZZA: confronta le parole lette con quelle visibili
  // (protegge da eventuali disallineamenti DOM/testo logico).
  const norm = s => (s || '').toLowerCase()
    .replace(/(\d)(\p{L})/gu,'$1 $2').replace(/(\p{L})(\d)/gu,'$1 $2');
  const wordsOf = s => (norm(s).match(/[\p{L}\p{N}]+/gu) || []);

  let visibleText = '';
  const collectVisible = (node) => {
    if(node.nodeType === 3){ visibleText += node.textContent; return; }
    if(node.nodeType !== 1) return;
    node.childNodes.forEach(collectVisible);
  };
  collectVisible(el);

  const haveWords = new Set(wordsOf(joined));
  const missing = wordsOf(visibleText).filter(w => !haveWords.has(w));
  if(missing.length > 0){
    if(typeof el.innerText === 'string' && el.innerText.trim() !== ''){
      return el.innerText.replace(/\u00a0/g,' ').replace(/\n{3,}/g,'\n\n');
    }
    if(joined.trim() === '' && (el.textContent || '').trim() !== ''){
      return (el.textContent || '').replace(/\u00a0/g,' ');
    }
  }
  return joined;
}

// Scrive nel contenteditable: se il testo è "formattabile" lo renderizza,
// altrimenti lo mette come righe semplici modificabili.
function editorRender(el, text){
  if(!el) return;
  el.innerHTML = renderScreenplayHTML(text || '');
}
// Scrive testo grezzo (durante editing libero non rirenderizziamo)
function editorSetPlain(el, text){
  if(!el) return;
  const lines = (text||'').split('\n');
  el.innerHTML = lines.map(l=> l==='' ? '<div class="sp-blank"></div>' : `<div class="sp-action">${l.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`).join('');
}


// ── Apertura / chiusura ──
let _projScrollMemo = 0;

export function openScriptment(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const ps = document.querySelector('.proj-scroll');
  if(ps) _projScrollMemo = ps.scrollTop;

  const overlay = document.getElementById('scriptment-overlay');
  const ta = document.getElementById('scriptment-text');
  const title = document.getElementById('scriptment-proj-title');

  if(title) title.textContent = '"' + (p.title || 'Scriptment') + '"';
  if(ta){
    // renderizza il testo già formattato (centratura via CSS)
    editorRender(ta, sm.text || '');
    applyFontClass(ta, sm.font);
    applySize(ta, sm.size);
  }
  highlightFontPill(sm.font);
  updateSizeLabel(sm.size);
  updateWordCount(sm.text || '');

  if(overlay) overlay.classList.add('open');
  document.body.classList.add('scriptment-open');
  // Su desktop: focus automatico (comodo). Su touch: NIENTE focus automatico,
  // così la tastiera non salta su di colpo — sale solo quando l'utente tocca.
  const isTouch = document.body.classList.contains('is-touch');
  setTimeout(()=>{
    const wrap = document.getElementById('scriptment-editor-wrap');
    if(wrap) wrap.scrollTop = 0;
    if(ta){
      ta.scrollTop = 0;
      if(!isTouch) ta.focus({preventScroll:true});
    }
  }, 250);

  // Shortcut ⌘⇧F formatta · ⌘S salva subito · Esc chiude
  if(!overlay._fmtShortcut){
    overlay._fmtShortcut = (e)=>{
      if(!overlay.classList.contains('open')) return;
      if((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==='f'){
        e.preventDefault();
        formatScriptment();
        return;
      }
      if((e.metaKey||e.ctrlKey) && !e.shiftKey && e.key.toLowerCase()==='s'){
        e.preventDefault();
        saveScriptmentNow();
        return;
      }
      if(e.key === 'Escape'){
        e.preventDefault();
        closeScriptment();
      }
    };
    document.addEventListener('keydown', overlay._fmtShortcut);
  }
}

export function closeScriptment(){
  const overlay = document.getElementById('scriptment-overlay');
  if(overlay) overlay.classList.remove('open');
  document.body.classList.remove('scriptment-open');
  // ripristina lo scroll della pagina progetto dov'era prima di aprire l'editor
  requestAnimationFrame(()=>{
    const ps = document.querySelector('.proj-scroll');
    if(ps) ps.scrollTop = _projScrollMemo;
  });
  // reset vista lettura inline
  const editorWrap = document.getElementById('scriptment-editor-wrap');
  const readWrap   = document.getElementById('scriptment-read-wrap');
  const tools      = document.getElementById('scriptment-tools');
  const toggleBtn  = document.getElementById('scriptment-read-toggle');
  if(editorWrap) editorWrap.style.display = 'flex';
  if(readWrap)   readWrap.style.display = 'none';
  if(tools)      tools.style.display = 'flex';
  if(toggleBtn)  toggleBtn.classList.remove('active');
  // rimuovi shortcut formattazione
  const overlay2 = document.getElementById('scriptment-overlay');
  if(overlay2 && overlay2._fmtShortcut){
    document.removeEventListener('keydown', overlay2._fmtShortcut);
    overlay2._fmtShortcut = null;
  }
  // aggiorna il conteggio parole sul pulsante in fase Sviluppo
  refreshScriptmentButton();
}

// ── Salvataggio del testo (durante la digitazione) ──
// Quando l'utente scrive dentro un blocco "nome/scena/transizione" (maiuscolo/
// grassetto), lo riporta a testo normale all'istante. La formattazione si
// riapplica solo premendo formatta. Risolve il testo che appare in maiuscolo
// dopo aver cancellato tutto e riscritto.
function normalizeCaretBlock(editor){
  try{
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount) return;
    let node = sel.anchorNode;
    if(!node) return;
    // sali fino al figlio diretto dell'editor
    while(node && node.parentNode && node.parentNode !== editor) node = node.parentNode;
    if(!node || node.nodeType !== 1 || node.parentNode !== editor) return;
    const cls = node.className || '';
    if(/sp-(character|scene|transition)/.test(cls)){
      // appiattisci eventuali span interni (scene) mantenendo solo il testo
      const txt = node.textContent;
      node.className = 'sp-action';
      if(node.querySelector && node.querySelector('span')){
        node.textContent = txt;
        // riposiziona il cursore a fine blocco
        const r = document.createRange();
        r.selectNodeContents(node); r.collapse(false);
        sel.removeAllRanges(); sel.addRange(r);
      }
    }
  }catch(e){/* non bloccare mai la digitazione */}
}

// Ripulisce TUTTI i blocchi dell'editor (non solo quello del cursore):
// un blocco "sp-scene" che il browser ha spezzato/svuotato con Invio, e il
// cui testo NON è più una vera intestazione (INT./EST...), torna testo
// normale — così non genera più un numero-scena fantasma. Copre anche i
// blocchi nome/transizione/dialogo lasciati vuoti dallo split.
function sanitizeFormattedBlocks(editor){
  try{
    const kids = editor.children;
    for(let i=0;i<kids.length;i++){
      const node = kids[i];
      const cls = node.className || '';
      const txt = (node.textContent||'').trim();
      if(/\bsp-scene\b/.test(cls) && !RE_SCENE.test(txt)){
        node.className = 'sp-action';
        continue;
      }
      if(/sp-(character|transition|act|dialogue)/.test(cls) && txt === ''){
        node.className = 'sp-action';
      }
    }
  }catch(e){/* non bloccare mai la digitazione */}
}

export function onScriptmentInput(e){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const ta = document.getElementById('scriptment-text');
  if(!ta) return;
  // Normalizza il blocco SOLO se l'utente ha digitato/cancellato testo, NON
  // quando ha premuto Invio (a capo): in quel caso un nome non deve perdere
  // il suo ruolo. inputType insertParagraph/insertLineBreak = a capo.
  const it = e && e.inputType ? e.inputType : '';
  const isNewline = it === 'insertParagraph' || it === 'insertLineBreak';
  if(!isNewline) normalizeCaretBlock(ta);
  sanitizeFormattedBlocks(ta);
  sm.text = editorGetText(ta);
  updateWordCount(sm.text);
  flagSaving();
  scheduleSave(p);
}

// ── Font ──
export function setScriptmentFont(font){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  sm.font = font;
  const ta = document.getElementById('scriptment-text');
  if(ta) applyFontClass(ta, font);
  highlightFontPill(font);
  scheduleSave(p);
}

// ── Dimensione ──
export function stepScriptmentSize(delta){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  let s = (sm.size || 13) + delta;
  s = Math.max(10, Math.min(22, s));
  sm.size = s;
  const ta = document.getElementById('scriptment-text');
  if(ta) applySize(ta, s);
  updateSizeLabel(s);
  scheduleSave(p);
}

// ── AUTO-FORMATO — formatta e re-impagina direttamente l'editor ──
export function formatScriptment(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const ta = document.getElementById('scriptment-text');
  if(!ta) return;

  let original = editorGetText(ta);
  // Se la lettura è vuota ma c'è testo visibile, recupera dal textContent
  // (non blocchiamo mai silenziosamente: meglio formattare il recuperabile).
  if(original.trim() === '' && (ta.textContent || '').trim() !== ''){
    original = (ta.textContent || '').replace(/\u00a0/g,' ');
  }
  // Se davvero non c'è nulla, non fare niente.
  if(original.trim() === '') return;

  const formatted = autoFormatScreenplay(original);
  // Sicurezza estrema: non sostituire con vuoto se prima c'era testo.
  if(formatted.trim() === '' && original.trim() !== '') return;

  // re-impagina l'editor con la formattazione (centratura via CSS)
  editorRender(ta, formatted);
  sm.text = formatted;
  updateWordCount(formatted);
  flagSaving();
  scheduleSave(p);

  // feedback chiaro sul pulsante: la label diventa "✓ fatto" per un attimo
  const btn = document.getElementById('scriptment-fmt-float');
  const lbl = btn ? btn.querySelector('.fmt-label') : null;
  if(btn && lbl){
    if(!lbl._orig) lbl._orig = lbl.textContent;
    btn.classList.add('fmt-done');
    lbl.textContent = '✓ fatto';
    clearTimeout(btn._fbTimer);
    btn._fbTimer = setTimeout(()=>{
      btn.classList.remove('fmt-done');
      lbl.textContent = lbl._orig;
    }, 900);
  }
}

// (Anteprima formattazione rimossa: ora formatta impagina direttamente l'editor)
export function closeFormatPreview(){
  const overlay = document.getElementById('fmt-preview-overlay');
  if(overlay) overlay.classList.remove('open');
}
export function applyFormatPreview(){ closeFormatPreview(); }

// Regole di formattazione: il testo salvato resta PULITO (allineato a sinistra,
// senza spazi di centratura). La centratura visiva è applicata via CSS in lettura,
// così risulta identica su browser e mobile a qualsiasi larghezza.
// - INT./EST. → scena numerata; CUT TO: ecc. → transizione; NOME/battuta → dialogo
// Riconoscitori condivisi (usati sia da format che da parse)
// Capitalizza la prima lettera di una stringa
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const RE_SPEAKER = /^(voce fuori campo|voce narrante|voce|v\.?o\.?|o\.?s\.?|off|f\.?c\.?)\s*:/i;
const RE_TRANSITION = /^(cut to|smash cut|match cut|hard cut|jump cut|dissolve to|cross dissolve|fade in|fade out|fade to black|fade to white|fade to|wipe to|iris in|iris out|stacca su|stacca|dissolvenza|titoli di coda|fine)\s*:?\s*$/i;
const RE_SCENE = /^(int|est|ext|int\.\/est|int\.\/ext|interno|esterno)\b[.\s]/i;

// Riconosce l'atto dal testo di un marcatore "# Atto II" → 'setup'|'confrontation'|'resolution'|null
function actIdFromLabel(label){
  const s=(label||'').toLowerCase();
  if(/\biii\b|\b3\b|\btre\b|terz|risoluz|resolution|epilog|finale/.test(s)) return 'resolution';
  if(/\bii\b|\b2\b|\bdue\b|second|confront|svolg|conflitt|centrale/.test(s)) return 'confrontation';
  if(/\bi\b|\b1\b|\buno\b|prim|setup|esposiz|impost|inizio/.test(s)) return 'setup';
  return null;
}

// Analizza il testo "pulito" e restituisce righe tipizzate per il rendering.
// type ∈ scene | transition | character | dialogue | action | blank | note
export function parseScreenplay(text){
  // Pre-split: spezza battute "in linea" tipo "...frase. Nome: battuta"
  // (solo dopo un terminatore di frase . ! ? per evitare falsi positivi).
  function splitInlineCue(line){
    // Non spezzare righe che iniziano come scene (INT./EST./ecc.)
    const t = line.trim();
    if(RE_SCENE.test(t)) return [line];
    const snCheck = t.match(/^\d+[.\s]+/);
    if(snCheck && RE_SCENE.test(t.slice(snCheck[0].length))) return [line];
    const out = [];
    let rest = line;
    let guard = 0;
    while(guard++ < 8){
      const m = rest.match(/^(.+?[.!?])\s+([A-ZÀ-Ý][A-Za-z0-9À-ÿ‘’'.\-]{0,16}(?:\s[A-ZÀ-Ý0-9][A-Za-z0-9À-ÿ‘’'.\-]{1,16})?):[ \t]+(.+)$/);
      if(!m) break;
      const name = m[2].trim();
      if(name.split(/\s+/).length > 2 || name.length > 18) break;
      out.push(m[1].trim());
      rest = name + ': ' + m[3].trim();
    }
    out.push(rest);
    return out;
  }
  const rawLines = (text || '').split('\n');
  const lines = [];
  for(const l of rawLines){
    if(l.trim() === ''){ lines.push(l); continue; }
    for(const part of splitInlineCue(l)) lines.push(part);
  }
  const result = [];
  let sceneNum = 0;
  let inDialogue = false;

  for(const raw of lines){
    const trimmed = raw.trim();

    if(trimmed === ''){ result.push({type:'blank', text:''}); inDialogue = false; continue; }
    // riga fatta SOLO di un numero: mai contenuto valido, quasi certamente un
    // residuo del vecchio bug del numero-scena duplicato → la scartiamo.
    if(/^\d+$/.test(trimmed)) continue;
    if(/^\/\//.test(trimmed)){ result.push({type:'note', text:trimmed}); inDialogue = false; continue; }
    if(/^#/.test(trimmed)){
      const label = trimmed.replace(/^#+\s*/,'').trim();
      result.push({type:'act', text: label || 'Atto', act: actIdFromLabel(label)});
      inDialogue = false; continue;
    }
    // etichetta d'atto scritta senza # (es. "ATTO 2", "ACT II", "SETUP") — la
    // riconosciamo comunque come marcatore d'atto invece di action/personaggio
    const RE_ACT_LABEL = /^(ATTO|ACT|SETUP|ESPOSIZIONE|CONFRONTATION|CONFRONTO|SVOLGIMENTO|RESOLUTION|RISOLUZIONE|EPILOGO|FINALE)\b[\sIVX0-9°]*$/i;
    if(RE_ACT_LABEL.test(trimmed)){
      result.push({type:'act', text: trimmed, act: actIdFromLabel(trimmed)});
      inDialogue = false; continue;
    }
    if(RE_TRANSITION.test(trimmed)){
      let t = trimmed.toUpperCase().replace(/\s*:?\s*$/, '');
      result.push({type:'transition', text:t + ':'});
      inDialogue = false; continue;
    }

    // scena (anche se già numerata)
    let heading = trimmed;
    const snm = trimmed.match(/^\s*(\d+)[.\s]+(.*)$/);
    if(snm && RE_SCENE.test(snm[2])){
      let h = snm[2].trim();
      // rimuovi il numero in coda SOLO se è lo stesso di quello in testa
      // (residuo del vecchio bug di duplicazione), mai numeri legittimi
      // che fanno parte del titolo (es. "INT. AUTOSTRADA 66")
      h = h.replace(new RegExp('\\s+'+snm[1]+'\\s*$'), '');
      heading = h;
    }
    if(RE_SCENE.test(heading)){
      sceneNum++;
      result.push({type:'scene', text:heading.toUpperCase(), scene:sceneNum});
      inDialogue = false; continue;
    }

    // "Voce fuori campo: ..." → personaggio + dialogo
    const vo = trimmed.match(RE_SPEAKER);
    if(vo){
      let rest = trimmed.slice(vo[0].length).trim().replace(/^["«»"']+/, '').replace(/["«»"']+([.,;!?]*)$/, '$1').trim();
      result.push({type:'character', text:vo[1].toUpperCase().replace(/\s*:\s*$/,'')});
      if(rest) result.push({type:'dialogue', text:cap(rest)});
      inDialogue = false; continue;
    }

    // "NOME: battuta"
    const m = trimmed.match(/^([A-ZÀ-Ý][A-Za-z0-9À-ÿ'\.\-]{1,16})(\s[A-ZÀ-Ý0-9][A-Za-z0-9À-ÿ'\.\-]{1,16})?:\s*(.+)$/);
    if(m){
      const namePart = (m[1] + (m[2]||'')).trim();
      let speech = m[3].trim().replace(/^["«»"']+/, '').replace(/["«»"']+([.,;!?]*)$/, '$1').trim();
      if(namePart.split(/\s+/).length <= 2 && namePart.length <= 18){
        result.push({type:'character', text:namePart.toUpperCase()});
        result.push({type:'dialogue', text:cap(speech)});
        inDialogue = false; continue;
      }
    }

    // riga tutta maiuscola e corta = nome personaggio isolato
    if(trimmed === trimmed.toUpperCase() && /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 '\.\-]{1,20}$/.test(trimmed) && trimmed.split(/\s+/).length <= 3){
      result.push({type:'character', text:trimmed});
      inDialogue = true; continue;
    }

    // riga dopo un nome = dialogo
    if(inDialogue){ result.push({type:'dialogue', text:cap(trimmed)}); continue; }

    // prosa / azione
    result.push({type:'action', text:trimmed});
  }
  return result;
}

// Genera HTML stilizzato (centratura via CSS) dal testo screenplay.
export function renderScreenplayHTML(text){
  const esc = (s)=> s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const nodes = parseScreenplay(text);
  let html = '';
  for(const n of nodes){
    switch(n.type){
      case 'blank': html += '<div class="sp-blank"></div>'; break;
      case 'note': html += `<div class="sp-note">${esc(n.text)}</div>`; break;
      case 'scene':
        html += `<div class="sp-scene">${esc(n.text)}</div>`;
        break;
      case 'transition': html += `<div class="sp-transition">${esc(n.text)}</div>`; break;
      case 'act': html += `<div class="sp-act">${esc(n.text)}</div>`; break;
      case 'character': html += `<div class="sp-character">${esc(n.text)}</div>`; break;
      case 'dialogue': html += `<div class="sp-dialogue">${esc(n.text)}</div>`; break;
      default: html += `<div class="sp-action">${esc(n.text)}</div>`;
    }
  }
  return html;
}

// Formatta il testo grezzo in forma LOGICA PULITA (allineata a sinistra, senza
// spazi di centratura). La centratura visiva è gestita dal CSS in fase di lettura.
function autoFormatScreenplay(text){
  const parsed = parseScreenplay(text);
  const out = [];
  const pushBlankBefore = ()=>{ if(out.length && out[out.length-1] !== '') out.push(''); };

  for(let i=0;i<parsed.length;i++){
    const node = parsed[i];
    switch(node.type){
      case 'blank': out.push(''); break;
      case 'note': out.push(node.text); break;
      case 'scene':
        pushBlankBefore();
        out.push(node.scene + '. ' + node.text);
        out.push('');
        break;
      case 'transition':
        pushBlankBefore();
        out.push(node.text);
        out.push('');
        break;
      case 'act':
        pushBlankBefore();
        out.push('# ' + node.text);
        out.push('');
        break;
      case 'character':
        pushBlankBefore();
        out.push(node.text);
        break;
      case 'dialogue':
        out.push(node.text);
        // riga vuota dopo l'ultima battuta del blocco
        if(!(parsed[i+1] && parsed[i+1].type === 'dialogue')) out.push('');
        break;
      default:
        out.push(node.text);
    }
  }

  // collassa righe vuote multiple
  const cleaned = [];
  for(const l of out){
    if(l === '' && cleaned.length && cleaned[cleaned.length-1] === '') continue;
    cleaned.push(l);
  }
  // togli righe vuote iniziali
  while(cleaned.length && cleaned[0] === '') cleaned.shift();
  return cleaned.join('\n');
}

// ── VISTA LETTURA inline (toggle dentro lo scriptment) ──
export function toggleScriptmentRead(){
  const editorWrap = document.getElementById('scriptment-editor-wrap');
  const readWrap   = document.getElementById('scriptment-read-wrap');
  const readInner  = document.getElementById('scriptment-read-inner');
  const toggleBtn  = document.getElementById('scriptment-read-toggle');
  const tools      = document.getElementById('scriptment-tools');
  if(!editorWrap || !readWrap) return;

  const isReading = readWrap.style.display !== 'none';
  if(isReading){
    // torna all'editor
    readWrap.style.display = 'none';
    editorWrap.style.display = 'flex';
    if(tools) tools.style.display = 'flex';
    if(toggleBtn) toggleBtn.classList.remove('active');
  } else {
    // entra in lettura
    const p = getProject(currentId); if(!p) return;
    const sm = getScriptment(p);
    const fontCls = FONT_CLASS[sm.font] || 'sm-font-courier';
    readWrap.className = 'scriptment-read-wrap ' + fontCls;
    readWrap.style.fontSize = (sm.size || 13) + 'px';
    if(readInner) readInner.innerHTML = renderScreenplayHTML(sm.text || '(ancora niente scritto)');
    editorWrap.style.display = 'none';
    if(tools) tools.style.display = 'none';
    readWrap.style.display = 'flex';
    readWrap.scrollTop = 0;
    if(toggleBtn) toggleBtn.classList.add('active');
  }
}

// Manteniamo openScriptmentRead per compatibilità (non fa nulla di visibile ora)
export function openScriptmentRead(){ toggleScriptmentRead(); }

// ── Helpers UI ──
function applyFontClass(ta, font){
  ta.classList.remove('sm-font-courier','sm-font-serif','sm-font-sans');
  ta.classList.add(FONT_CLASS[font] || 'sm-font-courier');
}
function applySize(ta, size){ ta.style.fontSize = (size||13) + 'px'; }
function updateSizeLabel(size){
  const el = document.getElementById('scriptment-size-val');
  if(el) el.textContent = size || 13;
}
function highlightFontPill(font){
  document.querySelectorAll('.scriptment-tools .font-pill').forEach(pill=>{
    pill.classList.toggle('active', pill.dataset.font === font);
  });
}
function countWords(text){
  const t = (text||'').trim();
  if(!t) return 0;
  return t.split(/\s+/).length;
}
function updateWordCount(text){
  const n = countWords(text);
  const foot = document.getElementById('scriptment-foot-count');
  if(foot) foot.textContent = n === 1 ? '1 parola' : `${n} parole`;
}
// Salvataggio immediato via ⌘S/Ctrl+S: aggiorna il testo e mostra subito la conferma
function saveScriptmentNow(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const ta = document.getElementById('scriptment-text');
  if(ta) sm.text = editorGetText(ta);
  scheduleSave(p);
  const el = document.getElementById('scriptment-foot-saved');
  if(el){
    el.textContent = 'salvato ✓';
    clearTimeout(_savedTimer);
  }
}

function flagSaving(){
  const el = document.getElementById('scriptment-foot-saved');
  if(!el) return;
  el.textContent = 'salvataggio…';
  clearTimeout(_savedTimer);
  _savedTimer = setTimeout(()=>{ el.textContent = 'salvato ✓'; }, 900);
}

// Aggiorna l'etichetta del pulsante Scriptment nella fase Sviluppo
export function refreshScriptmentButton(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const el = document.getElementById('scriptment-wordcount');
  if(!el) return;
  const n = countWords(sm.text);
  el.textContent = n > 0
    ? (n === 1 ? '1 parola' : `${n} parole`)
    : 'butta vernice contro il muro';
}
