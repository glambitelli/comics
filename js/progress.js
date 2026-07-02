import { PHASE_NAMES } from './state.js';

export function calcPct(p){
  const total=5+(p.numTav||10);
  let done=Object.values(p.steps||{}).filter(Boolean).length;
  done+=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  return total?Math.round(done/total*100):0;
}
export function getPhaseIndex(p){
  const d=Object.values(p.steps||{}).filter(Boolean).length;if(d<3)return 0;if(d<5)return 1;return 2;
}
export function updateProgress(p){
  const pct=calcPct(p);
  const total = 5+(p.numTav||10);
  const done = Object.values(p.steps||{}).filter(Boolean).length+Object.values(p.tavole||{}).filter(v=>v>=4).length;
  document.getElementById('prog-fill').style.width=pct+'%';
  document.getElementById('prog-lbl').textContent=done+' / '+total+' step';
  document.getElementById('meta-pct').textContent=pct;
  document.getElementById('meta-fase').textContent=PHASE_NAMES[getPhaseIndex(p)];
  const stepEl=document.getElementById('meta-step');
  if(stepEl) stepEl.textContent=done+'/'+total;
  // Giorni alla scadenza: mostrato solo se c'è una data di fine
  const daysWrap=document.getElementById('meta-days-wrap');
  const daysEl=document.getElementById('meta-days');
  if(daysWrap && daysEl){
    if(p.dateEnd){
      const end=new Date(p.dateEnd); const now=new Date();
      now.setHours(0,0,0,0); end.setHours(0,0,0,0);
      const dl=Math.round((end-now)/(1000*60*60*24));
      daysEl.textContent = dl<0 ? Math.abs(dl)+'gg scaduto' : dl+'gg';
      daysWrap.style.display='';
    } else {
      daysWrap.style.display='none';
    }
  }
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  const ph1d=document.querySelectorAll('#ph1 .step-chk.done').length;
  const ph2d=document.querySelectorAll('#ph2 .step-chk.done').length;
  document.getElementById('ph1-badge').textContent=ph1d===3?'completata ✓':'in corso';
  document.getElementById('ph2-badge').textContent=ph2d===2?'completata ✓':ph1d===3?'in corso':'non iniziata';
  document.getElementById('ph3-badge').textContent=tavDone===p.numTav?'completata ✓':ph1d===3&&ph2d===2?'in corso':'non iniziata';
}
