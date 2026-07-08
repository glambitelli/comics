import { projects, getProject, haptic } from './state.js';
import { saveUserData, scheduleSave, bumpDataRev } from './firebase.js';
import { drawGem } from './canvas.js';

export function enterEveningMode(){
  // Chiude TUTTE le schermate eventualmente aperte (non solo la home), altrimenti
  // se si entra in sera da Stats o da un progetto quella resta attiva sotto,
  // causando la sovrapposizione visiva delle pagine.
  document.querySelectorAll('.screen.active').forEach(el=>el.classList.remove('active'));
  document.getElementById('screen-evening').classList.add('active');
  document.body.classList.add('evening-mode');
  if(window.__navSync) window.__navSync('evening');
  renderEveningList();
  renderStarfield();
  scheduleStarPulse();
}

// ── FASE LUNARE ──
function getMoonPhase(date){
  // Calcolo della fase lunare (frazione 0-1, dove 0=luna nuova, 0.5=piena)
  // Basato sul ciclo sinodico medio di 29.53 giorni da una luna nuova nota
  const synodic = 29.530588853;
  const knownNew = Date.UTC(2000,0,6,18,14)/86400000; // 6 gen 2000, luna nuova nota
  const now = date.getTime()/86400000;
  let age = ((now - knownNew) % synodic);
  if(age<0) age+=synodic;
  return age/synodic; // 0..1
}

function moonPhaseName(frac){
  if(frac<0.03||frac>0.97) return 'Luna nuova';
  if(frac<0.22) return 'Luna crescente';
  if(frac<0.28) return 'Primo quarto';
  if(frac<0.47) return 'Gibbosa crescente';
  if(frac<0.53) return 'Luna piena';
  if(frac<0.72) return 'Gibbosa calante';
  if(frac<0.78) return 'Ultimo quarto';
  return 'Luna calante';
}

function renderMoon(){
  const cont = document.getElementById('evening-moon');
  if(!cont) return;
  const frac = getMoonPhase(new Date());
  const name = moonPhaseName(frac);
  const R = 16;
  const cx = 18, cy = 18;

  // Illuminazione: 0 nuova → 1 piena → 0 nuova
  // Costruisco l'ombra come ellisse che si sposta sul disco
  // illum: frazione illuminata (0..1)
  const illum = (1 - Math.cos(2*Math.PI*frac))/2; // 0 a luna nuova, 1 a piena
  const waxing = frac < 0.5; // crescente = illuminata a destra

  // Terminatore: semi-larghezza dell'ellisse d'ombra
  // quando illum=0.5 (quarti) il terminatore è dritto (rx=0)
  const rx = R * Math.abs(Math.cos(Math.PI*illum));
  const lit = '#f4ecd8', dark = '#1a2740';

  let svg = `<svg width="36" height="36" viewBox="0 0 36 36">`;
  // disco base scuro
  svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${dark}"/>`;
  // glow tenue
  svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(244,236,216,.18)" stroke-width="1"/>`;

  if(illum > 0.985){
    // piena
    svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${lit}"/>`;
  } else if(illum > 0.015){
    // Disegno la porzione illuminata come composizione di un semicerchio + ellisse
    const clipId = 'moonclip';
    svg += `<defs><clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
    svg += `<g clip-path="url(#${clipId})">`;
    // semicerchio illuminato (lato crescente/calante)
    if(waxing){
      // illuminata a destra
      svg += `<path d="M ${cx} ${cy-R} A ${R} ${R} 0 0 1 ${cx} ${cy+R} Z" fill="${lit}"/>`;
    } else {
      // illuminata a sinistra
      svg += `<path d="M ${cx} ${cy-R} A ${R} ${R} 0 0 0 ${cx} ${cy+R} Z" fill="${lit}"/>`;
    }
    // ellisse del terminatore: se illum<0.5 sottrae luce (ombra), se >0.5 aggiunge
    const ellFill = illum < 0.5 ? dark : lit;
    svg += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${R}" fill="${ellFill}"/>`;
    svg += `</g>`;
  }

  svg += `</svg>`;
  cont.innerHTML = `${svg}<div style="font-size:8px;color:rgba(255,255,255,.4);letter-spacing:.04em;text-align:center;white-space:nowrap">${name}</div>`;
}

// Versione compatta della luna, accanto ai contatori
function renderMoonInline(){
  const cont = document.getElementById('moon-inline');
  if(!cont) return;
  const frac = getMoonPhase(new Date());
  const name = moonPhaseName(frac);
  const R = 11;
  const cx = 13, cy = 13;
  const illum = (1 - Math.cos(2*Math.PI*frac))/2;
  const waxing = frac < 0.5;
  const rx = R * Math.abs(Math.cos(Math.PI*illum));
  const lit = '#f4ecd8', dark = '#1a2740';

  let svg = `<svg width="26" height="26" viewBox="0 0 26 26" style="display:block">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${dark}"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(244,236,216,.18)" stroke-width="1"/>`;
  if(illum > 0.985){
    svg += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${lit}"/>`;
  } else if(illum > 0.015){
    svg += `<defs><clipPath id="moonclipinline"><circle cx="${cx}" cy="${cy}" r="${R}"/></clipPath></defs>`;
    svg += `<g clip-path="url(#moonclipinline)">`;
    if(waxing){
      svg += `<path d="M ${cx} ${cy-R} A ${R} ${R} 0 0 1 ${cx} ${cy+R} Z" fill="${lit}"/>`;
    } else {
      svg += `<path d="M ${cx} ${cy-R} A ${R} ${R} 0 0 0 ${cx} ${cy+R} Z" fill="${lit}"/>`;
    }
    const ellFill = illum < 0.5 ? dark : lit;
    svg += `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${R}" fill="${ellFill}"/>`;
    svg += `</g>`;
  }
  svg += `</svg>`;
  cont.innerHTML = svg;
  cont.title = name;
}

