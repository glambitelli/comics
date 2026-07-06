// ════════════════════════════════════════════════════════════
//  SEQUENZA — scrittura per scene in formato sceneggiatura
// ════════════════════════════════════════════════════════════
import { getProject, currentId } from './state.js';
import { scheduleSave } from './firebase.js';

// Tipi di blocco screenplay e label della barra
const BLOCK_TYPES = [
  { id:'heading',   label:'SCENA' },
  { id:'action',    label:'AZIONE' },
  { id:'character', label:'PERSONAGGIO' },
  { id:'dialog',    label:'DIALOGO' },
  { id:'paren',     label:'(NOTA)' },
];

// Placeholder per ogni tipo di blocco
const BLOCK_PH = {
  heading:'EST. LUOGO – GIORNO',
  action:'Descrivi cosa accade…',
  character:'NOME',
  dialog:'Battuta…',
  paren:'(tono, indicazione)',
};

// ── Mostra/nascondi il contenuto Sviluppo in base al tipo ──
export function applyProjectType(p){
  const story = document.getElementById('ph1-story');
  const seq = document.getElementById('ph1-sequence');
  if(!story || !seq) return;
  const isSeq = p && p.type === 'sequence';
  story.style.display = isSeq ? 'none' : 'block';
  seq.style.display = isSeq ? 'block' : 'none';
  // Etichetta export: Copione per la Sequenza, Report per la Storia
  const exLabel = document.getElementById('export-main-label');
  if(exLabel) exLabel.textContent = isSeq ? 'Esporta copione' : 'Report';
  if(isSeq){
    renderSeqScenes(p);
    renderSeqSpine(p);
    renderSeqCharacters(p);
    renderSeqMoodboard(p);
  }
}

