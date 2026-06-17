import { projects, getProject, setCurrentId, PHASE_NAMES, PROJECT_PALETTE } from './state.js';
import { saveProject, scheduleSave } from './firebase.js';
import { drawGem } from './canvas.js';
import { calcPct, getPhaseIndex } from './progress.js';
import { calcDaysLeft } from './velocity.js';
import { exportPDF } from './pdf.js';
import { openProject, confirmDeleteCurrent } from './project.js';

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

export function renderHome(){
  const scroll = document.getElementById('home-scroll');
  scroll.querySelectorAll('.project-card').forEach(c => c.remove());
  const newBtn = scroll.querySelector('.new-btn');
  projects.forEach(p => {
    const pct = calcPct(p);
    const phIdx = getPhaseIndex(p);
    const daysLeft = calcDaysLeft(p);
    const dStr = daysLeft!==null?(daysLeft<0?`${Math.abs(daysLeft)}gg scaduto`:`${daysLeft}gg`):'';
    const bgColor = p.color||'#4ab8d8';

    const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}) : '';

    let currentTav = null;
    if(getPhaseIndex(p) >= 2){
      for(let i=1;i<=p.numTav;i++){
        const stage = p.tavole&&p.tavole[i]!=null ? p.tavole[i] : 0;
        if(stage < 4){ currentTav = i; break; }
      }
    }

    const card = document.createElement('div');
    card.className = 'project-card';
    card.dataset.id = p.id;
    card.style.borderLeft = `4px solid ${bgColor}`;
    card.style.position = 'relative';

    const gemCanvas = document.createElement('canvas');
    gemCanvas.width=76; gemCanvas.height=76;
    gemCanvas.style.cssText='width:38px;height:38px;border-radius:50%;flex-shrink:0;cursor:pointer;';
    const gCtx = gemCanvas.getContext('2d');
    gCtx.fillStyle = '#fefcf8';
    gCtx.fillRect(0,0,76,76);
    drawGem(gemCanvas, bgColor);
    gemCanvas.onclick = e => openColorPicker(p.id, e);

    const cardInner = document.createElement('div');
    cardInner.style.cssText='display:flex;align-items:center;gap:14px;flex:1;min-width:0;cursor:pointer';

    const metaLine = [
      PHASE_NAMES[phIdx],
      `${p.numTav} tavole`,
      currentTav ? `✏️ tav. ${currentTav}` : '',
      dStr ? `⏱ ${dStr}` : '',
    ].filter(Boolean).join(' · ');

    cardInner.innerHTML=`
      <div class="card-info">
        <div class="card-title">${p.title}</div>
        <div class="card-meta">${metaLine}</div>
        ${createdDate?`<div style="font-size:10px;color:var(--ink3);margin-top:2px;font-weight:400">Iniziato il ${createdDate}</div>`:''}
      </div>
      <div class="card-right">
        <div class="card-pct" style="color:${bgColor}">${pct}%</div>
      </div>`;
    cardInner.onclick = () => openProject(p.id);

    const menuBtn = document.createElement('button');
    menuBtn.textContent = '⋮';
    menuBtn.style.cssText='background:none;border:none;font-size:20px;color:var(--ink3);cursor:pointer;padding:4px 8px;flex-shrink:0;line-height:1';
    menuBtn.onclick = e => { e.stopPropagation(); openCardMenu(p.id, menuBtn); };

    card.appendChild(gemCanvas);
    card.appendChild(cardInner);
    card.appendChild(menuBtn);
    scroll.insertBefore(card, newBtn);
  });
}

let _activeMenu = null;

