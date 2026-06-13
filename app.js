
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAF5S6pdwlMZ_Lezghu171EpwR2oWW6wbc",
  authDomain: "inkflow-95f2f.firebaseapp.com",
  projectId: "inkflow-95f2f",
  storageBucket: "inkflow-95f2f.firebasestorage.app",
  messagingSenderId: "323774526281",
  appId: "1:323774526281:web:a9365b3136435d69e66098"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const COL = 'projects';
const USER_DOC = 'inkflow_user_data';

// ── USER DATA (stelle + storico) sincronizzati su Firebase ──
async function saveUserData(){
  try{
    const stars = parseInt(localStorage.getItem('inkflow_stars')||'0');
    const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
    const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
    await setDoc(doc(db, 'userdata', USER_DOC), { stars, history, monthly, updatedAt: serverTimestamp() });
  } catch(e){ console.warn('saveUserData error:', e); }
}

function loadUserData(){
  try{
    onSnapshot(doc(db, 'userdata', USER_DOC), snap => {
      if(snap.exists()){
        const data = snap.data();
        const localStars = parseInt(localStorage.getItem('inkflow_stars')||'0');
        const remoteStars = data.stars||0;
        const stars = Math.max(localStars, remoteStars);
        localStorage.setItem('inkflow_stars', stars);
        if(data.history) localStorage.setItem('inkflow_task_history', JSON.stringify(data.history));
        if(data.monthly){
          const localMonthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
          const merged = {...data.monthly};
          Object.entries(localMonthly).forEach(([k,v])=>{ merged[k]=Math.max(merged[k]||0,v); });
          localStorage.setItem('inkflow_monthly_stars', JSON.stringify(merged));
        }
        const el = document.getElementById('stars-count');
        if(el) el.textContent = stars;
      }
    });
  } catch(e){ console.warn('loadUserData error:', e); }
}

// ── STATE ──
let projects = [];
let currentId = null;
let deleteId = null;
let saveTimer = null;

const PHASE_NAMES = ['Sviluppo','Pre-produzione','Realizzazione'];
const PROJECT_PALETTE = [
  {emoji:'🌊',bg:'#4ab8d8',light:'#d0eefc'},
  {emoji:'🔥',bg:'#e84848',light:'#fde0dc'},
  {emoji:'⚡',bg:'#d4a800',light:'#fdf0b0'},
  {emoji:'🌿',bg:'#48a848',light:'#c8ecc8'},
  {emoji:'🌸',bg:'#f06858',light:'#fde8e4'},
  {emoji:'🎯',bg:'#2a88b8',light:'#d0e8f8'},
  {emoji:'🍊',bg:'#e89020',light:'#fdecc8'},
  {emoji:'🌙',bg:'#6888b8',light:'#d8e4f4'},
];

function syncDot(state){
  ['sync-dot','sync-dot-evening'].forEach(id=>{
    const d=document.getElementById(id); if(!d) return;
    d.className='sync-dot '+state;
  });
}
function saveHint(msg){
  const h = document.getElementById('save-hint');
  if(h) h.textContent = msg;
}

// ── MOSTRA HOME SUBITO, FIREBASE IN BACKGROUND ──
function hideLoading(){
  const loading = document.getElementById('loading');
  if(loading && !loading.classList.contains('hidden')){
    loading.classList.add('hidden');
    document.getElementById('screen-home').classList.add('active');
    setTimeout(()=>{ if(loading.parentNode) loading.remove(); }, 400);
  }
}

// Apri subito la home senza aspettare Firebase
hideLoading();

// Poi connetti Firebase in background
onSnapshot(collection(db, COL), snapshot => {
  projects = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
  projects.sort((a,b) => (a.createdAt||0) > (b.createdAt||0) ? 1 : -1);
  syncDot('ok');
  renderHome();
  if(currentId){
    const p = getProject(currentId);
    // Non ridisegnare se l'utente sta scrivendo in un campo
    const active = document.activeElement;
    const isTyping = active && (active.tagName==='INPUT'||active.tagName==='TEXTAREA');
    if(p && !isTyping) restoreProject(p);
  }
}, err => {
  console.error('Firebase error:', err);
  syncDot('error');
});

function getProject(id){ return projects.find(p => p.id === id); }

// ── GEM DRAWING — sfera cristallo incastonata ──
function drawGem(canvas, hex){
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  const cx = s/2, cy = s/2;
  const {r:cr, g:cg, b:cb} = hexToRgb(hex);
  const gr = s/2 * 0.78;

  // Corpo cristallo — traslucido
  const sphere = ctx.createRadialGradient(
    cx - gr*.28, cy - gr*.30, gr*.04,
    cx + gr*.12, cy + gr*.18, gr
  );
  sphere.addColorStop(0,    `rgba(${Math.min(255,cr+90)},${Math.min(255,cg+85)},${Math.min(255,cb+75)},.55)`);
  sphere.addColorStop(0.28, `rgba(${cr},${cg},${cb},.50)`);
  sphere.addColorStop(0.65, `rgba(${Math.max(0,cr-40)},${Math.max(0,cg-38)},${Math.max(0,cb-30)},.60)`);
  sphere.addColorStop(1,    `rgba(${Math.max(0,cr-70)},${Math.max(0,cg-65)},${Math.max(0,cb-55)},.70)`);
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2);
  ctx.fillStyle = sphere; ctx.fill();

  // Riflesso principale — luce che attraversa il cristallo
  const glare = ctx.createRadialGradient(cx-gr*.22, cy-gr*.28, 0, cx-gr*.10, cy-gr*.14, gr*.52);
  glare.addColorStop(0,   'rgba(255,255,255,.82)');
  glare.addColorStop(0.25,'rgba(255,255,255,.45)');
  glare.addColorStop(0.6, 'rgba(255,255,255,.10)');
  glare.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle = glare; ctx.fillRect(0,0,s,s);
  ctx.restore();

  // Riflesso secondario in basso a destra
  const glare2 = ctx.createRadialGradient(cx+gr*.30, cy+gr*.28, 0, cx+gr*.28, cy+gr*.26, gr*.22);
  glare2.addColorStop(0,   'rgba(255,255,255,.35)');
  glare2.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle = glare2; ctx.fillRect(0,0,s,s);
  ctx.restore();

  // Alone incastonatura
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,0,0,.42)';
  ctx.lineWidth = s * 0.058;
  ctx.stroke();
}
function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return{r,g,b};
}
function lighten(hex,amt=60){
  const {r,g,b}=hexToRgb(hex);
  return `rgb(${Math.min(255,r+amt)},${Math.min(255,g+amt)},${Math.min(255,b+amt)})`;
}
function darken(hex,amt=40){
  const {r,g,b}=hexToRgb(hex);
  return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
}

