import { getProject, currentId } from './state.js';
import { scheduleSave } from './firebase.js';
import { getPhaseIndex } from './progress.js';

export function calcDaysLeft(p){
  if(!p.dateEnd) return null;
  const end=new Date(p.dateEnd); const now=new Date();
  now.setHours(0,0,0,0); end.setHours(0,0,0,0);
  return Math.round((end-now)/(1000*60*60*24));
}

export function calcVelocity(p){
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

export function saveDates(){
  const p=getProject(currentId); if(!p) return;
  p.dateStart=document.getElementById('date-start').value;
  p.dateEnd=document.getElementById('date-end').value;
  scheduleSave(p); renderDeadline(p); renderVelocity(p);
}

export function renderDeadline(p){
  const box=document.getElementById('countdown-box');
  const days=calcDaysLeft(p);
  if(days===null){box.innerHTML='<div style="font-size:12px;color:var(--ink3);font-weight:500">Imposta una deadline per vedere il countdown</div>';renderPhaseCalendar(p);return;}
  const absDays=Math.abs(days);
  const weeks=Math.floor(absDays/7); const remDays=absDays%7;
  const cls=days<0?'urgent':days<14?'warn':'ok';
  const label=days<0?'giorni scaduto':'giorni mancanti';
  box.innerHTML=`
    <div class="countdown-pill ${cls}"><div class="countdown-num">${absDays}</div><div class="countdown-unit">${label}</div></div>
    <div class="countdown-pill"><div class="countdown-num" style="color:var(--ink2)">${weeks}</div><div class="countdown-unit">settimane</div></div>
    <div class="countdown-pill"><div class="countdown-num" style="color:var(--ink2)">${remDays}</div><div class="countdown-unit">giorni extra</div></div>`;
  renderPhaseCalendar(p);
}

export function renderPhaseCalendar(p){
  const block=document.getElementById('phase-calendar-block');
  const canvas=document.getElementById('phase-calendar-canvas');
  const legend=document.getElementById('phase-calendar-legend');
  if(!block||!canvas) return;
  if(!p.dateStart||!p.dateEnd){block.style.display='none';return;}
  block.style.display='block';

  const start=new Date(p.dateStart);
  const end=new Date(p.dateEnd);
  const totalDays=Math.max(1,Math.round((end-start)/(1000*60*60*24)));

  const weeksS=parseFloat(document.getElementById('plan-sviluppo')?.value||'2');
  const weeksP=parseFloat(document.getElementById('plan-preprod')?.value||'2');
  const daySvil=Math.round(weeksS*7);
  const dayPrep=Math.round(weeksP*7);
  const dayReal=Math.max(1,totalDays-daySvil-dayPrep);

  const phases=[
    {label:'Sviluppo', days:daySvil, bg:'#f6ecd2', accent:'#d8c090', text:'#9a8458'},
    {label:'Pre-prod.', days:dayPrep, bg:'#f0dfae', accent:'#c8a048', text:'#8a6a30'},
    {label:'Realizz.', days:dayReal, bg:'#e0a810', accent:'#8a6a30', text:'#fdf6e4'},
  ];

  const dpr=window.devicePixelRatio||1;
  const W=Math.max(block.offsetWidth-32,200);
  const H=72;
  canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');
  ctx.scale(dpr,dpr); ctx.clearRect(0,0,W,H);

  const barH=32,barY=16;
  let x=0;
  phases.forEach((ph,i)=>{
    const frac=ph.days/totalDays;
    const bw=i===phases.length-1?W-x:Math.round(frac*W);
    ctx.fillStyle=ph.bg;
    ctx.beginPath();
    if(i===0) ctx.roundRect(x,barY,bw,barH,[8,0,0,8]);
    else if(i===phases.length-1) ctx.roundRect(x,barY,bw,barH,[0,8,8,0]);
    else ctx.rect(x,barY,bw,barH);
    ctx.fill();
    ctx.fillStyle=ph.accent;
    ctx.beginPath();
    if(i===0) ctx.roundRect(x,barY,bw,5,[8,0,0,8]);
    else if(i===phases.length-1) ctx.roundRect(x,barY,bw,5,[0,8,8,0]);
    else ctx.rect(x,barY,bw,5);
    ctx.fill();
    ctx.fillStyle=ph.text;
    ctx.font="bold 11px 'Courier Prime', monospace"; ctx.textAlign='center';
    if(bw>50) ctx.fillText(ph.label,x+bw/2,barY+barH-8);
    ctx.fillStyle='#9a8458'; ctx.font="9px 'Courier Prime', monospace";
    if(bw>35) ctx.fillText(ph.days+'gg',x+bw/2,barY+barH+14);
    if(i<phases.length-1){ctx.fillStyle='#fff';ctx.fillRect(x+bw-1,barY,2,barH);}
    x+=bw;
  });

  const now=new Date();
  if(now>=start&&now<=end){
    const elapsed=(now-start)/(end-start);
    const tx=Math.round(elapsed*W);
    ctx.strokeStyle='#e84848'; ctx.lineWidth=2; ctx.setLineDash([3,2]);
    ctx.beginPath(); ctx.moveTo(tx,barY-4); ctx.lineTo(tx,barY+barH+4); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='#e84848'; ctx.font="bold 11px 'Courier Prime', monospace"; ctx.textAlign='center';
    ctx.fillText('oggi',Math.min(Math.max(tx,16),W-16),barY-6);
  }

  if(legend){
    const fmt=d=>`${d.getDate()}/${d.getMonth()+1}`;
    const endSvil=new Date(start); endSvil.setDate(start.getDate()+daySvil);
    const endPrep=new Date(endSvil); endPrep.setDate(endSvil.getDate()+dayPrep);
    legend.innerHTML=phases.map((ph,i)=>{
      const s=i===0?start:i===1?endSvil:endPrep;
      const e=i===0?endSvil:i===1?endPrep:end;
      return `<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:2px;background:${ph.accent};flex-shrink:0;display:inline-block"></span><strong>${ph.label}</strong> ${fmt(s)}→${fmt(e)}</span>`;
    }).join('');
  }
}

export function renderVelocity(p){
  const v=calcVelocity(p);
  const cls=v.actual>=2?'good':v.actual>=1?'warn':'bad';
  const neededHtml=v.needed!==null?`<div class="vel-stat"><div class="vel-num ${v.needed>3?'bad':v.needed>2?'warn':'good'}">${v.needed}</div><div class="vel-unit">tav/sett necessarie</div></div>`:'';
  document.getElementById('vel-stats').innerHTML=`
    <div class="vel-stat"><div class="vel-num">${v.tavDone}</div><div class="vel-unit">tavole finite</div></div>
    <div class="vel-stat"><div class="vel-num ${cls}">${v.actual}</div><div class="vel-unit">tav/sett media</div></div>
    <div class="vel-stat"><div class="vel-num">${p.numTav-v.tavDone}</div><div class="vel-unit">rimanenti</div></div>
    ${neededHtml}`;
  const alertEl=document.getElementById('vel-alert');
  const phIdx = getPhaseIndex(p);
  if(v.needed!==null && phIdx >= 2){
    const diff=v.needed-v.actual;
    if(diff<=0) alertEl.innerHTML=`<div class="vel-alert ok">✅ Sei in anticipo — ritmo attuale sufficiente per la deadline.</div>`;
    else if(diff<=1) alertEl.innerHTML=`<div class="vel-alert warn">⚠️ Aumenta il ritmo di ${diff.toFixed(1)} tav/sett per rispettare la deadline.</div>`;
    else alertEl.innerHTML=`<div class="vel-alert bad">🔴 Ritmo attuale insufficiente di ${diff.toFixed(1)} tav/sett — valuta di rivedere la deadline.</div>`;
  } else { alertEl.innerHTML=''; }
  drawChart(p,v);
}

export function drawChart(p,v){
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
  ctx.fillStyle='#e8e0d0';
  ctx.beginPath(); ctx.roundRect(0,barY,W,barH,11); ctx.fill();
  if(v.tavDone>0){
    const pw=Math.round((v.tavDone/p.numTav)*W);
    const grad=ctx.createLinearGradient(0,0,pw,0);
    grad.addColorStop(0,'#e84848'); grad.addColorStop(1,'#f0c020');
    ctx.fillStyle=grad;
    ctx.beginPath(); ctx.roundRect(0,barY,pw,barH,11); ctx.fill();
    const shine=ctx.createLinearGradient(0,barY,0,barY+barH*0.5);
    shine.addColorStop(0,'rgba(255,255,255,.22)'); shine.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=shine;
    ctx.beginPath(); ctx.roundRect(2,barY+1,pw-4,barH*0.45,9); ctx.fill();
  }
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
  ctx.fillStyle='#2a2420'; ctx.font='600 12px sans-serif'; ctx.textAlign='left';
  ctx.fillText(`${v.tavDone} / ${p.numTav} tavole`,4,barY+barH+16);
  ctx.textAlign='right'; ctx.fillStyle='#9a9088';
  ctx.fillText(`${Math.round((v.tavDone/p.numTav)*100)}%`,W-2,barY+barH+16);
}

export function recordTavola(p, tavNum){
  if(!p.velocityLog) p.velocityLog = [];
  const alreadyLogged = p.velocityLog.some(e => e.tav === tavNum);
  if(!alreadyLogged){
    p.velocityLog.push({ tav: tavNum, date: Date.now() });
  }
}

export function removeTavola(p, tavNum){
  if(!p.velocityLog) return;
  p.velocityLog = p.velocityLog.filter(e => e.tav !== tavNum);
}

export function renderVelocityHistory(p){
  const canvas = document.getElementById('history-canvas');
  const legend = document.getElementById('history-legend');
  if(!canvas) return;

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

  const weekMap = {};
  log.forEach(entry => {
    const d = new Date(entry.date);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    monday.setHours(0,0,0,0);
    weekMap[monday.getTime()] = (weekMap[monday.getTime()]||0) + 1;
  });

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

  const pts = weeks.map((w, i) => ({
    x: padL + (i/(weeks.length-1))*chartW,
    y: padT + chartH - (w.count/maxCount)*chartH,
    count: w.count,
    date: w.date,
    isNow: i === weeks.length-1,
  }));

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

  ctx.beginPath();
  pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
  ctx.strokeStyle = '#4ab8d8';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);
  ctx.stroke();

  const targetY = padT + chartH - (2/maxCount)*chartH;
  ctx.setLineDash([4,3]);
  ctx.strokeStyle = 'rgba(232,72,72,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL, targetY); ctx.lineTo(W-padR, targetY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(232,72,72,.5)';
  ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('obiettivo', W-padR, targetY-3);

  pts.forEach((pt, i) => {
    const color = pt.isNow ? '#2a88b8' : pt.count >= 2 ? '#48a848' : pt.count === 1 ? '#f0c020' : '#c8b898';
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.count > 0 ? 4 : 2.5, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    if(pt.count > 0){
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if(pt.count > 0){
      ctx.fillStyle = color;
      ctx.font = `bold 10px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(pt.count, pt.x, pt.y - 8);
    }
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