export function openCardMenu(id, btn){
  if(_activeMenu){ _activeMenu.remove(); _activeMenu=null; return; }

  const p = getProject(id); if(!p) return;
  const menu = document.createElement('div');
  menu.style.cssText=`position:fixed;background:var(--white);border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);border:1.5px solid var(--sand2);z-index:300;min-width:160px;overflow:hidden`;

  const items = [
    {label:'📄 Esporta PDF',  action:()=>{ closeCardMenu(); setCurrentId(id); exportPDF(); }},
    {label:'💾 Esporta JSON', action:()=>{ closeCardMenu(); exportProjectJSON(id); }},
    {label:'🗑 Elimina',      action:()=>{ closeCardMenu(); confirmDeleteProject(id); }, danger:true},
  ];

  items.forEach(item => {
    const b = document.createElement('button');
    b.textContent = item.label;
    b.style.cssText=`display:block;width:100%;padding:12px 16px;text-align:left;background:none;border:none;font-family:'Nunito',sans-serif;font-size:13px;font-weight:600;cursor:pointer;color:${item.danger?'var(--coral)':'var(--ink)'}`;
    b.onmouseenter = () => b.style.background='var(--sand)';
    b.onmouseleave = () => b.style.background='none';
    b.onclick = item.action;
    menu.appendChild(b);
  });

  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 6) + 'px';
  menu.style.right = (window.innerWidth - rect.right) + 'px';

  document.body.appendChild(menu);
  _activeMenu = menu;

  setTimeout(() => {
    document.addEventListener('click', closeCardMenu, {once:true});
  }, 0);
}

export function closeCardMenu(){
  if(_activeMenu){ _activeMenu.remove(); _activeMenu=null; }
}