// ── PDF EXPORT ──
function exportPDF(){
  const p = getProject(currentId); if(!p) return;
  const color = p.color||'#4ab8d8';
  const tavDone = Object.values(p.tavole||{}).filter(v=>v>=4).length;
  const pct = calcPct(p);
  const phase = PHASE_NAMES[getPhaseIndex(p)];
  const v = calcVelocity(p);
  const daysLeft = calcDaysLeft(p);
  const countdownStr = daysLeft===null ? '—' : daysLeft<0 ? ('Scaduto da '+Math.abs(daysLeft)+' giorni') : (daysLeft+' giorni mancanti');

  const TAV_L=['Matite','Inchiostro','Retini','Balloon','Finita'];

  // Build parts as strings safely
  let body = '';

  // Header
  body += '<div style="border-bottom:4px solid '+color+';padding-bottom:16px;margin-bottom:24px">';
  body += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">';
  body += '<div><div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;margin-bottom:4px">Inkflow · Report progetto</div>';
  body += '<div style="font-size:32px;font-weight:700;color:#222;line-height:1.1">'+p.title+'</div>';
  body += '<div style="font-size:13px;color:#888;margin-top:6px">'+(p.createdAt||'')+' · '+p.numTav+' tavole · '+phase+'</div></div>';
  body += '<div style="background:'+color+';width:48px;height:48px;border-radius:50%;flex-shrink:0"></div></div></div>';

  // Stats
  body += '<div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">';
  const stats = [['Avanzamento',pct+'%',color],['Tavole finite',tavDone+' / '+p.numTav,'#48a848'],['Tav/sett',v.actual,'#4ab8d8'],['Deadline',countdownStr,'#888']];
  stats.forEach(function(s){
    body += '<div style="flex:1;min-width:110px;background:#fafafa;border-radius:10px;padding:10px 12px;border-left:3px solid '+s[2]+'">';
    body += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#aaa;margin-bottom:3px">'+s[0]+'</div>';
    body += '<div style="font-size:16px;font-weight:700;color:'+s[2]+'">'+s[1]+'</div></div>';
  });
  body += '</div>';

  // Deadline dates
  if(p.dateStart||p.dateEnd){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Deadline</div>';
    body += '<div style="display:flex;gap:20px;font-size:13px;color:#444">';
    if(p.dateStart) body += '<div>Inizio: <strong>'+p.dateStart+'</strong></div>';
    if(p.dateEnd) body += '<div>Fine: <strong>'+p.dateEnd+'</strong></div>';
    body += '</div></div>';
  }

  // Soggetto
  if(p.story&&p.story.soggetto){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Soggetto</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+p.story.soggetto+'</div></div>';
  }

  // 3-act structure
  if(p.story&&p.story.acts){
    const actColors={setup:'#4ab8d8',confrontation:'#f0c020',resolution:'#48a848'};
    const actLabels={setup:'Setup',confrontation:'Confrontation',resolution:'Resolution'};
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Struttura a 3 atti</div>';
    ['setup','confrontation','resolution'].forEach(function(actId,i){
      const scenes=(p.story.acts[actId]||[]).filter(function(s){return s.trim();});
      const ac=actColors[actId];
      body += '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:'+ac+';margin-bottom:4px">'+actLabels[actId]+'</div>';
      scenes.forEach(function(s){
        body += '<div style="padding:5px 10px;border-left:3px solid '+ac+';margin-bottom:3px;font-size:13px;color:#444;background:#fafafa">'+s+'</div>';
      });
      if(i<2) body += '<div style="text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#e84848;margin:6px 0">— Plot Point '+(i+1)+' —</div>';
      body += '</div>';
    });
    body += '</div>';
  }

  // Pipeline
  body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Pipeline</div>';
  [['Sviluppo',['Moodboard visiva','Soggetto','Struttura a 3 atti']],['Pre-produzione',['Layouts','Reference']]].forEach(function(fase){
    body += '<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#aaa;margin-bottom:3px">'+fase[0]+'</div>';
    fase[1].forEach(function(item){
      const done=!!(p.steps&&p.steps[item.slice(0,30)]);
      body += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0">';
      body += '<div style="width:14px;height:14px;border-radius:50%;background:'+(done?color:'#e8e8e8')+';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff">'+(done?'✓':'')+'</div>';
      body += '<span style="font-size:13px;color:'+(done?'#aaa':'#333')+';'+(done?'text-decoration:line-through':'')+'">'+item+'</span></div>';
    });
    body += '</div>';
  });
  body += '</div>';

  // Tavole
  body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Realizzazione</div>';
  body += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#fafafa"><th style="padding:5px 8px;text-align:left;color:#aaa">#</th>';
  TAV_L.forEach(function(l){ body += '<th style="padding:5px 8px;text-align:center;color:#aaa;font-size:10px">'+l+'</th>'; });
  body += '</tr></thead><tbody>';
  for(let i=1;i<=p.numTav;i++){
    const stage=p.tavole&&p.tavole[i]!=null?p.tavole[i]:0;
    body += '<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:4px 8px;font-weight:600;color:'+color+'">'+i+'</td>';
    TAV_L.forEach(function(_,li){
      const bg=li<stage?color:li===stage&&stage<4?color+'44':'#f0f0f0';
      body += '<td style="padding:4px 8px;text-align:center"><div style="width:16px;height:16px;border-radius:50%;background:'+bg+';margin:0 auto;font-size:9px;color:#fff;display:flex;align-items:center;justify-content:center">'+(li<stage?'✓':'')+'</div></td>';
    });
    body += '</tr>';
  }
  body += '</tbody></table></div>';

  // Sfide
  if((p.sfide||[]).length>0){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Sfide visive</div>';
    p.sfide.forEach(function(s){
      body += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;align-items:center">';
      body += '<div style="width:14px;height:14px;border-radius:50%;background:'+(s.done?color:'#e8e8e8')+';flex-shrink:0;font-size:9px;color:#fff;display:flex;align-items:center;justify-content:center">'+(s.done?'✓':'')+'</div>';
      body += '<span style="font-size:13px;color:'+(s.done?'#aaa':'#333')+';'+(s.done?'text-decoration:line-through':'')+'">'+s.text+'</span>';
      body += '<span style="margin-left:auto;font-size:10px;color:'+(s.ref?color:'#aaa')+'">'+(s.ref?'ref ✓':'ref?')+'</span></div>';
    });
    body += '</div>';
  }

  // Notes
  if(p.notes){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Note</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+p.notes+'</div></div>';
  }

  // Footer
  body += '<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10px;color:#ccc"><span>Inkflow</span><span>Generato il '+new Date().toLocaleDateString('it-IT')+'</span></div>';

  const win = window.open('','_blank');
  if(!win){alert('Abilita i popup per esportare il PDF');return;}
  win.document.open();
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+p.title+' — Inkflow</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;color:#222;background:#fff;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div style="max-width:680px;margin:0 auto;padding:32px 28px">'+body+'</div></body></html>');
  win.document.close();
  setTimeout(function(){win.print();},600);
}

async function saveProject(p){
  syncDot('saving');
  saveHint('Salvataggio…');
  try{
    const {id, ...data} = p;
    await setDoc(doc(db, COL, id), {...data, updatedAt: serverTimestamp()});
    syncDot('ok');
    saveHint('Sincronizzato ☁️');
  } catch(e){
    syncDot('error');
    saveHint('Errore salvataggio');
    console.error(e);
  }
}

function scheduleSave(p){
  clearTimeout(saveTimer);
  syncDot('saving');
  saveTimer = setTimeout(() => saveProject(p), 800);
}

function newProjectObj(title, numTav){
  const idx = projects.length % PROJECT_PALETTE.length;
  const pal = PROJECT_PALETTE[idx];
  return {
    id: Date.now().toString(),
    title: title||'Nuovo progetto',
    numTav: parseInt(numTav)||10,
    microtask:'', steps:{}, tavole:{}, sfide:[], notes:'',
    selectedTav: null, dateStart:'', dateEnd:'',
    emoji: pal.emoji, color: pal.bg, colorLight: pal.light,
    createdAt: Date.now()
  };
}

// ── HOME ──
function renderHome(){
  const scroll = document.getElementById('home-scroll');
  scroll.querySelectorAll('.project-card').forEach(c => c.remove());
  const newBtn = scroll.querySelector('.new-btn');
  projects.forEach(p => {
    const pct = calcPct(p);
    const phIdx = getPhaseIndex(p);
    const daysLeft = calcDaysLeft(p);
    const dStr = daysLeft!==null?(daysLeft<0?`${Math.abs(daysLeft)}gg scaduto`:`${daysLeft}gg`):'';
    const bgColor = p.color||'#4ab8d8';
    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.borderLeft = `4px solid ${bgColor}`;
    // Draw PS1-style gem on canvas
    const gemCanvas = document.createElement('canvas');
    gemCanvas.width=76; gemCanvas.height=76;
    gemCanvas.style.cssText='width:38px;height:38px;border-radius:50%;flex-shrink:0;';
    // Riempi il canvas con il colore della card prima di disegnare
    const gCtx = gemCanvas.getContext('2d');
    gCtx.fillStyle = '#fefcf8';
    gCtx.fillRect(0,0,76,76);
    drawGem(gemCanvas, bgColor);
    const cardInner = document.createElement('div');
    cardInner.style.cssText='display:flex;align-items:center;gap:14px;flex:1;min-width:0';
    cardInner.innerHTML=`
      <div class="card-info">
        <div class="card-title">${p.title}</div>
        <div class="card-meta">${PHASE_NAMES[phIdx]} · ${p.numTav} tavole${dStr?' · ⏱ '+dStr:''}</div>
      </div>
      <div class="card-right">
        <div class="card-pct" style="color:${bgColor}">${pct}%</div>
      </div>`;
    card.appendChild(gemCanvas);
    card.appendChild(cardInner);
    card.onclick = () => openProject(p.id);
    scroll.insertBefore(card, newBtn);
  });
}

function goHome(){
  document.getElementById('screen-project').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
}

// ── DELETE ──
function confirmDeleteCurrent(){
  const p = getProject(currentId); if(!p) return;
  deleteId = currentId;
  document.getElementById('confirm-text').textContent = `Eliminare "${p.title}"? L'operazione non è reversibile.`;
  document.getElementById('confirm-modal').classList.add('open');
}
function closeConfirm(){ document.getElementById('confirm-modal').classList.remove('open'); deleteId=null; }
document.getElementById('confirm-ok').onclick = async () => {
  if(!deleteId) return;
  const wasCurrentProject = deleteId === currentId;
  try{
    await deleteDoc(doc(db, COL, deleteId));
  } catch(e){ console.error(e); }
  closeConfirm();
  if(wasCurrentProject) goHome();
};
document.getElementById('confirm-modal').addEventListener('click', e => { if(e.target===e.currentTarget) closeConfirm(); });

// ── MODAL NUOVO ──
function openNewModal(){
  document.getElementById('new-title').value='';
  document.getElementById('new-tav').value='10';
  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.getElementById('new-title').focus(),200);
}
function closeModal(){ document.getElementById('modal').classList.remove('open'); }
async function createProject(){
  const title = document.getElementById('new-title').value.trim()||'Nuovo progetto';
  const tav = document.getElementById('new-tav').value;
  const p = newProjectObj(title, tav);
  closeModal();
  await saveProject(p);
  openProject(p.id);
}
document.getElementById('modal').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
document.getElementById('new-title').addEventListener('keydown', e => { if(e.key==='Enter') createProject(); });

