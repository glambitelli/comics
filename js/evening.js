import { projects, getProject } from './state.js';
import { saveUserData, scheduleSave } from './firebase.js';
import { drawGem } from './canvas.js';

export function enterEveningMode(){
  renderEveningList();
  document.getElementById('screen-home').classList.remove('active');
  document.getElementById('screen-evening').classList.add('active');
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

const MONTH_NAMES = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function renderMonthlyStars(container){
  const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');
  const keys = Object.keys(monthly).sort();
  if(keys.length === 0) return;

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

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;gap:6px;align-items:flex-end;height:80px';

  months.forEach(m => {
    const col = document.createElement('div');
    col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px';

    if(m.count > 0){
      const barH = Math.max(8, Math.round((m.count/maxCount)*56));
      const bar = document.createElement('div');
      bar.style.cssText = `height:${barH}px;width:100%;border-radius:4px 4px 0 0;background:${
        m.isCurrent ? 'rgba(74,184,216,.8)' :
        m.count >= maxCount*0.8 ? 'rgba(72,168,72,.7)' :
        m.count >= maxCount*0.4 ? 'rgba(240,192,32,.6)' :
        'rgba(255,255,255,.25)'
      };transition:height .3s`;
      col.appendChild(bar);

      const num = document.createElement('div');
      num.style.cssText = 'font-size:10px;font-weight:700;color:rgba(255,255,255,.6)';
      num.textContent = m.count;
      col.appendChild(num);
    } else {
      const bar = document.createElement('div');
      bar.style.cssText = 'height:3px;width:100%;border-radius:2px;background:rgba(255,255,255,.08);margin-bottom:20px';
      col.appendChild(bar);
    }

    const lbl = document.createElement('div');
    lbl.style.cssText = `font-size:9px;color:${m.isCurrent?'rgba(74,184,216,.8)':'rgba(255,255,255,.25)'};font-weight:${m.isCurrent?'700':'400'};margin-top:auto`;
    lbl.textContent = m.label;
    col.appendChild(lbl);

    grid.appendChild(col);
  });

  section.appendChild(grid);
  container.appendChild(section);
}

export function renderEveningList(){
  const list = document.getElementById('evening-list');
  list.innerHTML = '';

  const totalStars = parseInt(localStorage.getItem('inkflow_stars')||'0');
  const starsRow = document.createElement('div');
  starsRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0 12px';
  starsRow.innerHTML = `<span style="font-size:13px">⭐</span><span id="stars-count" style="font-family:'Castoro',serif;font-size:16px;font-weight:700;color:rgba(255,255,255,.85)">${totalStars}</span>`;
  list.appendChild(starsRow);

  const streak = getStreak();
  if(streak > 0){
    const streakEl = document.createElement('div');
    streakEl.style.cssText='display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.05);border-radius:12px;padding:10px 14px;margin-bottom:10px';
    streakEl.innerHTML=`<span style="font-size:18px">🔥</span><span style="font-family:'Castoro',serif;font-size:20px;font-weight:700;color:rgba(255,255,255,.9)">${streak}</span><span style="font-size:11px;color:rgba(255,255,255,.4);font-weight:500">${streak===1?'giorno consecutivo':'giorni consecutivi'}</span>`;
    list.appendChild(streakEl);
  }

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

  renderMonthlyStars(list);
}

export function completeEveningTask(id, card){
  const p = getProject(id); if(!p) return;

  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  const now = new Date();
  history.push({
    project: p.title,
    task: p.microtask,
    color: p.color||'#4ab8d8',
    date: `${now.getDate()}/${now.getMonth()+1}`
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
