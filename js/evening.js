import { projects, getProject } from './state.js';
import { saveUserData, scheduleSave, bumpDataRev } from './firebase.js';
import { drawGem } from './canvas.js';

export function enterEveningMode(){
  renderEveningList();
  renderStarfield();
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-evening').classList.add('active');
}

function renderStarfield(){
  const cont = document.getElementById('evening-stars');
  if(!cont || cont.dataset.filled) return; // genera una sola volta
  const glyphs = ['✦','✧','⋆','·','✦','·','✧'];
  const N = 46;
  let html = '';
  for(let i=0;i<N;i++){
    const g = glyphs[Math.floor(Math.random()*glyphs.length)];
    const top = Math.random()*100;
    const left = Math.random()*100;
    // stelle più piccole e fitte in alto, qualcuna più grande
    const size = Math.random()<0.15 ? (9+Math.random()*5) : (5+Math.random()*4);
    const dur = 3 + Math.random()*5;
    const delay = Math.random()*5;
    const baseOp = 0.2 + Math.random()*0.4;
    // tono: per lo più bianco freddo, qualche stella oro tenue
    const gold = Math.random()<0.2;
    const color = gold ? 'rgba(240,200,120,'+baseOp.toFixed(2)+')' : 'rgba(255,255,255,'+baseOp.toFixed(2)+')';
    html += `<span class="star" style="top:${top.toFixed(1)}%;left:${left.toFixed(1)}%;font-size:${size.toFixed(1)}px;color:${color};animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s">${g}</span>`;
  }
  cont.innerHTML = html;
  cont.dataset.filled = '1';
}

export function exitEveningMode(){
  document.getElementById('screen-evening').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
}

export function getTodayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

export function updateStreak(){
  const today = getTodayKey();
  const yesterday = (()=>{
    const d = new Date(); d.setDate(d.getDate()-1);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  })();
  const lastDay = localStorage.getItem('inkflow_streak_last');
  let streak = parseInt(localStorage.getItem('inkflow_streak')||'0');
  if(lastDay === today) return;
  if(lastDay === yesterday) streak++;
  else streak = 1;
  localStorage.setItem('inkflow_streak', streak);
  const maxStreak=parseInt(localStorage.getItem('inkflow_max_streak')||'0');
  if(streak>maxStreak) localStorage.setItem('inkflow_max_streak', streak);
  localStorage.setItem('inkflow_streak_last', today);
  const el = document.getElementById('streak-count');
  if(el) el.textContent = streak;
}

export function getStreak(){
  const today = getTodayKey();
  const yesterday = (()=>{
    const d = new Date(); d.setDate(d.getDate()-1);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  })();
  const lastDay = localStorage.getItem('inkflow_streak_last');
  if(lastDay === today || lastDay === yesterday){
    return parseInt(localStorage.getItem('inkflow_streak')||'0');
  }
  return 0;
}


export function renderEveningList(){
  const list = document.getElementById('evening-list');
  list.innerHTML = '';

  const totalStars = parseInt(localStorage.getItem('inkflow_stars')||'0');
  const streak = getStreak();
  const starsRow = document.createElement('div');
  starsRow.style.cssText = 'display:flex;align-items:center;gap:18px;padding:4px 0 16px';
  let starsHtml = `<span style="display:flex;align-items:baseline;gap:7px"><span style="font-size:15px;color:#f0c020;line-height:1">✦</span><span id="stars-count" style="font-family:'Castoro',serif;font-size:18px;font-weight:700;color:rgba(255,255,255,.85)">${totalStars}</span></span>`;
  if(streak > 0){
    starsHtml += `<span style="display:flex;align-items:baseline;gap:7px"><span style="font-size:15px;color:#e8804a;line-height:1">〰</span><span style="font-family:'Castoro',serif;font-size:18px;font-weight:700;color:rgba(255,255,255,.85)">${streak}</span></span>`;
  }
  starsRow.innerHTML = starsHtml;
  list.appendChild(starsRow);

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

  const history2 = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  if(history2.length > 0){
    const clearBtn = document.createElement('div');
    clearBtn.style.cssText = 'text-align:center;margin-top:20px;padding-bottom:8px';
    clearBtn.innerHTML = `<button onclick="clearTaskHistory()" style="background:none;border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:7px 20px;font-family:'Nunito',sans-serif;font-size:12px;color:rgba(255,255,255,.3);cursor:pointer">clear</button>`;
    list.appendChild(clearBtn);
  }
}

export function completeEveningTask(id, card){
  const p = getProject(id); if(!p) return;

  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  const now = new Date();
  history.push({
    project: p.title,
    task: p.microtask,
    color: p.color||'#4ab8d8',
    date: `${now.getDate()}/${now.getMonth()+1}`,
    ts: now.toISOString()
  });
  localStorage.setItem('inkflow_task_history', JSON.stringify(history));

  p.microtask = '';
  scheduleSave(p);

  const stars = parseInt(localStorage.getItem('inkflow_stars')||'0') + 1;
  localStorage.setItem('inkflow_stars', stars);

  const monthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
  monthly[monthKey] = (monthly[monthKey]||0) + 1;
  localStorage.setItem('inkflow_monthly_stars', JSON.stringify(monthly));

  updateStreak();
  bumpDataRev();

  const hud = document.getElementById('stars-count');
  if(hud){
    hud.textContent = stars;
    hud.style.transform = 'scale(1.5)';
    hud.style.transition = 'transform .25s';
    setTimeout(()=>hud.style.transform='scale(1)', 300);
  }

  card.style.transition = 'opacity .3s, transform .3s';
  card.style.opacity = '0';
  card.style.transform = 'translateX(20px)';
  saveUserData();
  setTimeout(()=> renderEveningList(), 350);
}

export function clearTaskHistory(){
  localStorage.removeItem('inkflow_task_history');
  saveUserData();
  renderEveningList();
}

export function clearStars(){
  localStorage.setItem('inkflow_stars','0');
  const el = document.getElementById('stars-count');
  if(el) el.textContent = '0';
}

export function markEveningDone(){ exitEveningMode(); }

window.enterEveningMode=enterEveningMode;
window.exitEveningMode=exitEveningMode;
window.markEveningDone=markEveningDone;
window.clearStars=clearStars;
window.clearTaskHistory=clearTaskHistory;