// ── PROJECT ──
function openProject(id){
  currentId = id;
  const p = getProject(id);
  if(!p) return;
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-project').classList.add('active');
  restoreProject(p);
}

function restoreProject(p){
  document.getElementById('proj-title').value = p.title||'';
  document.getElementById('meta-tav').textContent = p.numTav;
  document.getElementById('microtask').value = p.microtask||'';
  const mcBtn = document.getElementById('microtask-confirm-btn');
  if(mcBtn) mcBtn.style.opacity = (p.microtask&&p.microtask.trim()) ? '1' : '.4';
  document.getElementById('notes').value = p.notes||'';
  document.getElementById('date-start').value = p.dateStart||'';
  document.getElementById('date-end').value = p.dateEnd||'';
  document.querySelectorAll('.step-item').forEach(el => {
    const chk = el.querySelector('.step-chk');
    const nm = el.querySelector('.step-nm');
    const key = nm.textContent.trim().slice(0,30);
    const done = !!(p.steps && p.steps[key]);
    chk.classList.toggle('done', done);
    nm.classList.toggle('done', done);
  });
  renderTavole(p); renderSfide(p); updateProgress(p); renderDeadline(p); renderVelocity(p); restoreStoryFields(p); restorePlanner(p);
  requestAnimationFrame(() => renderVelocityHistory(p));
}

function togglePhase(id){
  const body=document.getElementById(id+'-body');
  const chev=document.getElementById(id+'-chev');
  const open=body.classList.contains('open');
  body.classList.toggle('open',!open); chev.classList.toggle('open',!open);
}

function toggleStep(el){
  const p=getProject(currentId); if(!p) return;
  const chk=el.querySelector('.step-chk');
  const nm=el.querySelector('.step-nm');
  const isDone=chk.classList.contains('done');
  chk.classList.toggle('done',!isDone); nm.classList.toggle('done',!isDone);
  const key=nm.textContent.trim().slice(0,30);
  if(!p.steps) p.steps={};
  p.steps[key]=!isDone;
  scheduleSave(p); updateProgress(p);
}

// ── TAVOLE ──
const TAV_LABELS=['Matite','Inchiostro','Retini','Balloon','Finita'];

function renderTavole(p){
  const grid=document.getElementById('tav-grid'); grid.innerHTML='';
  for(let i=1;i<=p.numTav;i++){
    const stage=p.tavole&&p.tavole[i]!=null?p.tavole[i]:0;
    const btn=document.createElement('div');
    btn.className='tav-btn'+(p.selectedTav===i?' sel':'')+(stage>=4?' done-t':'');
    btn.innerHTML=`<div class="tav-n">${i}</div><div class="tav-s">${TAV_LABELS[stage]}</div>`;
    btn.onclick=()=>selectTav(i); grid.appendChild(btn);
  }
  renderTavDetail(p);
}
function selectTav(n){
  const p=getProject(currentId); if(!p) return;
  p.selectedTav=p.selectedTav===n?null:n;
  renderTavole(p);
}
function renderTavDetail(p){
  const det=document.getElementById('tav-detail');
  if(!p.selectedTav){det.classList.remove('open');return;}
  det.classList.add('open');
  document.getElementById('tav-detail-title').textContent='Tavola '+p.selectedTav;
  const pills=document.getElementById('tav-pills'); pills.innerHTML='';
  const current=p.tavole&&p.tavole[p.selectedTav]!=null?p.tavole[p.selectedTav]:0;
  TAV_LABELS.forEach((lbl,i)=>{
    const pill=document.createElement('div');
    pill.className='tav-pill'+(i===current?' sel-p':'')+(i<current?' done-p':'');
    pill.textContent=lbl;
    pill.onclick=()=>{
      if(!p.tavole) p.tavole={};
      const prevStage = p.tavole[p.selectedTav] || 0;
      const newStage = i;
      p.tavole[p.selectedTav]=i;
      // Registra/rimuovi dal velocity log
      if(newStage >= 4 && prevStage < 4) recordTavola(p, p.selectedTav);
      if(newStage < 4 && prevStage >= 4) removeTavola(p, p.selectedTav);
      scheduleSave(p); renderTavole(p); updateProgress(p); renderVelocity(p); renderVelocityHistory(p);
    };
    pills.appendChild(pill);
  });
}

// ── SFIDE ──
function renderSfide(p){
  const list=document.getElementById('sfide-list'); list.innerHTML='';
  (p.sfide||[]).forEach((s,i)=>{
    const row=document.createElement('div'); row.className='sfida-row';
    row.innerHTML=`<div class="step-chk ${s.done?'done':''}">✓</div><div class="sfida-text ${s.done?'done':''}">${s.text}</div><button class="sfida-ref ${s.ref?'yes':'no'}" onclick="window._toggleRef(${i})">${s.ref?'ref ✓':'ref?'}</button><button class="sfida-rm" onclick="window._removeSfida(${i})">×</button>`;
    row.querySelector('.step-chk').onclick=()=>window._toggleSfidaDone(i);
    list.appendChild(row);
  });
}
function addSfida(){
  const p=getProject(currentId); if(!p) return;
  const text=prompt('Elemento nuovo da disegnare:');
  if(!text||!text.trim()) return;
  if(!p.sfide) p.sfide=[];
  p.sfide.push({text:text.trim(),done:false,ref:false});
  scheduleSave(p); renderSfide(p);
}
window._toggleSfidaDone=i=>{const p=getProject(currentId);if(!p||!p.sfide)return;p.sfide[i].done=!p.sfide[i].done;scheduleSave(p);renderSfide(p);};
window._toggleRef=i=>{const p=getProject(currentId);if(!p||!p.sfide)return;p.sfide[i].ref=!p.sfide[i].ref;scheduleSave(p);renderSfide(p);};
window._removeSfida=i=>{const p=getProject(currentId);if(!p||!p.sfide)return;p.sfide.splice(i,1);scheduleSave(p);renderSfide(p);};

const ACT_CONFIG=[
  {id:'setup',     label:'Setup',        color:'#4ab8d8',light:'#d0eefc', pp_after:'Plot Point 1', inciting:true},
  {id:'confrontation',label:'Confrontation',color:'#f0c020',light:'#fdf0b0',pp_after:'Plot Point 2', inciting:false},
  {id:'resolution',label:'Resolution',   color:'#48a848',light:'#c8ecc8', pp_after:null,            inciting:false},
];

function saveStoryField(field,value){
  const p=getProject(currentId);if(!p)return;
  if(!p.story)p.story={};
  p.story[field]=value;
  scheduleSave(p);
}

function updateCharCount(elId,value,max){
  const el=document.getElementById(elId);
  if(el) el.textContent=`${value.length} / ${max}`;
}

function restoreStoryFields(p){
  const soggetto=document.getElementById('soggetto-text');
  if(soggetto){
    soggetto.value=(p.story&&p.story.soggetto)||'';
    updateCharCount('soggetto-count',soggetto.value,800);
  }
  renderActBoard(p);
  restoreWorldFields(p);
}

function renderActBoard(p){
  const board=document.getElementById('act-board');
  if(!board)return;
  if(!p.story)p.story={};
  if(!p.story.acts) p.story.acts={setup:[],confrontation:[],resolution:[]};
  if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};

  board.innerHTML='';
  ACT_CONFIG.forEach((act,ai)=>{
    const scenes=p.story.acts[act.id]||[];

    const col=document.createElement('div');
    col.className='act-col';
    col.style.borderColor=act.color+'66';

    // Header
    const hdr=document.createElement('div');
    hdr.className='act-col-header';
    hdr.style.cssText=`background:${act.light};color:${act.color}`;
    hdr.innerHTML=`<span>${act.label}</span><span style="font-size:10px;font-weight:500;opacity:.7">${scenes.length} scene</span>`;
    col.appendChild(hdr);

    // Inciting Incident field (solo in Setup) — costruito via DOM
    if(act.inciting){
      const inc=document.createElement('div');
      inc.style.cssText='padding:8px 12px 4px;';
      const incLabel=document.createElement('div');
      incLabel.style.cssText=`font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${act.color};margin-bottom:4px`;
      incLabel.textContent='Inciting Incident';
      const incTa=document.createElement('textarea');
      incTa.className='story-textarea';
      incTa.style.cssText='font-size:12px;min-height:44px;';
      incTa.placeholder="L'evento che mette in moto la storia…";
      incTa.value=p.story.pp.inciting||'';
      incTa.addEventListener('input', function(){
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp.inciting=this.value;
        scheduleSave(p);
      });
      inc.appendChild(incLabel);
      inc.appendChild(incTa);
      col.appendChild(inc);
    }

    // Scene body — costruita senza innerHTML per evitare il bug focus
    const body=document.createElement('div');
    body.className='act-col-body';
    body.id='act-body-'+act.id;
    body.dataset.act=act.id;

    scenes.forEach((sc,i)=>{
      body.appendChild(makeSceneCard(act.id, i, sc, p));
    });

    const addBtn=document.createElement('button');
    addBtn.className='add-scene-btn';
    addBtn.textContent='+ aggiungi scena';
    addBtn.onclick=()=>addScene(act.id);
    body.appendChild(addBtn);
    col.appendChild(body);
    board.appendChild(col);

    // Plot Point divider con campo di testo — costruito via DOM
    if(act.pp_after){
      const ppKey = ai===0 ? 'pp1' : 'pp2';
      const div=document.createElement('div');
      div.className='plot-point-divider';
      div.style.flexDirection='column';
      div.style.alignItems='stretch';
      div.style.gap='6px';
      const ppHeader=document.createElement('div');
      ppHeader.style.cssText='display:flex;align-items:center;gap:8px';
      ppHeader.innerHTML=`<div style="flex:1;height:1.5px;background:var(--coral);opacity:.5"></div><div class="plot-point-label">⬡ ${act.pp_after}</div><div style="flex:1;height:1.5px;background:var(--coral);opacity:.5"></div>`;
      const ppTa=document.createElement('textarea');
      ppTa.className='story-textarea';
      ppTa.style.cssText='font-size:12px;min-height:44px;';
      ppTa.placeholder=`Descrivi il ${act.pp_after}…`;
      ppTa.value=p.story.pp[ppKey]||'';
      ppTa.addEventListener('input', function(){
        if(!p.story.pp) p.story.pp={pp1:'',pp2:'',inciting:''};
        p.story.pp[ppKey]=this.value;
        scheduleSave(p);
      });
      div.appendChild(ppHeader);
      div.appendChild(ppTa);
      board.appendChild(div);
    }
  });

  attachDrag(p);
}

