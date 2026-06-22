import { PHASE_NAMES } from './state.js';

export function calcPct(p){
  if(p.type === 'sequence'){
    // Sequenza: avanzamento basato sulle tavole + 1 "step" implicito (scrittura avviata)
    const total = (p.numTav||10) + 1;
    let done = (p.scenes && p.scenes.length > 0) ? 1 : 0;
    done += Object.values(p.tavole||{}).filter(v=>v>=4).length;
    return total ? Math.round(done/total*100) : 0;
  }
  const total=5+(p.numTav||10);
  let done=Object.values(p.steps||{}).filter(Boolean).length;
  done+=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  return total?Math.round(done/total*100):0;
}
export function getPhaseIndex(p){
  if(p.type === 'sequence'){
    // Fase derivata dalle tavole: nessuna tavola=Sviluppo, alcune=Realizzazione
    const tavDone = Object.values(p.tavole||{}).filter(v=>v>=4).length;
    const tavStarted = Object.values(p.tavole||{}).filter(v=>v>0).length;
    if(tavStarted === 0) return 0;          // sto ancora scrivendo/sviluppando
    return 2;                                // sto realizzando tavole
  }
  const d=Object.values(p.steps||{}).filter(Boolean).length;if(d<3)return 0;if(d<5)return 1;return 2;
}
export function updateProgress(p){
  const pct=calcPct(p);
  const isSeq = p.type === 'sequence';
  const total = isSeq ? (p.numTav||10)+1 : 5+(p.numTav||10);
  let done;
  if(isSeq){
    done = ((p.scenes && p.scenes.length>0)?1:0) + Object.values(p.tavole||{}).filter(v=>v>=4).length;
  } else {
    done = Object.values(p.steps||{}).filter(Boolean).length+Object.values(p.tavole||{}).filter(v=>v>=4).length;
  }
  document.getElementById('prog-fill').style.width=pct+'%';
  document.getElementById('prog-lbl').textContent=done+' / '+total+' step';
  document.getElementById('meta-pct').textContent=pct+'%';
  document.getElementById('meta-fase').textContent=PHASE_NAMES[getPhaseIndex(p)];
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  if(isSeq){
    // Badge fasi per la Sequenza
    const hasScenes = p.scenes && p.scenes.length>0;
    const tavStarted = Object.values(p.tavole||{}).filter(v=>v>0).length;
    document.getElementById('ph1-badge').textContent = hasScenes ? 'in corso' : 'in corso';
    document.getElementById('ph2-badge').textContent = tavStarted>0 ? 'completata ✓' : 'non iniziata';
    document.getElementById('ph3-badge').textContent = tavDone===p.numTav ? 'completata ✓' : (tavStarted>0?'in corso':'non iniziata');
    return;
  }
  const ph1d=document.querySelectorAll('#ph1 .step-chk.done').length;
  const ph2d=document.querySelectorAll('#ph2 .step-chk.done').length;
  document.getElementById('ph1-badge').textContent=ph1d===3?'completata ✓':'in corso';
  document.getElementById('ph2-badge').textContent=ph2d===2?'completata ✓':ph1d===3?'in corso':'non iniziata';
  document.getElementById('ph3-badge').textContent=tavDone===p.numTav?'completata ✓':ph1d===3&&ph2d===2?'in corso':'non iniziata';
}