// ── Moodboard della sequenza (campo appunti/link) ──
export function renderSeqMoodboard(p){
  const wrap = document.getElementById('seq-moodboard-wrap');
  if(!wrap) return;
  if(wrap.dataset.wired) {
    const ta = wrap.querySelector('textarea');
    if(ta) ta.value = (p.seqMood||'');
    return;
  }
  wrap.dataset.wired = '1';
  wrap.innerHTML = '';
  const ta = document.createElement('textarea');
  ta.className = 'story-textarea';
  ta.style.cssText = 'font-size:13px;min-height:70px;width:100%;background:#fdf8e8;border:1px solid #e8d898;border-radius:8px;padding:10px;font-family:Nunito,sans-serif;color:var(--ink);resize:none;outline:none';
  ta.placeholder = 'Atmosfere, riferimenti visivi, link, palette…';
  ta.value = p.seqMood || '';
  ta.addEventListener('input', function(){
    const pp = getProject(currentId); if(!pp) return;
    pp.seqMood = this.value;
    this.style.height='auto'; this.style.height=this.scrollHeight+'px';
    scheduleSave(pp);
  });
  requestAnimationFrame(()=>{ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px'; });
  wrap.appendChild(ta);
}

// ── Render della lista scene (chiuse di default) ──
export function renderSeqScenes(p){
  const wrap = document.getElementById('seq-scenes');
  if(!wrap) return;
  if(!p.scenes) p.scenes = [];
  wrap.innerHTML = '';

  p.scenes.forEach((sc, i) => {
    if(i > 0){
      const conn = document.createElement('div');
      conn.className = 'seq-connector';
      conn.innerHTML = '<div></div>';
      wrap.appendChild(conn);
    }

    const card = document.createElement('div');
    card.className = 'seq-scene' + (sc._open ? ' open' : '');
    card.dataset.idx = i;

    // Header (sempre visibile)
    const head = document.createElement('div');
    head.className = 'seq-scene-head';
    head.innerHTML = `
      <div class="seq-num">${i+1}</div>
      <div class="seq-head-main">
        <div class="seq-title-text">${escapeHtml(sc.title) || '<span class="seq-untitled">Senza titolo</span>'}</div>
        <div class="seq-beat-text">${sc.beat ? 'beat: ' + escapeHtml(sc.beat) : '<span class="seq-untitled">beat: —</span>'}</div>
      </div>
      <span class="seq-handle" data-drag="1">⠿</span>
      <span class="seq-chev">${sc._open ? '▴' : '▾'}</span>`;
    // Tap su header (non sulla maniglia) apre/chiude
    head.addEventListener('click', (e)=>{
      if(e.target.closest('.seq-handle')) return;
      sc._open = !sc._open;
      renderSeqScenes(p);
    });
    card.appendChild(head);

    // Corpo (solo se aperto)
    if(sc._open){
      const body = document.createElement('div');
      body.className = 'seq-scene-body';

      // Campi titolo + beat
      const meta = document.createElement('div');
      meta.className = 'seq-meta-edit';
      const titleIn = document.createElement('input');
      titleIn.type = 'text';
      titleIn.className = 'seq-title-input';
      titleIn.placeholder = 'Titolo della scena';
      titleIn.value = sc.title || '';
      titleIn.addEventListener('input', function(){
        const pp = getProject(currentId); if(!pp) return;
        pp.scenes[i].title = this.value;
        const t = card.querySelector('.seq-title-text');
        if(t) t.textContent = this.value || 'Senza titolo';
        scheduleSave(pp);
      });
      const beatIn = document.createElement('input');
      beatIn.type = 'text';
      beatIn.className = 'seq-beat-input';
      beatIn.placeholder = 'beat: qual è la funzione di questa scena?';
      beatIn.value = sc.beat || '';
      beatIn.addEventListener('input', function(){
        const pp = getProject(currentId); if(!pp) return;
        pp.scenes[i].beat = this.value;
        scheduleSave(pp);
        renderSeqSpine(pp);
      });
      meta.appendChild(titleIn);
      meta.appendChild(beatIn);
      body.appendChild(meta);

      // Barra formattazione
      const toolbar = document.createElement('div');
      toolbar.className = 'sp-toolbar';
      BLOCK_TYPES.forEach(bt => {
        const btn = document.createElement('button');
        btn.className = 'sp-tool';
        btn.textContent = bt.label;
        btn.onclick = () => addBlock(i, bt.id);
        toolbar.appendChild(btn);
      });
      body.appendChild(toolbar);

      // Area screenplay (blocchi)
      const sp = document.createElement('div');
      sp.className = 'screenplay';
      if(!sc.blocks) sc.blocks = [];
      if(sc.blocks.length === 0){
        const empty = document.createElement('div');
        empty.className = 'sp-empty';
        empty.textContent = 'Premi un tipo di riga sopra per iniziare a scrivere la scena.';
        sp.appendChild(empty);
      }
      sc.blocks.forEach((blk, bi) => {
        const ta = document.createElement('textarea');
        ta.className = 'sp-block sp-' + blk.type;
        ta.rows = 1;
        ta.value = blk.text || '';
        ta.placeholder = BLOCK_PH[blk.type] || '';
        ta.dataset.bi = bi;
        autoGrow(ta);
        ta.addEventListener('input', function(){
          const pp = getProject(currentId); if(!pp) return;
          pp.scenes[i].blocks[bi].text = (blk.type==='heading'||blk.type==='character') ? this.value.toUpperCase() : this.value;
          if(blk.type==='heading'||blk.type==='character'){
            const pos = this.selectionStart;
            this.value = this.value.toUpperCase();
            this.setSelectionRange(pos,pos);
          }
          autoGrow(this);
          scheduleSave(pp);
        });
        // Invio: crea il blocco successivo logico
        ta.addEventListener('keydown', function(e){
          if(e.key === 'Enter' && !e.shiftKey){
            e.preventDefault();
            const nextType = nextBlockType(blk.type);
            addBlock(i, nextType, bi+1);
          }
          // Backspace su blocco vuoto: elimina
          if(e.key === 'Backspace' && this.value === ''){
            e.preventDefault();
            removeBlock(i, bi);
          }
        });
        sp.appendChild(ta);
      });
      body.appendChild(sp);

      // Elimina scena
      const del = document.createElement('button');
      del.className = 'seq-del-scene';
      del.textContent = 'Elimina scena';
      del.onclick = () => deleteSeqScene(i);
      body.appendChild(del);

      card.appendChild(body);
    }

    wrap.appendChild(card);
  });

  attachSceneDrag(p);
  // Focus sull'ultimo blocco appena creato
  if(window._seqFocusBlock != null){
    const sel = `.seq-scene[data-idx="${window._seqFocusScene}"] .sp-block[data-bi="${window._seqFocusBlock}"]`;
    const el = document.querySelector(sel);
    if(el){ el.focus(); }
    window._seqFocusBlock = null; window._seqFocusScene = null;
  }
}

// Dopo character viene dialog; dopo dialog viene action; resto action
function nextBlockType(t){
  if(t === 'character') return 'dialog';
  if(t === 'paren') return 'dialog';
  if(t === 'dialog') return 'action';
  if(t === 'heading') return 'action';
  return 'action';
}

function addBlock(sceneIdx, type, at){
  const p = getProject(currentId); if(!p || !p.scenes) return;
  const sc = p.scenes[sceneIdx];
  if(!sc.blocks) sc.blocks = [];
  const blk = { type, text:'' };
  const pos = (at != null) ? at : sc.blocks.length;
  sc.blocks.splice(pos, 0, blk);
  window._seqFocusScene = sceneIdx;
  window._seqFocusBlock = pos;
  scheduleSave(p);
  renderSeqScenes(p);
}

function removeBlock(sceneIdx, bi){
  const p = getProject(currentId); if(!p || !p.scenes) return;
  const sc = p.scenes[sceneIdx];
  if(!sc.blocks) return;
  sc.blocks.splice(bi, 1);
  if(bi > 0){ window._seqFocusScene = sceneIdx; window._seqFocusBlock = bi-1; }
  scheduleSave(p);
  renderSeqScenes(p);
}

export function addSeqScene(){
  const p = getProject(currentId); if(!p) return;
  if(!p.scenes) p.scenes = [];
  // Chiudi le altre, apri la nuova
  p.scenes.forEach(s => s._open = false);
  p.scenes.push({ id:Date.now().toString(), title:'', beat:'', blocks:[], _open:true });
  scheduleSave(p);
  renderSeqScenes(p);
  renderSeqSpine(p);
}

export function deleteSeqScene(i){
  const p = getProject(currentId); if(!p || !p.scenes) return;
  p.scenes.splice(i, 1);
  scheduleSave(p);
  renderSeqScenes(p);
  renderSeqSpine(p);
}

// ── Spina dorsale: mini-timeline dei beat ──
export function renderSeqSpine(p){
  const spine = document.getElementById('seq-spine');
  if(!spine) return;
  if(!p.scenes || p.scenes.length === 0){
    spine.innerHTML = '';
    spine.style.display = 'none';
    return;
  }
  spine.style.display = 'block';
  let html = '<div class="spine-track">';
  p.scenes.forEach((sc, i) => {
    const label = sc.title || `Scena ${i+1}`;
    const beat = sc.beat || '';
    html += `<div class="spine-node" onclick="openSeqScene(${i})">
      <div class="spine-dot">${i+1}</div>
      <div class="spine-label">${escapeHtml(label)}</div>
      ${beat ? `<div class="spine-beat">${escapeHtml(beat)}</div>` : ''}
    </div>`;
    if(i < p.scenes.length - 1) html += '<div class="spine-link"></div>';
  });
  html += '</div>';
  spine.innerHTML = html;
}

export function openSeqScene(i){
  const p = getProject(currentId); if(!p || !p.scenes) return;
  p.scenes.forEach((s, idx) => s._open = (idx === i));
  renderSeqScenes(p);
  const el = document.querySelector(`.seq-scene[data-idx="${i}"]`);
  if(el) el.scrollIntoView({behavior:'smooth', block:'center'});
}

// ── Vista lettura (manoscritto) ──
export function openReadMode(){
  const p = getProject(currentId); if(!p || !p.scenes) return;
  const screen = document.getElementById('screen-read');
  if(!screen) return;
  const body = document.getElementById('read-body');
  const titleEl = document.getElementById('read-proj-title');
  if(titleEl) titleEl.textContent = p.title || '';
  let html = '';
  p.scenes.forEach((sc, i) => {
    if(i > 0) html += '<div class="read-sep">✦</div>';
    html += `<div class="read-scene">
      <div class="read-num">Scena ${i+1}</div>
      <div class="read-title">${escapeHtml(sc.title) || 'Senza titolo'}</div>
      <div class="read-screenplay">`;
    (sc.blocks||[]).forEach(blk => {
      const txt = escapeHtml(blk.text || '');
      if(!txt) return;
      html += `<div class="rsp rsp-${blk.type}">${txt}</div>`;
    });
    html += `</div></div>`;
  });
  if(!p.scenes.length) html = '<div style="text-align:center;color:var(--ink3);padding:40px 0">Nessuna scena ancora.</div>';
  body.innerHTML = html;
  document.getElementById('screen-project').classList.remove('active');
  screen.classList.add('active');
}

export function closeReadMode(){
  const screen = document.getElementById('screen-read');
  if(screen) screen.classList.remove('active');
  document.getElementById('screen-project').classList.add('active');
}

// ── Personaggi della sequenza (riusa il modello semplice) ──
export function addSeqCharacter(){
  const p = getProject(currentId); if(!p) return;
  if(!p.seqChars) p.seqChars = [];
  p.seqChars.push({ id:Date.now().toString(), name:'', desc:'' });
  scheduleSave(p);
  renderSeqCharacters(p);
}

export function renderSeqCharacters(p){
  const list = document.getElementById('seq-chars-list');
  if(!list) return;
  if(!p.seqChars) p.seqChars = [];
  list.innerHTML = '';
  p.seqChars.forEach((c, i) => {
    const card = document.createElement('div');
    card.className = 'char-card-v2';
    card.style.margin = '0 14px 10px';
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div class="char-avatar" style="background:${charColor(i)}">${(c.name||'?').charAt(0).toUpperCase()}</div>
        <input type="text" class="char-name-input" placeholder="Nome" value="${escapeAttr(c.name)}" style="flex:1;background:none;border:none;outline:none;font-family:'Nunito',sans-serif;font-size:14px;font-weight:700;color:var(--ink)">
        <button class="scene-write-del" style="font-size:18px">×</button>
      </div>
      <div class="char-divider"></div>
      <textarea class="char-desc-v2" placeholder="Descrizione…">${escapeHtml(c.desc)}</textarea>`;
    const nameIn = card.querySelector('.char-name-input');
    nameIn.addEventListener('input', function(){
      const pp = getProject(currentId); if(!pp) return;
      pp.seqChars[i].name = this.value;
      const av = card.querySelector('.char-avatar');
      if(av) av.textContent = (this.value||'?').charAt(0).toUpperCase();
      scheduleSave(pp);
    });
    const desc = card.querySelector('.char-desc-v2');
    desc.addEventListener('input', function(){
      const pp = getProject(currentId); if(!pp) return;
      pp.seqChars[i].desc = this.value;
      this.style.height='auto'; this.style.height=this.scrollHeight+'px';
      scheduleSave(pp);
    });
    requestAnimationFrame(()=>{ desc.style.height='auto'; desc.style.height=desc.scrollHeight+'px'; });
    card.querySelector('.scene-write-del').onclick = () => {
      const pp = getProject(currentId); if(!pp) return;
      pp.seqChars.splice(i,1); scheduleSave(pp); renderSeqCharacters(pp);
    };
    list.appendChild(card);
  });
}

// ── Drag riordino scene (solo dalla maniglia, pointer events) ──
function attachSceneDrag(p){
  const handles = document.querySelectorAll('#seq-scenes .seq-handle');
  handles.forEach(handle => {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      const card = handle.closest('.seq-scene');
      if(!card) return;
      const fromIdx = parseInt(card.dataset.idx);
      card.classList.add('seq-dragging');
      let moved = false;
      function onMove(ev){
        moved = true;
        const below = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = below && below.closest && below.closest('.seq-scene');
        document.querySelectorAll('.seq-scene').forEach(c => c.classList.remove('seq-drop'));
        if(over && over !== card) over.classList.add('seq-drop');
      }
      function onUp(ev){
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        card.classList.remove('seq-dragging');
        document.querySelectorAll('.seq-scene').forEach(c => c.classList.remove('seq-drop'));
        if(!moved) return;
        const below = document.elementFromPoint(ev.clientX, ev.clientY);
        const over = below && below.closest && below.closest('.seq-scene');
        if(!over || over === card) return;
        const toIdx = parseInt(over.dataset.idx);
        const pp = getProject(currentId); if(!pp || !pp.scenes) return;
        const moved0 = pp.scenes.splice(fromIdx, 1)[0];
        pp.scenes.splice(toIdx, 0, moved0);
        scheduleSave(pp);
        renderSeqScenes(pp);
        renderSeqSpine(pp);
      }
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
  });
}

// ── utility ──
function autoGrow(ta){
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight) + 'px';
}
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeAttr(s){
  if(!s) return '';
  return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}
function charColor(i){
  const cols = ['#4ab8d8','#e84848','#48a848','#f0a020','#9a68c8','#e87838'];
  return cols[i % cols.length];
}