function makeSceneCard(actId, idx, text, p){
  const card=document.createElement('div');
  card.className='scene-card';
  card.draggable=true;
  card.dataset.act=actId;
  card.dataset.idx=idx;

  const handle=document.createElement('span');
  handle.className='scene-handle';
  handle.textContent='⠿';

  // Textarea costruita via DOM — evita il bug del focus con innerHTML
  const ta=document.createElement('textarea');
  ta.className='scene-text';
  ta.rows=2;
  ta.placeholder='Descrivi la scena…';
  ta.value=text||'';
  ta.addEventListener('input', function(){
    autoResize(this);
    if(!p.story||!p.story.acts)return;
    p.story.acts[actId][idx]=this.value;
    scheduleSave(p);
  });

  const del=document.createElement('button');
  del.className='scene-del';
  del.textContent='×';
  del.onclick=()=>deleteScene(actId,idx);

  card.appendChild(handle);
  card.appendChild(ta);
  card.appendChild(del);
  return card;
}

function autoResize(el){
  el.style.height='auto';
  el.style.height=el.scrollHeight+'px';
}

function addScene(actId){
  const p=getProject(currentId);if(!p)return;
  if(!p.story)p.story={};
  if(!p.story.acts)p.story.acts={setup:[],confrontation:[],resolution:[]};
  p.story.acts[actId].push('');
  scheduleSave(p);
  // Aggiungi la card senza fare re-render completo — evita il bug focus
  const body=document.getElementById('act-body-'+actId);
  if(body){
    const addBtn=body.querySelector('.add-scene-btn');
    const idx=p.story.acts[actId].length-1;
    const card=makeSceneCard(actId,idx,'',p);
    body.insertBefore(card,addBtn);
    card.querySelector('.scene-text').focus();
  }
  // Aggiorna contatore scene nell'header
  const hdr=body.closest('.act-col').querySelector('.act-col-header span:last-child');
  if(hdr) hdr.textContent=p.story.acts[actId].length+' scene';
}

function updateScene(actId,idx,value){
  const p=getProject(currentId);if(!p||!p.story||!p.story.acts)return;
  p.story.acts[actId][idx]=value;
  scheduleSave(p);
}

function deleteScene(actId,idx){
  const p=getProject(currentId);if(!p||!p.story||!p.story.acts)return;
  p.story.acts[actId].splice(idx,1);
  scheduleSave(p);renderActBoard(p);
}

function attachDrag(p){
  let dragAct=null,dragIdx=null;
  document.querySelectorAll('.scene-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{
      dragAct=card.dataset.act; dragIdx=parseInt(card.dataset.idx);
      setTimeout(()=>card.classList.add('dragging'),0);
    });
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
  });
  document.querySelectorAll('.act-col-body').forEach(body=>{
    body.addEventListener('dragover',e=>{e.preventDefault();});
    body.addEventListener('drop',e=>{
      e.preventDefault();
      if(dragAct===null||dragIdx===null)return;
      const targetAct=body.dataset.act;
      const cards=[...body.querySelectorAll('.scene-card')];
      let dropIdx=cards.length;
      cards.forEach((c,i)=>{
        const rect=c.getBoundingClientRect();
        if(e.clientY<rect.top+rect.height/2) dropIdx=Math.min(dropIdx,i);
      });
      if(!p.story||!p.story.acts)return;
      const scene=p.story.acts[dragAct].splice(dragIdx,1)[0];
      p.story.acts[targetAct].splice(dropIdx,0,scene);
      dragAct=null;dragIdx=null;
      scheduleSave(p);renderActBoard(p);
    });
  });
}
function calcDaysLeft(p){
  if(!p.dateEnd) return null;
  const end=new Date(p.dateEnd); const now=new Date();
  now.setHours(0,0,0,0); end.setHours(0,0,0,0);
  return Math.round((end-now)/(1000*60*60*24));
}
function saveDates(){
  const p=getProject(currentId); if(!p) return;
  p.dateStart=document.getElementById('date-start').value;
  p.dateEnd=document.getElementById('date-end').value;
  scheduleSave(p); renderDeadline(p); renderVelocity(p);
}
function renderDeadline(p){
  const box=document.getElementById('countdown-box');
  const days=calcDaysLeft(p);
  if(days===null){box.innerHTML='<div style="font-size:12px;color:var(--ink3);font-weight:500">Imposta una deadline per vedere il countdown</div>';return;}
  const absDays=Math.abs(days);
  const weeks=Math.floor(absDays/7); const remDays=absDays%7;
  const cls=days<0?'urgent':days<14?'warn':'ok';
  const label=days<0?'giorni scaduto':'giorni mancanti';
  box.innerHTML=`
    <div class="countdown-pill ${cls}"><div class="countdown-num">${absDays}</div><div class="countdown-unit">${label}</div></div>
    <div class="countdown-pill"><div class="countdown-num" style="color:var(--ink2)">${weeks}</div><div class="countdown-unit">settimane</div></div>
    <div class="countdown-pill"><div class="countdown-num" style="color:var(--ink2)">${remDays}</div><div class="countdown-unit">giorni extra</div></div>`;
}