export function exportProjectJSON(id){
  const p = getProject(id); if(!p) return;
  const blob = new Blob([JSON.stringify(p, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inkflow-${(p.title||'progetto').replace(/\s+/g,'-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function confirmDeleteProject(id){
  const p = getProject(id); if(!p) return;
  setCurrentId(id);
  confirmDeleteCurrent();
}

export function openNewModal(){
  document.getElementById('new-title').value='';
  document.getElementById('new-tav').value='10';
  document.getElementById('modal').classList.add('open');
  setTimeout(()=>document.getElementById('new-title').focus(),200);
}

export function closeModal(){ document.getElementById('modal').classList.remove('open'); }

export async function createProject(){
  const title = document.getElementById('new-title').value.trim()||'Nuovo progetto';
  const tav = document.getElementById('new-tav').value;
  const p = newProjectObj(title, tav);
  closeModal();
  await saveProject(p);
}

document.getElementById('modal').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });
document.getElementById('new-title').addEventListener('keydown', e => { if(e.key==='Enter') createProject(); });

export function toggleSearch(){
  const bar = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  const visible = bar.style.display !== 'none';
  bar.style.display = visible ? 'none' : 'block';
  if(!visible){ input.focus(); filterProjects(''); }
  else { input.value=''; filterProjects(''); }
}

export function filterProjects(query){
  const q = query.toLowerCase().trim();
  document.querySelectorAll('.project-card').forEach(card => {
    const title = card.querySelector('.card-title');
    if(!title) return;
    card.style.display = (!q || title.textContent.toLowerCase().includes(q)) ? '' : 'none';
  });
}

export function attachCardDrag(){
  const scroll = document.getElementById('home-scroll');
  let dragCard=null;

  scroll.querySelectorAll('.project-card').forEach((card,i)=>{
    card.draggable=true;
    card.addEventListener('dragstart', e=>{
      dragCard=card;
      setTimeout(()=>card.style.opacity='.4',0);
    });
    card.addEventListener('dragend', ()=>{ if(dragCard) dragCard.style.opacity=''; dragCard=null; });
    card.addEventListener('dragover', e=>{ e.preventDefault(); });
    card.addEventListener('drop', e=>{
      e.preventDefault();
      if(!dragCard||dragCard===card) return;
      const fromId = dragCard.dataset.id;
      const toId = card.dataset.id;
      const fromIdx = projects.findIndex(p=>p.id===fromId);
      const toIdx = projects.findIndex(p=>p.id===toId);
      if(fromIdx<0||toIdx<0) return;
      const [moved] = projects.splice(fromIdx,1);
      projects.splice(toIdx,0,moved);
      const order = projects.map(p=>p.id);
      localStorage.setItem('inkflow_order', JSON.stringify(order));
      renderHome();
    });
  });
}

export function applyProjectOrder(){
  const order = JSON.parse(localStorage.getItem('inkflow_order')||'[]');
  if(order.length === 0) return;
  projects.sort((a,b)=>{
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if(ai<0&&bi<0) return 0;
    if(ai<0) return 1;
    if(bi<0) return -1;
    return ai-bi;
  });
}

const PALETTE_COLORS = [
  '#c03030','#c87820','#d4a800','#48a848','#4ab8d8',
  '#2a88b8','#7F77DD','#c060a0','#508040','#a05a10',
  '#e87040','#60a8c0','#8a6040','#a08030','#507898',
];

let _colorPickerProjectId = null;

export function openColorPicker(id, e){
  e.stopPropagation();
  _colorPickerProjectId = id;
  const p = getProject(id); if(!p) return;
  const grid = document.getElementById('color-picker-grid');
  grid.innerHTML = '';
  PALETTE_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.style.cssText=`width:44px;height:44px;border-radius:50%;border:3px solid ${p.color===color?'var(--ink)':'transparent'};cursor:pointer;padding:0;transition:transform .15s;background:none;`;
    const canvas = document.createElement('canvas');
    canvas.width=76;canvas.height=76;
    canvas.style.cssText='width:38px;height:38px;border-radius:50%;display:block;margin:0 auto';
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#fefcf8';ctx.fillRect(0,0,76,76);
    drawGem(canvas, color);
    btn.appendChild(canvas);
    btn.onclick=()=>selectProjectColor(color);
    btn.onmouseenter=()=>btn.style.transform='scale(1.1)';
    btn.onmouseleave=()=>btn.style.transform='scale(1)';
    grid.appendChild(btn);
  });
  document.getElementById('color-picker-modal').classList.add('open');
}

export function closeColorPicker(){
  document.getElementById('color-picker-modal').classList.remove('open');
  _colorPickerProjectId = null;
}

export function selectProjectColor(color){
  const p = getProject(_colorPickerProjectId); if(!p) return;
  p.color = color;
  scheduleSave(p);
  closeColorPicker();
  renderHome();
  attachCardDrag();
}

// ── TEMPESTA DI SABBIA — sfondo atmosferico leggero della home ──
let _sandAnim = null;
let _sandStarted = false;
export function startSandstorm(){
  if(_sandStarted) return;
  const canvas = document.getElementById('home-sand');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let rectW = 0, rectH = 0, particles = [];
  const sandColors = ['rgba(170,140,100,', 'rgba(150,120,85,', 'rgba(190,160,115,', 'rgba(160,130,95,'];

  function measure(){
    const rect = canvas.getBoundingClientRect();
    rectW = rect.width;
    rectH = rect.height;
    return rectW > 0 && rectH > 0;
  }

  function setupCanvas(){
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = rectW * dpr;
    canvas.height = rectH * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function buildParticles(){
    const COUNT = Math.max(60, Math.min(220, Math.round((rectW*rectH)/4500)));
    particles = [];
    for(let i=0;i<COUNT;i++){
      particles.push({
        x: Math.random()*rectW,
        y: Math.random()*rectH,
        r: 0.25 + Math.random()*0.6,   // pulviscolo finissimo
        vx: 0.12 + Math.random()*0.4,  // deriva lenta
        vy: (-0.1 + Math.random()*0.2),
        a: 0.10 + Math.random()*0.16,  // tenui
        c: sandColors[Math.floor(Math.random()*sandColors.length)]
      });
    }
  }

  function tick(){
    ctx.clearRect(0,0,rectW,rectH);
    particles.forEach(p=>{
      p.x += p.vx;
      p.y += p.vy;
      if(p.x > rectW+5){ p.x = -5; p.y = Math.random()*rectH; }
      if(p.y < -5) p.y = rectH+5;
      if(p.y > rectH+5) p.y = -5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = p.c + p.a + ')';
      ctx.fill();
    });
    _sandAnim = requestAnimationFrame(tick);
  }

  // Aspetta che il canvas abbia dimensioni reali (lo schermo home dev'essere visibile)
  let attempts = 0;
  function tryStart(){
    if(measure()){
      _sandStarted = true;
      setupCanvas();
      buildParticles();
      if(_sandAnim) cancelAnimationFrame(_sandAnim);
      tick();
      window.addEventListener('resize', ()=>{
        if(measure()){ setupCanvas(); buildParticles(); }
      }, {passive:true});
    } else if(attempts++ < 60){
      // riprova finché lo schermo non è visibile (max ~6s)
      setTimeout(tryStart, 100);
    }
  }
  tryStart();
}