// ── PULSAR — ogni tanto una stella diventa particolarmente luminosa ──
let _starPulseStarted = false;
function scheduleStarPulse(){
  if(_starPulseStarted) return;
  const layer = document.getElementById('evening-stars');
  if(!layer) return;
  _starPulseStarted = true;

  function pulse(){
    const screen = document.getElementById('screen-evening');
    if(!screen || !screen.classList.contains('active')) return;
    const stars = layer.querySelectorAll('.star');
    if(!stars.length) return;
    // Scegli una stella casuale e falla brillare
    const star = stars[Math.floor(Math.random()*stars.length)];
    star.classList.add('star-shine');
    setTimeout(()=>star.classList.remove('star-shine'), 2600);
  }

  function loop(){
    const screen = document.getElementById('screen-evening');
    if(screen && screen.classList.contains('active') && !document.hidden){
      pulse();
    }
    setTimeout(loop, 3500 + Math.random()*4000); // ogni 3.5-7.5s
  }
  setTimeout(loop, 2000 + Math.random()*2000);
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
    // Tono: per lo più oro/sabbia caldo, qualcuna bianca calda per varietà
    const r = Math.random();
    let color;
    if(r < 0.6) color = 'rgba(240,200,120,'+baseOp.toFixed(2)+')';       // oro
    else if(r < 0.85) color = 'rgba(220,180,130,'+baseOp.toFixed(2)+')'; // sabbia calda
    else color = 'rgba(250,244,228,'+baseOp.toFixed(2)+')';             // bianco caldo
    html += `<span class="star" style="top:${top.toFixed(1)}%;left:${left.toFixed(1)}%;font-size:${size.toFixed(1)}px;color:${color};animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(1)}s">${g}</span>`;
  }
  cont.innerHTML = html;
  cont.dataset.filled = '1';
}

export function exitEveningMode(){
  document.getElementById('screen-evening').classList.remove('active');
  document.getElementById('screen-home').classList.add('active');
  document.body.classList.remove('evening-mode');
  if(window._resumeSand) window._resumeSand();
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
  starsRow.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:18px;padding:4px 0 16px';
  let starsHtml = '';
  // Luna (fase reale) accanto ai contatori
  starsHtml += `<span id="moon-inline" style="display:flex;align-items:center;margin-right:auto"></span>`;
  // ★ serate
  starsHtml += `<span style="display:flex;align-items:baseline;gap:7px"><span style="font-size:15px;color:#f0c020;line-height:1">★</span><span id="stars-count" style="font-family:'Castoro',serif;font-size:18px;font-weight:700;color:rgba(255,255,255,.85)">${totalStars}</span></span>`;
  // 〰 streak (sempre visibile, anche a 0)
  starsHtml += `<span style="display:flex;align-items:baseline;gap:7px"><span style="font-size:15px;color:#e8804a;line-height:1">〰</span><span style="font-family:'Castoro',serif;font-size:18px;font-weight:700;color:rgba(255,255,255,.85)">${streak}</span></span>`;
  starsRow.innerHTML = starsHtml;
  list.appendChild(starsRow);
  // Disegna la luna inline
  renderMoonInline();

  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  const active = projects.filter(p => p.microtask && p.microtask.trim());

  if(active.length === 0 && history.length === 0){
    const empty = document.createElement('div');
    empty.className = 'evening-no-tasks';
    empty.innerHTML = 'Nessun task scritto per stasera.<br>Apri un progetto e scrivi cosa farai.';
    list.appendChild(empty);
    return;
  }

  // ── DA FARE STASERA (sopra) ──
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

  // ── TASK COMPLETATE (sotto) ──
  if(history.length > 0){
    const histSection = document.createElement('div');
    histSection.className = 'evening-completed-section';
    histSection.style.marginTop = active.length > 0 ? '24px' : '4px';
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

  // ── Tracking trofei segreti ──
  const secrets = JSON.parse(localStorage.getItem('inkflow_secrets')||'{}');
  const hour = now.getHours();
  const day = now.getDay(); // 0=domenica, 6=sabato
  if(hour>=0 && hour<5) secrets.nottambulo = true;       // task tra mezzanotte e le 5
  if(hour>=5 && hour<8) secrets.albe = true;             // task all'alba (5-8)
  if(day===0) secrets.domenica = true;                   // task di domenica
  if(day===6) secrets.sabato = true;                     // task di sabato
  // task in un giorno festivo speciale (es. capodanno, natale)
  const md = `${now.getMonth()+1}-${now.getDate()}`;
  if(md==='12-25'||md==='1-1') secrets.festa = true;
  localStorage.setItem('inkflow_secrets', JSON.stringify(secrets));

  p.microtask = '';
  scheduleSave(p);

  const stars = parseInt(localStorage.getItem('inkflow_stars')||'0') + 1;
  localStorage.setItem('inkflow_stars', stars);
  haptic('reward');

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