// ── VELOCITY ──
function calcVelocity(p){
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  if(!p.dateStart) return{tavDone,weeksElapsed:0,actual:0,needed:null};
  const start=new Date(p.dateStart); const now=new Date();
  const weeksElapsed=Math.max(1,Math.round((now-start)/(1000*60*60*24*7)));
  const actual=+(tavDone/weeksElapsed).toFixed(1);
  let needed=null;
  if(p.dateEnd){
    const end=new Date(p.dateEnd);
    const weeksLeft=Math.max(0.5,Math.round((end-now)/(1000*60*60*24*7)));
    needed=+((p.numTav-tavDone)/weeksLeft).toFixed(1);
  }
  return{tavDone,weeksElapsed,actual,needed};
}
function renderVelocity(p){
  const v=calcVelocity(p);
  const cls=v.actual>=2?'good':v.actual>=1?'warn':'bad';
  const neededHtml=v.needed!==null?`<div class="vel-stat"><div class="vel-num ${v.needed>3?'bad':v.needed>2?'warn':'good'}">${v.needed}</div><div class="vel-unit">tav/sett necessarie</div></div>`:'';
  document.getElementById('vel-stats').innerHTML=`
    <div class="vel-stat"><div class="vel-num">${v.tavDone}</div><div class="vel-unit">tavole finite</div></div>
    <div class="vel-stat"><div class="vel-num ${cls}">${v.actual}</div><div class="vel-unit">tav/sett media</div></div>
    <div class="vel-stat"><div class="vel-num">${p.numTav-v.tavDone}</div><div class="vel-unit">rimanenti</div></div>
    ${neededHtml}`;
  const alertEl=document.getElementById('vel-alert');
  if(v.needed!==null){
    const diff=v.needed-v.actual;
    if(diff<=0) alertEl.innerHTML=`<div class="vel-alert ok">✅ Sei in anticipo — ritmo attuale sufficiente per la deadline.</div>`;
    else if(diff<=1) alertEl.innerHTML=`<div class="vel-alert warn">⚠️ Devi aumentare il ritmo di ${diff.toFixed(1)} tav/sett per rispettare la deadline.</div>`;
    else alertEl.innerHTML=`<div class="vel-alert bad">🔴 Sei in ritardo di ${diff.toFixed(1)} tav/sett. Valuta di spostare la deadline.</div>`;
  } else { alertEl.innerHTML=''; }
  drawChart(p,v);
}
function drawChart(p,v){
  const canvas=document.getElementById('chart-canvas');
  const wrap=canvas.parentElement;
  const dpr=window.devicePixelRatio||1;
  const W=Math.max(wrap.clientWidth-4,280);
  const H=80;
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);
  const barH=22; const barY=(H-barH)/2;
  // Background bar
  ctx.fillStyle='#e8e0d0';
  ctx.beginPath(); ctx.roundRect(0,barY,W,barH,11); ctx.fill();
  // Progress fill
  if(v.tavDone>0){
    const pw=Math.round((v.tavDone/p.numTav)*W);
    const grad=ctx.createLinearGradient(0,0,pw,0);
    grad.addColorStop(0,'#e84848'); grad.addColorStop(1,'#f0c020');
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.roundRect(0,barY,pw,barH,11); ctx.fill();
    // Shine
    const shine=ctx.createLinearGradient(0,barY,0,barY+barH*0.5);
    shine.addColorStop(0,'rgba(255,255,255,.22)'); shine.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=shine;
    ctx.beginPath(); ctx.roundRect(2,barY+1,pw-4,barH*0.45,9); ctx.fill();
  }
  // Today marker
  if(p.dateStart&&p.dateEnd){
    const start=new Date(p.dateStart); const end=new Date(p.dateEnd); const now=new Date();
    const pct=Math.min(1,Math.max(0,(now-start)/(end-start)));
    const tx=Math.round(pct*W);
    const lx=Math.min(Math.max(tx,18),W-18);
    ctx.strokeStyle='#2a88b8'; ctx.lineWidth=2; ctx.setLineDash([4,3]);
    ctx.beginPath(); ctx.moveTo(tx,barY-7); ctx.lineTo(tx,barY+barH+7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#2a88b8'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center';
    ctx.fillText('oggi',lx,barY-10);
  }
  // Labels
  ctx.fillStyle='#2a2420'; ctx.font='600 12px sans-serif'; ctx.textAlign='left';
  ctx.fillText(`${v.tavDone} / ${p.numTav} tavole`,4,barY+barH+16);
  ctx.textAlign='right'; ctx.fillStyle='#9a9088';
  ctx.fillText(`${Math.round((v.tavDone/p.numTav)*100)}%`,W-2,barY+barH+16);
}

// ── PROGRESS ──
function calcPct(p){
  const total=5+(p.numTav||10);
  let done=Object.values(p.steps||{}).filter(Boolean).length;
  done+=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  return total?Math.round(done/total*100):0;
}
function getPhaseIndex(p){const d=Object.values(p.steps||{}).filter(Boolean).length;if(d<3)return 0;if(d<5)return 1;return 2;}
function updateProgress(p){
  const pct=calcPct(p);
  const total=5+(p.numTav||10);
  const done=Object.values(p.steps||{}).filter(Boolean).length+Object.values(p.tavole||{}).filter(v=>v>=4).length;
  document.getElementById('prog-fill').style.width=pct+'%';
  document.getElementById('prog-lbl').textContent=done+' / '+total+' step';
  document.getElementById('meta-pct').textContent=pct+'%';
  document.getElementById('meta-fase').textContent=PHASE_NAMES[getPhaseIndex(p)];
  const ph1d=document.querySelectorAll('#ph1 .step-chk.done').length;
  const ph2d=document.querySelectorAll('#ph2 .step-chk.done').length;
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  document.getElementById('ph1-badge').textContent=ph1d===3?'completata ✓':'in corso';
  document.getElementById('ph2-badge').textContent=ph2d===2?'completata ✓':ph1d===3?'in corso':'non iniziata';
  document.getElementById('ph3-badge').textContent=tavDone===p.numTav?'completata ✓':ph1d===3&&ph2d===2?'in corso':'non iniziata';
}

// ── EVENTS ──
document.getElementById('proj-title').addEventListener('input',e=>{const p=getProject(currentId);if(!p)return;p.title=e.target.value;scheduleSave(p);});
document.getElementById('microtask').addEventListener('input',e=>{
  const p=getProject(currentId);if(!p)return;
  p.microtask=e.target.value;
  scheduleSave(p);
  const btn=document.getElementById('microtask-confirm-btn');
  if(btn) btn.style.opacity = e.target.value.trim() ? '1' : '.4';
});
document.getElementById('notes').addEventListener('input',e=>{const p=getProject(currentId);if(!p)return;p.notes=e.target.value;scheduleSave(p);});

// ── EXPOSE GLOBALS ──
window.openNewModal=openNewModal; window.closeModal=closeModal; window.createProject=createProject;
window.goHome=goHome; window.openProject=openProject; window.togglePhase=togglePhase;
window.toggleStep=toggleStep; window.selectTav=selectTav; window.addSfida=addSfida;
window.saveDates=saveDates; window.confirmDeleteCurrent=confirmDeleteCurrent; window.closeConfirm=closeConfirm;
window.exportPDF=exportPDF; window.addScene=addScene; window.updateScene=updateScene;
window.deleteScene=deleteScene; window.autoResize=autoResize; window.saveStoryField=saveStoryField;
window.updateCharCount=updateCharCount; window.saveReminderSettings=saveReminderSettings;
window.testNotification=testNotification; window.updatePlanner=updatePlanner;
window.applyPlanner=applyPlanner; window.openPlannerModal=openPlannerModal;
window.closePlannerModal=closePlannerModal; window.toggleSubsection=toggleSubsection;
window.addCharacter=addCharacter; window.deleteCharacter=deleteCharacter;
window.toggleCharCard=toggleCharCard; window.confirmMicrotask=confirmMicrotask;
window.openSettings=openSettings; window.closeSettings=closeSettings;
window.resetStarsConfirm=resetStarsConfirm; window.closeStarsConfirm=closeStarsConfirm;
window.doResetStars=doResetStars;

// ── EVENING MODE ──
function enterEveningMode(){
  renderEveningList();
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-evening').classList.add('active');
}

function exitEveningMode(){
  document.getElementById('screen-evening').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
}

function renderEveningList(){
  const list = document.getElementById('evening-list');
  list.innerHTML = '';

  // Aggiorna HUD stelle
  const totalStars = parseInt(localStorage.getItem('inkflow_stars')||'0');
  const hudCount = document.getElementById('stars-count');
  if(hudCount) hudCount.textContent = totalStars;

  // Storico task completate
  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  if(history.length > 0){
    const histSection = document.createElement('div');
    histSection.className = 'evening-completed-section';
    histSection.innerHTML = `
      <div class="evening-completed-label">
        <span>Task completate</span>
      </div>
      ${history.slice().reverse().map(h=>`
        <div class="evening-completed-item">
          <span style="color:${h.color||'#4ab8d8'}" class="evening-completed-proj">${h.project}</span>
          <span style="flex:1">${h.task}</span>
          <span style="font-size:10px;opacity:.4">${h.date}</span>
        </div>`).join('')}`;
    list.appendChild(histSection);
  }

  // Task correnti da fare
  const active = projects.filter(p => p.microtask && p.microtask.trim());

  if(active.length === 0 && history.length === 0){
    const empty = document.createElement('div');
    empty.className = 'evening-no-tasks';
    empty.innerHTML = 'Nessun task scritto per stasera.<br>Apri un progetto e scrivi cosa farai.';
    list.appendChild(empty);
    return;
  }

  if(active.length > 0){
    const activeLabel = document.createElement('div');
    activeLabel.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:8px;margin-top:4px';
    activeLabel.textContent = 'Da fare stasera';
    list.appendChild(activeLabel);

    active.forEach(p => {
      const color = p.color || '#4ab8d8';
      const card = document.createElement('div');
      card.className = 'evening-card';
      card.id = 'ecard-'+p.id;

      const gemC = document.createElement('canvas');
      gemC.width = 64; gemC.height = 64;
      gemC.className = 'evening-gem';
      const gCtx = gemC.getContext('2d');
      gCtx.fillStyle = '#0e2a5a';
      gCtx.fillRect(0,0,64,64);
      drawGem(gemC, color);

      const info = document.createElement('div');
      info.className = 'evening-card-info';
      info.innerHTML = `
        <div class="evening-proj-name" style="color:${color}">${p.title}</div>
        <div class="evening-task-text">${p.microtask}</div>`;

      const check = document.createElement('div');
      check.className = 'evening-check';
      check.textContent = '✓';
      check.onclick = () => completeEveningTask(p.id, card);

      card.appendChild(gemC);
      card.appendChild(info);
      card.appendChild(check);
      list.appendChild(card);
    });
  }

  // Pulsante clear in basso al centro — visibile solo se c'è storico
  const history2 = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  if(history2.length > 0){
    const clearBtn = document.createElement('div');
    clearBtn.style.cssText = 'text-align:center;margin-top:20px;padding-bottom:8px';
    clearBtn.innerHTML = `<button onclick="clearTaskHistory()" style="background:none;border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:7px 20px;font-family:'Nunito',sans-serif;font-size:12px;color:rgba(255,255,255,.3);cursor:pointer">clear</button>`;
    list.appendChild(clearBtn);
  }

  // Storico mensile stelle
  renderMonthlyStars(list);
}

function getTodayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

const MONTH_NAMES = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function renderMonthlyStars(container){
  const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
  const keys = Object.keys(monthly).sort();
  if(keys.length === 0) return;

  // Ultimi 12 mesi (inclusi quelli con 0)
  const months = [];
  const now = new Date();
  for(let i=11; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push({
      key,
      label: MONTH_NAMES[d.getMonth()],
      year: d.getFullYear(),
      count: monthly[key]||0,
      isCurrent: i===0
    });
  }

  const maxCount = Math.max(...months.map(m=>m.count), 1);

  const section = document.createElement('div');
  section.style.cssText = 'margin-top:24px;padding:16px;background:rgba(255,255,255,.05);border-radius:16px;border:1px solid rgba(255,255,255,.08)';

  const label = document.createElement('div');
  label.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:14px;display:flex;align-items:center;justify-content:space-between';
  label.innerHTML = `<span>⭐ Stelle per mese</span><span style="font-weight:400;letter-spacing:0">${keys.length > 0 ? Object.values(monthly).reduce((a,b)=>a+b,0)+' totali' : ''}</span>`;
  section.appendChild(label);

  // Griglia mesi
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;gap:6px;align-items:flex-end;height:80px';

  months.forEach(m => {
    const col = document.createElement('div');
    col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px';

    if(m.count > 0){
      // Barra
      const barH = Math.max(8, Math.round((m.count/maxCount)*56));
      const bar = document.createElement('div');
      bar.style.cssText = `height:${barH}px;width:100%;border-radius:4px 4px 0 0;background:${
        m.isCurrent ? 'rgba(74,184,216,.8)' :
        m.count >= maxCount*0.8 ? 'rgba(72,168,72,.7)' :
        m.count >= maxCount*0.4 ? 'rgba(240,192,32,.6)' :
        'rgba(255,255,255,.25)'
      };transition:height .3s`;
      col.appendChild(bar);

      // Numero
      const num = document.createElement('div');
      num.style.cssText = 'font-size:10px;font-weight:700;color:rgba(255,255,255,.6)';
      num.textContent = m.count;
      col.appendChild(num);
    } else {
      // Barra vuota
      const bar = document.createElement('div');
      bar.style.cssText = 'height:3px;width:100%;border-radius:2px;background:rgba(255,255,255,.08);margin-bottom:20px';
      col.appendChild(bar);
    }

    // Label mese
    const lbl = document.createElement('div');
    lbl.style.cssText = `font-size:9px;color:${m.isCurrent?'rgba(74,184,216,.8)':'rgba(255,255,255,.25)'};font-weight:${m.isCurrent?'700':'400'};margin-top:auto`;
    lbl.textContent = m.label;
    col.appendChild(lbl);

    grid.appendChild(col);
  });

  section.appendChild(grid);
  container.appendChild(section);
}

function completeEveningTask(id, card){
  const p = getProject(id); if(!p) return;

  // Salva nello storico
  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  const now = new Date();
  history.push({
    project: p.title,
    task: p.microtask,
    color: p.color||'#4ab8d8',
    date: `${now.getDate()}/${now.getMonth()+1}`
  });
  localStorage.setItem('inkflow_task_history', JSON.stringify(history));

  // Svuota il campo task nel progetto
  p.microtask = '';
  scheduleSave(p);

  // Stella — una per ogni task completata + tracking mensile
  const stars = parseInt(localStorage.getItem('inkflow_stars')||'0') + 1;
  localStorage.setItem('inkflow_stars', stars);

  // Storico mensile
  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
  monthly[monthKey] = (monthly[monthKey]||0) + 1;
  localStorage.setItem('inkflow_monthly_stars', JSON.stringify(monthly));

  // Aggiorna HUD con animazione
  const hud = document.getElementById('stars-count');
  if(hud){
    hud.textContent = stars;
    hud.style.transform = 'scale(1.5)';
    hud.style.transition = 'transform .25s';
    setTimeout(()=>hud.style.transform='scale(1)', 300);
  }

  // Animazione card → poi re-render
  card.style.transition = 'opacity .3s, transform .3s';
  card.style.opacity = '0';
  card.style.transform = 'translateX(20px)';
  saveUserData();
  setTimeout(()=> renderEveningList(), 350);
}

function clearTaskHistory(){
  localStorage.removeItem('inkflow_task_history');
  saveUserData();
  renderEveningList();
}

function clearStars(){
  localStorage.setItem('inkflow_stars','0');
  const el = document.getElementById('stars-count');
  if(el) el.textContent = '0';
}

function markEveningDone(){ exitEveningMode(); }

// Esponi evening mode dopo che le funzioni sono definite
window.enterEveningMode=enterEveningMode;
window.exitEveningMode=exitEveningMode;
window.markEveningDone=markEveningDone;
window.clearStars=clearStars;
window.clearTaskHistory=clearTaskHistory;

// ── PERSONAGGI, AMBIENTAZIONE, TONO ──
function toggleSubsection(id){
  const body = document.getElementById(id+'-body');
  const chev = document.getElementById(id+'-chev');
  if(!body) return;
  const open = body.classList.contains('open');
  body.classList.toggle('open', !open);
  if(chev) chev.classList.toggle('open', !open);
}

function restoreWorldFields(p){
  const world = document.getElementById('world-text');
  if(world) world.value = (p.story&&p.story.world)||'';
  renderCharacters(p);
}

function renderCharacters(p){
  const list = document.getElementById('chars-list');
  if(!list) return;
  if(!p.story) p.story={};
  if(!p.story.characters) p.story.characters=[];
  list.innerHTML='';
  p.story.characters.forEach((ch,i)=>{
    const card = document.createElement('div');
    card.className='char-card';
    const hdr = document.createElement('div');
    hdr.className='char-card-header';
    hdr.onclick=()=>toggleCharCard(i);
    hdr.innerHTML=`
      <span class="char-card-name" id="char-name-display-${i}">${ch.name||'Personaggio'}</span>
      <span class="char-card-role">${ch.role||''}</span>
      <button class="char-card-del" onclick="event.stopPropagation();deleteCharacter(${i})">×</button>`;
    const body = document.createElement('div');
    body.className='char-card-body';
    body.id='char-body-'+i;
    // Nome
    const nameField = makeCharField('Nome', ch.name||'', 'name', i);
    // Ruolo
    const roleField = makeCharField('Ruolo nella storia', ch.role||'', 'role', i);
    // Descrizione
    const descField = makeCharFieldTextarea('Descrizione', ch.desc||'', 'desc', i);
    body.appendChild(nameField);
    body.appendChild(roleField);
    body.appendChild(descField);
    card.appendChild(hdr);
    card.appendChild(body);
    list.appendChild(card);
  });
}

function makeCharField(label, value, field, idx){
  const wrap = document.createElement('div');
  wrap.className='char-field';
  wrap.innerHTML=`<div class="char-field-label">${label}</div>`;
  const input = document.createElement('input');
  input.className='char-input';
  input.type='text';
  input.value=value;
  input.placeholder=label+'…';
  input.addEventListener('input', function(){
    const p=getProject(currentId); if(!p||!p.story||!p.story.characters) return;
    p.story.characters[idx][field]=this.value;
    if(field==='name'){
      const disp=document.getElementById('char-name-display-'+idx);
      if(disp) disp.textContent=this.value||'Personaggio';
    }
    scheduleSave(p);
  });
  wrap.appendChild(input);
  return wrap;
}

function makeCharFieldTextarea(label, value, field, idx){
  const wrap = document.createElement('div');
  wrap.className='char-field';
  wrap.innerHTML=`<div class="char-field-label">${label}</div>`;
  const ta = document.createElement('textarea');
  ta.className='char-input story-textarea';
  ta.style.minHeight='70px';
  ta.rows=3;
  ta.value=value;
  ta.placeholder='Descrivi il personaggio — aspetto fisico, personalità, background…';
  ta.addEventListener('input', function(){
    const p=getProject(currentId); if(!p||!p.story||!p.story.characters) return;
    p.story.characters[idx][field]=this.value;
    scheduleSave(p);
  });
  wrap.appendChild(ta);
  return wrap;
}

function toggleCharCard(i){
  const body=document.getElementById('char-body-'+i);
  if(!body) return;
  body.classList.toggle('open');
}

function addCharacter(){
  const p=getProject(currentId); if(!p) return;
  if(!p.story) p.story={};
  if(!p.story.characters) p.story.characters=[];
  p.story.characters.push({name:'',role:'',desc:''});
  scheduleSave(p);
  renderCharacters(p);
  // Apri l'ultima card aggiunta
  setTimeout(()=>{
    const idx=p.story.characters.length-1;
    const body=document.getElementById('char-body-'+idx);
    if(body) body.classList.add('open');
    const nameInput=body&&body.querySelector('.char-input');
    if(nameInput) nameInput.focus();
  },50);
}

