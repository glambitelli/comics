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

      // scena: ricostruisci "N. HEADING" (ignora il doppio numero del render)
      if(cls && cls.includes && cls.includes('sp-scene')){
        if(buf !== '') pushLine();
        const h = child.querySelector ? child.querySelector('.sp-scene-h') : null;
        const n = child.querySelector ? child.querySelector('.sp-scene-n') : null;
        const num = n ? n.textContent.trim() : '';
        const head = h ? h.textContent.trim() : child.textContent.trim();
        buf = (num ? num + '. ' : '') + head;
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
  return result.join('\n');
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
export function openScriptment(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);

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

  // Shortcut ⌘⇧F / Ctrl+Shift+F per formattare
  if(!overlay._fmtShortcut){
    overlay._fmtShortcut = (e)=>{
      if((e.metaKey||e.ctrlKey) && e.shiftKey && e.key.toLowerCase()==='f'){
        e.preventDefault();
        formatScriptment();
      }
    };
    document.addEventListener('keydown', overlay._fmtShortcut);
  }
}

export function closeScriptment(){
  const overlay = document.getElementById('scriptment-overlay');
  if(overlay) overlay.classList.remove('open');
  document.body.classList.remove('scriptment-open');
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
export function onScriptmentInput(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const ta = document.getElementById('scriptment-text');
  if(!ta) return;
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

  const original = editorGetText(ta);
  // RETE DI SICUREZZA: se la lettura risulta vuota ma l'editor ha testo visibile,
  // non formattare (eviterebbe di cancellare tutto). Meglio non fare nulla.
  if(original.trim() === '' && (ta.textContent || '').trim() !== ''){
    return;
  }
  const formatted = autoFormatScreenplay(original);
  // Ulteriore sicurezza: non sostituire con vuoto se prima c'era testo.
  if(formatted.trim() === '' && original.trim() !== ''){
    return;
  }

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
const RE_SPEAKER = /^(voce fuori campo|voce narrante|voce|v\.?o\.?|o\.?s\.?|off|f\.?c\.?)\s*:/i;
const RE_TRANSITION = /^(cut to|smash cut|match cut|hard cut|jump cut|dissolve to|cross dissolve|fade in|fade out|fade to black|fade to white|fade to|wipe to|iris in|iris out|stacca su|stacca|dissolvenza|titoli di coda|fine)\s*:?\s*$/i;
const RE_SCENE = /^(int|est|int\.\/est|interno|esterno)\b[\.\s]/i;
// scena con numerazione già presente: "12. INT..." oppure "12  INT...  12"
const RE_SCENE_NUMBERED = /^\s*\d+[\.\s]+(.*?)(?:\s+\d+\s*)?$/;

// Analizza il testo "pulito" e restituisce righe tipizzate per il rendering.
// type ∈ scene | transition | character | dialogue | action | blank | note
export function parseScreenplay(text){
  const lines = (text || '').split('\n');
  const result = [];
  let sceneNum = 0;
  let inDialogue = false;

  for(const raw of lines){
    const trimmed = raw.trim();

    if(trimmed === ''){ result.push({type:'blank', text:''}); inDialogue = false; continue; }
    if(/^\/\//.test(trimmed)){ result.push({type:'note', text:trimmed}); inDialogue = false; continue; }

    if(RE_TRANSITION.test(trimmed)){
      let t = trimmed.toUpperCase().replace(/\s*:?\s*$/, '');
      result.push({type:'transition', text:t + ':'});
      inDialogue = false; continue;
    }

    // scena (anche se già numerata)
    let heading = trimmed;
    const sn = trimmed.match(RE_SCENE_NUMBERED);
    if(sn && RE_SCENE.test(sn[1])) heading = sn[1].trim();
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
      if(rest) result.push({type:'dialogue', text:rest});
      inDialogue = false; continue;
    }

    // "NOME: battuta"
    const m = trimmed.match(/^([A-ZÀ-Ý][A-Za-z0-9À-ÿ'\.\-]{1,16})(\s[A-ZÀ-Ý0-9][A-Za-z0-9À-ÿ'\.\-]{1,16})?:\s*(.+)$/);
    if(m){
      const namePart = (m[1] + (m[2]||'')).trim();
      let speech = m[3].trim().replace(/^["«»"']+/, '').replace(/["«»"']+([.,;!?]*)$/, '$1').trim();
      if(namePart.split(/\s+/).length <= 2 && namePart.length <= 18){
        result.push({type:'character', text:namePart.toUpperCase()});
        result.push({type:'dialogue', text:speech});
        inDialogue = false; continue;
      }
    }

    // riga tutta maiuscola e corta = nome personaggio isolato
    if(trimmed === trimmed.toUpperCase() && /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 '\.\-]{1,20}$/.test(trimmed) && trimmed.split(/\s+/).length <= 3){
      result.push({type:'character', text:trimmed});
      inDialogue = true; continue;
    }

    // riga dopo un nome = dialogo
    if(inDialogue){ result.push({type:'dialogue', text:trimmed}); continue; }

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
        html += `<div class="sp-scene"><span class="sp-scene-n">${n.scene}</span><span class="sp-scene-h">${esc(n.text)}</span><span class="sp-scene-n">${n.scene}</span></div>`;
        break;
      case 'transition': html += `<div class="sp-transition">${esc(n.text)}</div>`; break;
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
