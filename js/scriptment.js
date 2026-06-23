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

// ── Apertura / chiusura ──
export function openScriptment(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);

  const overlay = document.getElementById('scriptment-overlay');
  const ta = document.getElementById('scriptment-text');
  const title = document.getElementById('scriptment-proj-title');

  if(title) title.textContent = p.title || 'Scriptment';
  if(ta){
    ta.value = sm.text || '';
    applyFontClass(ta, sm.font);
    applySize(ta, sm.size);
  }
  highlightFontPill(sm.font);
  updateSizeLabel(sm.size);
  updateWordCount(sm.text || '');

  if(overlay) overlay.classList.add('open');
  document.body.classList.add('scriptment-open');
  // focus dopo l'animazione
  setTimeout(()=>{ if(ta) ta.focus(); }, 250);

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
  sm.text = ta.value;
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

// ── AUTO-FORMATO — mostra ANTEPRIMA, poi l'utente decide se applicare ──
export function formatScriptment(){
  const p = getProject(currentId); if(!p) return;
  const ta = document.getElementById('scriptment-text');
  if(!ta) return;

  const original = ta.value;
  const formatted = autoFormatScreenplay(original);

  // Se non cambia nulla, avvisa e basta
  if(formatted === original){
    const hint = document.getElementById('fmt-preview-hint');
    showFormatPreview(original, formatted, true);
    return;
  }
  showFormatPreview(original, formatted, false);
}

// Mostra l'anteprima del testo formattato nel pannello
function showFormatPreview(original, formatted, noChange){
  const overlay = document.getElementById('fmt-preview-overlay');
  const pre = document.getElementById('fmt-preview-text');
  const hint = document.getElementById('fmt-preview-hint');
  if(!overlay || !pre) return;
  pre.textContent = formatted;
  if(hint) hint.textContent = noChange
    ? 'Nessuna modifica: il testo è già a posto così.'
    : 'Ecco come verrebbe formattato. Applichi?';
  // memorizzo il testo formattato sul pannello per l'applica
  overlay.dataset.formatted = formatted;
  overlay.classList.add('open');
}

export function closeFormatPreview(){
  const overlay = document.getElementById('fmt-preview-overlay');
  if(overlay) overlay.classList.remove('open');
}

// Applica davvero il testo formattato
export function applyFormatPreview(){
  const p = getProject(currentId); if(!p) return;
  const sm = getScriptment(p);
  const ta = document.getElementById('scriptment-text');
  const overlay = document.getElementById('fmt-preview-overlay');
  if(!ta || !overlay) return;
  const formatted = overlay.dataset.formatted || ta.value;
  ta.value = formatted;
  sm.text = formatted;
  updateWordCount(formatted);
  flagSaving();
  scheduleSave(p);
  closeFormatPreview();
}

// Regole di formattazione (testo → testo):
// - INT./EST. a inizio riga → maiuscolo, riga isolata (scene heading)
// - NOME: "Battuta"  →  NOME su riga, battuta a capo rientrata
// - Etichette tipo "Voce fuori campo:", "V.O.:", "O.S.:" riconosciute come parlato
// - (parentetiche) lasciate come sono
function autoFormatScreenplay(text){
  const lines = text.split('\n');
  const out = [];

  // Indicatori di "parlato" comuni (voice over, ecc.)
  const speakerLabels = /^(voce fuori campo|voce narrante|voce|v\.?o\.?|o\.?s\.?|off|f\.?c\.?)\s*:/i;

  for(let raw of lines){
    let line = raw.replace(/\s+$/,''); // trim destro
    const trimmed = line.trim();

    if(trimmed === ''){ out.push(''); continue; }

    // Le note dell'autore (// ...) restano intatte, mai formattate
    if(/^\/\//.test(trimmed)){ out.push(line); continue; }

    // Scene heading: inizia con INT/EST (case-insensitive)
    if(/^(int|est|int\.\/est|interno|esterno)\b[\.\s]/i.test(trimmed)){
      if(out.length && out[out.length-1] !== '') out.push('');
      out.push(trimmed.toUpperCase());
      out.push('');
      continue;
    }

    // Etichetta di parlato "Voce fuori campo: ..." → personaggio + dialogo
    const vo = trimmed.match(speakerLabels);
    if(vo){
      let rest = trimmed.slice(vo[0].length).trim();
      rest = rest.replace(/^["«»"']+/, '').replace(/["«»"']+([.,;!?]*)$/, '$1').trim();
      if(out.length && out[out.length-1] !== '') out.push('');
      out.push('\t\t\t' + vo[1].toUpperCase().replace(/\s*:\s*$/,''));
      if(rest) out.push('\t' + rest);
      out.push('');
      continue;
    }

    // Dialogo "NOME: battuta" — SOLO nome breve (max 2 parole, ≤18 char), evita di pescare frasi
    const m = trimmed.match(/^([A-ZÀ-Ý][A-Za-zÀ-ÿ'\.\-]{1,16})(\s[A-ZÀ-Ý][A-Za-zÀ-ÿ'\.\-]{1,16})?:\s*(.+)$/);
    if(m){
      const namePart = (m[1] + (m[2]||'')).trim();
      let speech = m[3].trim();
      speech = speech.replace(/^["«»"']+/, '').replace(/["«»"']+([.,;!?]*)$/, '$1').trim();
      // accetta solo se il "nome" è plausibile (poche parole, niente punteggiatura interna strana)
      const wordCount = namePart.split(/\s+/).length;
      if(wordCount <= 2 && namePart.length <= 18){
        if(out.length && out[out.length-1] !== '') out.push('');
        out.push('\t\t\t' + namePart.toUpperCase());
        out.push('\t' + speech);
        out.push('');
        continue;
      }
    }

    // Riga GIÀ tutta in maiuscolo dall'autore e corta = nome personaggio isolato
    // (solo se l'autore l'ha scritta maiuscola di proposito, non la forziamo noi)
    if(trimmed === trimmed.toUpperCase() && /^[A-ZÀ-Ý][A-ZÀ-Ý0-9 '\.\-]{1,20}$/.test(trimmed) && trimmed.split(/\s+/).length <= 3){
      if(out.length && out[out.length-1] !== '') out.push('');
      out.push('\t\t\t' + trimmed);
      continue;
    }

    // altrimenti: prosa/azione, lasciata invariata
    out.push(line);
  }

  // collassa righe vuote multiple
  const cleaned = [];
  for(let l of out){
    if(l === '' && cleaned.length && cleaned[cleaned.length-1] === '') continue;
    cleaned.push(l);
  }
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
    if(readInner) readInner.textContent = sm.text || '(ancora niente scritto)';
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