function deleteCharacter(i){
  const p=getProject(currentId); if(!p||!p.story||!p.story.characters) return;
  p.story.characters.splice(i,1);
  scheduleSave(p);
  renderCharacters(p);
}
function updatePlanner(){
  const p = getProject(currentId); if(!p) return;
  const startVal = document.getElementById('date-start').value;
  if(!startVal) return;

  const weeksS = parseFloat(document.getElementById('plan-sviluppo').value)||2;
  const weeksP = parseFloat(document.getElementById('plan-preprod').value)||2;
  const velocity = parseFloat(document.getElementById('plan-velocity').value)||2;
  const numTav = p.numTav||10;
  const weeksR = Math.ceil(numTav/velocity);
  const totalWeeks = weeksS + weeksP + weeksR;

  const start = new Date(startVal);
  const endSviluppo = new Date(start); endSviluppo.setDate(start.getDate() + weeksS*7);
  const endPreProd = new Date(endSviluppo); endPreProd.setDate(endSviluppo.getDate() + weeksP*7);
  const endReal = new Date(endPreProd); endReal.setDate(endPreProd.getDate() + weeksR*7);

  const fmt = d => `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;

  // Summary
  const summary = document.getElementById('planner-summary');
  if(summary){
    summary.innerHTML = `
      <span style="color:#7F77DD">■ Sviluppo</span> ${fmt(start)} → ${fmt(endSviluppo)} (${weeksS} sett.) &nbsp;
      <span style="color:#4ab8d8">■ Pre-prod.</span> ${fmt(endSviluppo)} → ${fmt(endPreProd)} (${weeksP} sett.) &nbsp;
      <span style="color:#48a848">■ Realizzazione</span> ${fmt(endPreProd)} → ${fmt(endReal)} (${weeksR} sett. · ${numTav} tavole a ${velocity}/sett.)
      <br><strong>Deadline calcolata: ${fmt(endReal)}</strong> · ${totalWeeks} settimane totali`;
  }

  // Timeline canvas
  const canvas = document.getElementById('planner-canvas');
  if(!canvas) return;
  const dpr = window.devicePixelRatio||1;
  const W = Math.max(canvas.parentElement.offsetWidth-32, 200);
  const H = 52;
  canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  const phases = [
    {weeks:weeksS, color:'#7F77DD', light:'#ede8fb', label:'Sviluppo'},
    {weeks:weeksP, color:'#4ab8d8', light:'#d0eefc', label:'Pre-prod.'},
    {weeks:weeksR, color:'#48a848', light:'#c8ecc8', label:'Realizz.'},
  ];
  const barH = 28; const barY = (H-barH)/2;
  let x = 0;
  phases.forEach((ph,i) => {
    const w = Math.round((ph.weeks/totalWeeks)*W);
    const isLast = i===phases.length-1;
    const bw = isLast ? W-x : w;
    // Background
    ctx.fillStyle = ph.light;
    ctx.beginPath();
    if(i===0) ctx.roundRect(x, barY, bw, barH, [8,0,0,8]);
    else if(isLast) ctx.roundRect(x, barY, bw, barH, [0,8,8,0]);
    else ctx.rect(x, barY, bw, barH);
    ctx.fill();
    // Color strip top
    ctx.fillStyle = ph.color;
    ctx.beginPath();
    if(i===0) ctx.roundRect(x, barY, bw, 4, [8,0,0,8]);
    else if(isLast) ctx.roundRect(x, barY, bw, 4, [0,8,8,0]);
    else ctx.rect(x, barY, bw, 4);
    ctx.fill();
    // Label
    ctx.fillStyle = ph.color;
    ctx.font = `bold 11px sans-serif`;
    ctx.textAlign = 'center';
    if(bw > 40) ctx.fillText(ph.label, x+bw/2, barY+barH-8);
    // Divider
    if(!isLast){
      ctx.fillStyle = '#fff';
      ctx.fillRect(x+bw-1, barY, 2, barH);
    }
    // Settimane sotto
    ctx.fillStyle = '#9a9088';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    if(bw > 30) ctx.fillText(`${ph.weeks}w`, x+bw/2, barY+barH+12);
    x += bw;
  });

  // Indicatore oggi
  const now = new Date();
  if(now >= start && now <= endReal){
    const elapsed = (now-start)/(endReal-start);
    const tx = Math.round(elapsed*W);
    ctx.strokeStyle = '#e84848';
    ctx.lineWidth = 2;
    ctx.setLineDash([3,2]);
    ctx.beginPath(); ctx.moveTo(tx, barY-4); ctx.lineTo(tx, barY+barH+4); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e84848';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    const lx = Math.min(Math.max(tx,12), W-12);
    ctx.fillText('oggi', lx, barY-6);
  }
}

// ── MICROTASK CONFIRM ──
// ── SETTINGS PANEL ──
function openSettings(){
  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-panel').classList.add('open');
  // Aggiorna contatore stelle nel pannello
  const stars = parseInt(localStorage.getItem('inkflow_stars')||'0');
  const el = document.getElementById('settings-stars-count');
  if(el) el.textContent = stars;
  restoreReminderUI();
}

function closeSettings(){
  document.getElementById('settings-overlay').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
}

function resetStarsConfirm(){
  document.getElementById('stars-confirm-modal').classList.add('open');
}

function closeStarsConfirm(){
  document.getElementById('stars-confirm-modal').classList.remove('open');
}

function doResetStars(){
  localStorage.setItem('inkflow_stars','0');
  // Reset anche le chiavi "già stellato oggi"
  Object.keys(localStorage).filter(k=>k.startsWith('inkflow_starred_')).forEach(k=>localStorage.removeItem(k));
  saveUserData();
  const el = document.getElementById('settings-stars-count');
  if(el) el.textContent = '0';
  const hud = document.getElementById('stars-count');
  if(hud) hud.textContent = '0';
  closeStarsConfirm();
}

function confirmMicrotask(){
  const p = getProject(currentId); if(!p) return;
  const val = document.getElementById('microtask').value.trim();
  if(!val) return;
  p.microtask = val;
  scheduleSave(p);
  const btn = document.getElementById('microtask-confirm-btn');
  if(btn){
    btn.style.background = '#48a848';
    btn.style.opacity = '1';
    btn.textContent = '✓';
    setTimeout(()=>{
      btn.style.background = 'var(--coral)';
    }, 1200);
  }
}

function openPlannerModal(){
  const startVal = document.getElementById('date-start').value;
  if(!startVal){ alert('Imposta prima la data di inizio'); return; }
  document.getElementById('planner-modal').classList.add('open');
  requestAnimationFrame(()=>updatePlanner());
}

function closePlannerModal(){
  document.getElementById('planner-modal').classList.remove('open');
}

function applyPlanner(){
  const startVal = document.getElementById('date-start').value;
  if(!startVal) return;
  const p = getProject(currentId); if(!p) return;

  const weeksS = parseFloat(document.getElementById('plan-sviluppo').value)||2;
  const weeksP = parseFloat(document.getElementById('plan-preprod').value)||2;
  const velocity = parseFloat(document.getElementById('plan-velocity').value)||2;
  const weeksR = Math.ceil((p.numTav||10)/velocity);

  const start = new Date(startVal);
  const end = new Date(start);
  end.setDate(start.getDate() + (weeksS+weeksP+weeksR)*7);

  const toISO = d => d.toISOString().split('T')[0];
  p.dateEnd = toISO(end);
  document.getElementById('date-end').value = p.dateEnd;

  // Aggiorna label pulsante deadline
  const fmt = d => `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
  const btn = document.getElementById('date-end-btn');
  const lbl = document.getElementById('date-end-label');
  if(lbl) lbl.textContent = fmt(end);
  if(btn) btn.style.color = 'var(--ink)';

  scheduleSave(p);
  renderDeadline(p);
  renderVelocity(p);
  closePlannerModal();
}

function restorePlanner(p){
  if(p.plannerSettings){
    const s = p.plannerSettings;
    const sv = document.getElementById('plan-sviluppo');
    const pp = document.getElementById('plan-preprod');
    const vl = document.getElementById('plan-velocity');
    if(sv) sv.value = s.sviluppo||2;
    if(pp) pp.value = s.preprod||2;
    if(vl) vl.value = s.velocity||2;
  }
  // Aggiorna label pulsante deadline
  const lbl = document.getElementById('date-end-label');
  const btn = document.getElementById('date-end-btn');
  if(p.dateEnd && lbl){
    const d = new Date(p.dateEnd);
    lbl.textContent = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
    if(btn) btn.style.color = 'var(--ink)';
  } else if(lbl){
    lbl.textContent = 'Pianifica →';
    if(btn) btn.style.color = 'var(--ink3)';
  }
}
function recordTavola(p, tavNum){
  // Registra la data di completamento di una tavola
  if(!p.velocityLog) p.velocityLog = [];
  // Evita duplicati
  const alreadyLogged = p.velocityLog.some(e => e.tav === tavNum);
  if(!alreadyLogged){
    p.velocityLog.push({ tav: tavNum, date: Date.now() });
  }
}

