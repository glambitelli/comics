import { getProject, currentId } from './state.js';
import { scheduleSave } from './firebase.js';
import { renderDeadline, renderVelocity, renderPhaseCalendar } from './velocity.js';

export function updatePlanner(){
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

  const summary = document.getElementById('planner-summary');
  if(summary){
    summary.innerHTML = `
      <span style="color:#7F77DD">■ Sviluppo</span> ${fmt(start)} → ${fmt(endSviluppo)} (${weeksS} sett.) &nbsp;
      <span style="color:#4ab8d8">■ Pre-prod.</span> ${fmt(endSviluppo)} → ${fmt(endPreProd)} (${weeksP} sett.) &nbsp;
      <span style="color:#48a848">■ Realizzazione</span> ${fmt(endPreProd)} → ${fmt(endReal)} (${weeksR} sett. · ${numTav} tavole a ${velocity}/sett.)
      <br><strong>Deadline calcolata: ${fmt(endReal)}</strong> · ${totalWeeks} settimane totali`;
  }

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
    ctx.fillStyle = ph.light;
    ctx.beginPath();
    if(i===0) ctx.roundRect(x, barY, bw, barH, [8,0,0,8]);
    else if(isLast) ctx.roundRect(x, barY, bw, barH, [0,8,8,0]);
    else ctx.rect(x, barY, bw, barH);
    ctx.fill();
    ctx.fillStyle = ph.color;
    ctx.beginPath();
    if(i===0) ctx.roundRect(x, barY, bw, 4, [8,0,0,8]);
    else if(isLast) ctx.roundRect(x, barY, bw, 4, [0,8,8,0]);
    else ctx.rect(x, barY, bw, 4);
    ctx.fill();
    ctx.fillStyle = ph.color;
    ctx.font = `bold 11px sans-serif`;
    ctx.textAlign = 'center';
    if(bw > 40) ctx.fillText(ph.label, x+bw/2, barY+barH-8);
    if(!isLast){
      ctx.fillStyle = '#fff';
      ctx.fillRect(x+bw-1, barY, 2, barH);
    }
    ctx.fillStyle = '#9a9088';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    if(bw > 30) ctx.fillText(`${ph.weeks}w`, x+bw/2, barY+barH+12);
    x += bw;
  });

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

export function openPlannerModal(){
  const startVal = document.getElementById('date-start').value;
  if(!startVal){ alert('Imposta prima la data di inizio'); return; }
  document.getElementById('planner-modal').classList.add('open');
  requestAnimationFrame(()=>updatePlanner());
}

export function closePlannerModal(){
  document.getElementById('planner-modal').classList.remove('open');
}

export function applyPlanner(){
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

  const fmt = d => `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
  const btn = document.getElementById('date-end-btn');
  const lbl = document.getElementById('date-end-label');
  if(lbl) lbl.textContent = fmt(end);
  if(btn) btn.style.color = 'var(--ink)';

  scheduleSave(p);
  renderDeadline(p);
  renderVelocity(p);
  renderPhaseCalendar(p);
  closePlannerModal();
}

export function restorePlanner(p){
  if(p.plannerSettings){
    const s = p.plannerSettings;
    const sv = document.getElementById('plan-sviluppo');
    const pp = document.getElementById('plan-preprod');
    const vl = document.getElementById('plan-velocity');
    if(sv) sv.value = s.sviluppo||2;
    if(pp) pp.value = s.preprod||2;
    if(vl) vl.value = s.velocity||2;
  }
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
