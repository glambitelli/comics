import { PHASE_NAMES, STEPS, stepDiFase, stepFatti } from './state.js';

// SETTE STEP, NON CINQUE. Il denominatore era scritto a mano come 5 mentre le
// caselle erano sette: la percentuale usciva gonfiata di un buon dieci per
// cento, e "done" poteva superare "total" spuntando tutto. E si contava con
// Object.values(p.steps), che tiene dentro anche le chiavi vecchie rimaste in
// archivio — quindi la stessa spunta poteva valere due volte. Adesso si conta
// sull'elenco (state.js), che di step ne conosce esattamente sette.
function totaleDi(p){ return STEPS.length + (p.numTav||10); }
function fattiDi(p){
  return stepFatti(p) + Object.values(p.tavole||{}).filter(v=>v>=4).length;
}
export function calcPct(p){
  const total=totaleDi(p);
  return total?Math.round(fattiDi(p)/total*100):0;
}
// La fase si legge dagli step DELLA fase, non dal totale: con cinque caselle in
// Sviluppo e due in Pre-produzione, contare "quante ne ho spuntate in tutto"
// faceva risultare in Pre-produzione chi aveva finito mezzo Sviluppo.
export function getPhaseIndex(p){
  if(stepFatti(p,1) < stepDiFase(1).length) return 0;
  if(stepFatti(p,2) < stepDiFase(2).length) return 1;
  return 2;
}
export function updateProgress(p){
  const pct=calcPct(p);
  const total = totaleDi(p);
  const done = fattiDi(p);
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
  // I BADGE SI CONTANO SUL PROGETTO, NON SULLO SCHERMO. Prima si contavano i
  // pallini .done nel DOM e si confrontavano con numeri scritti a mano: "fase 1
  // completata" scattava a TRE caselle su cinque e alla quarta tornava
  // indietro a "in corso". Adesso il confronto e' con quante caselle ha
  // davvero quella fase.
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  const ph1 = stepFatti(p,1) === stepDiFase(1).length;
  const ph2 = stepFatti(p,2) === stepDiFase(2).length;
  document.getElementById('ph1-badge').textContent=ph1?'completata ✓':'in corso';
  document.getElementById('ph2-badge').textContent=ph2?'completata ✓':ph1?'in corso':'non iniziata';
  document.getElementById('ph3-badge').textContent=tavDone===p.numTav?'completata ✓':ph1&&ph2?'in corso':'non iniziata';
}