function removeTavola(p, tavNum){
  if(!p.velocityLog) return;
  p.velocityLog = p.velocityLog.filter(e => e.tav !== tavNum);
}

function renderVelocityHistory(p){
  const canvas = document.getElementById('history-canvas');
  const legend = document.getElementById('history-legend');
  if(!canvas) return;

  // Auto-popola il log dalle tavole già segnate come Finita
  if(!p.velocityLog) p.velocityLog = [];
  Object.entries(p.tavole||{}).forEach(([num, stage])=>{
    if(stage >= 4){
      const n = parseInt(num);
      if(!p.velocityLog.some(e => e.tav === n)){
        p.velocityLog.push({ tav: n, date: p.createdAt ? p.createdAt + n*86400000 : Date.now() });
      }
    }
  });

  const log = p.velocityLog || [];

  // Misura il parent dopo il layout
  const parent = canvas.parentElement;
  const W = Math.max(parent.offsetWidth - 32, 200);
  const H = 110;
  const dpr = window.devicePixelRatio||1;
  canvas.width = Math.round(W*dpr);
  canvas.height = Math.round(H*dpr);
  canvas.style.width = W+'px';
  canvas.style.height = H+'px';
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,H);

  // Raggruppa per settimana (lunedì)
  const weekMap = {};
  log.forEach(entry => {
    const d = new Date(entry.date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    monday.setHours(0,0,0,0);
    weekMap[monday.getTime()] = (weekMap[monday.getTime()]||0) + 1;
  });

  // Ultime 10 settimane
  const now = new Date();
  const thisMonday = new Date(now);
  const dow = now.getDay();
  thisMonday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  thisMonday.setHours(0,0,0,0);

  const weeks = [];
  for(let i = 9; i >= 0; i--){
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - i*7);
    weeks.push({ date: d, count: weekMap[d.getTime()]||0 });
  }

  const maxCount = Math.max(...weeks.map(w=>w.count), 3);
  const padL = 12, padR = 12, padT = 18, padB = 24;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // Griglia orizzontale leggera
  ctx.strokeStyle = '#e8e0d0';
  ctx.lineWidth = 1;
  [1,2,3].forEach(v => {
    if(v > maxCount) return;
    const y = padT + chartH - (v/maxCount)*chartH;
    ctx.setLineDash([3,4]);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W-padR, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c8b898';
    ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(v, padL-2, y+3);
  });

  // Punti X e coordinate Y
  const pts = weeks.map((w, i) => ({
    x: padL + (i/(weeks.length-1))*chartW,
    y: padT + chartH - (w.count/maxCount)*chartH,
    count: w.count,
    date: w.date,
    isNow: i === weeks.length-1,
  }));

  // Area sotto la linea — fill morbido
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT+chartH);
  pts.forEach(pt => ctx.lineTo(pt.x, pt.y));
  ctx.lineTo(pts[pts.length-1].x, padT+chartH);
  ctx.closePath();
  const areaGrad = ctx.createLinearGradient(0, padT, 0, padT+chartH);
  areaGrad.addColorStop(0, 'rgba(74,184,216,.18)');
  areaGrad.addColorStop(1, 'rgba(74,184,216,.02)');
  ctx.fillStyle = areaGrad;
  ctx.fill();

  // Linea principale
  ctx.beginPath();
  pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
  ctx.strokeStyle = '#4ab8d8';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.stroke();

  // Linea obiettivo 2 tav/sett
  const targetY = padT + chartH - (2/maxCount)*chartH;
  ctx.setLineDash([4,3]);
  ctx.strokeStyle = 'rgba(232,72,72,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, targetY); ctx.lineTo(W-padR, targetY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,72,72,.5)';
  ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('obiettivo', W-padR, targetY-3);

  // Punti + etichette
  pts.forEach((pt, i) => {
    const color = pt.isNow ? '#2a88b8' : pt.count >= 2 ? '#48a848' : pt.count === 1 ? '#f0c020' : '#c8b898';

    // Punto
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.count > 0 ? 4 : 2.5, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    if(pt.count > 0){
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Numero sopra il punto se > 0
    if(pt.count > 0){
      ctx.fillStyle = color;
      ctx.font = `bold 10px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(pt.count, pt.x, pt.y - 8);
    }

    // Label data sotto (ogni 2 + ultima)
    if(i % 2 === 0 || i === weeks.length-1){
      ctx.fillStyle = '#9a9088';
      ctx.font = `9px sans-serif`;
      ctx.textAlign = 'center';
      const label = i === weeks.length-1 ? 'ora' : `${pt.date.getDate()}/${pt.date.getMonth()+1}`;
      ctx.fillText(label, pt.x, H - 4);
    }
  });

  const total = log.length;
  const activeWeeks = weeks.filter(w=>w.count>0).length;
  const avg = activeWeeks > 0 ? (total/activeWeeks).toFixed(1) : '—';
  if(legend) legend.textContent = `${total} tavole totali · media ${avg} tav/sett`;
}
let swReg = null;

async function initNotifications(){
  if(!('serviceWorker' in navigator) || !('Notification' in window)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    // Aspetta che il SW sia attivo prima di procedere
    await navigator.serviceWorker.ready;
    restoreReminderUI();
    scheduleNextReminder();
  } catch(e){ console.warn('SW failed:', e); }
}

function restoreReminderUI(){
  const time = localStorage.getItem('inkflow_reminder_time') || '08:20';
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  const timeEl = document.getElementById('reminder-time');
  const toggleEl = document.getElementById('reminder-toggle');
  if(timeEl) timeEl.value = time;
  if(toggleEl) toggleEl.checked = enabled;
  updateReminderStatus();
}

function saveReminderSettings(){
  const time = document.getElementById('reminder-time').value;
  const enabled = document.getElementById('reminder-toggle').checked;
  localStorage.setItem('inkflow_reminder_time', time);
  localStorage.setItem('inkflow_reminder_enabled', enabled);

  if(enabled){
    requestNotificationPermission().then(granted => {
      if(granted){
        scheduleNextReminder();
        updateReminderStatus();
      } else {
        document.getElementById('reminder-toggle').checked = false;
        localStorage.setItem('inkflow_reminder_enabled', 'false');
        updateReminderStatus();
      }
    });
  } else {
    updateReminderStatus();
  }
}

async function requestNotificationPermission(){
  if(Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

function scheduleNextReminder(){
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  if(!enabled || !swReg) return;
  if(Notification.permission !== 'granted') return;

  const time = localStorage.getItem('inkflow_reminder_time') || '08:20';
  const [h, m] = time.split(':').map(Number);

  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if(next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;

  const prevTimer = window._reminderTimer;
  if(prevTimer) clearTimeout(prevTimer);

  window._reminderTimer = setTimeout(async () => {
    // Recupera il SW active in modo sicuro
    const reg = await navigator.serviceWorker.ready;
    if(reg && reg.active){
      reg.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        title: 'Inkflow ✏️',
        body: 'Buongiorno! Scrivi il task di stasera prima di iniziare la giornata.',
        delay: 0
      });
    } else {
      // Fallback diretto
      new Notification('Inkflow ✏️', {
        body: 'Buongiorno! Scrivi il task di stasera prima di iniziare la giornata.',
        icon: './icon-192.png'
      });
    }
    scheduleNextReminder();
  }, delay);
}

function updateReminderStatus(){
  const el = document.getElementById('reminder-status');
  if(!el) return;
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  const time = localStorage.getItem('inkflow_reminder_time') || '08:20';
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';

  if(perm === 'unsupported'){
    el.textContent = 'Notifiche non supportate su questo browser';
    el.style.color = 'var(--ink3)';
  } else if(!enabled){
    el.textContent = 'Reminder disattivato';
    el.style.color = 'var(--ink3)';
  } else if(perm === 'denied'){
    el.textContent = '⚠️ Permesso negato — abilita le notifiche nelle impostazioni';
    el.style.color = 'var(--coral)';
  } else if(perm === 'granted'){
    el.textContent = `✓ Reminder attivo alle ${time} — funziona con la scheda aperta`;
    el.style.color = 'var(--moss)';
  } else {
    el.textContent = 'Attiva il toggle per abilitare il reminder';
    el.style.color = 'var(--gold)';
  }
}

async function testNotification(){
  const granted = await requestNotificationPermission();
  if(!granted){ alert('Permesso notifiche non concesso'); return; }

  try {
    const reg = await navigator.serviceWorker.ready;
    if(reg && reg.active){
      reg.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        title: 'Inkflow ✏️',
        body: 'Test riuscito! Il reminder funziona correttamente.',
        delay: 2000
      });
      return;
    }
  } catch(e){}

  // Fallback diretto senza SW
  setTimeout(()=>{
    new Notification('Inkflow ✏️', {
      body: 'Test riuscito! Il reminder funziona correttamente.',
      icon: './icon-192.png'
    });
  }, 2000);
}

// Carica dati utente (stelle/storico) da Firebase
loadUserData();
initNotifications();
