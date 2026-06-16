import { projects } from './state.js';
import { getStreak } from './evening.js';

// ── CITAZIONI & TIPS VERIFICATI ──
// Fonti: Moebius "Breve manual para historietistas" (1996); Miyazaki "Starting Point"
const TIPS = [
  { text:"Quando disegni, devi prima liberarti dei sentimenti profondi come odio, felicità, ambizione. Questi funzionano come un blocco alla creatività.", author:"Moebius" },
  { text:"È importantissimo educare la mano. Falle raggiungere un alto livello di obbedienza, così potrà esprimere pienamente le tue idee.", author:"Moebius" },
  { text:"Attenzione a cercare troppa perfezione o troppa velocità: sono pericolose tanto quanto i loro opposti.", author:"Moebius" },
  { text:"La conoscenza della prospettiva è di suprema importanza. Le sue leggi sono un modo per guidare e ipnotizzare i tuoi lettori.", author:"Moebius" },
  { text:"In un vestito ci sono mille pieghe; devi sceglierne solo due o tre. Assicurati di scegliere quelle giuste.", author:"Moebius" },
  { text:"Viaggia ed esponiti a ogni tipo di arte, musica, cultura e architettura. Nutri la mente; nutri l'anima.", author:"Moebius" },
  { text:"La cosa più importante quando crei è sapere cosa vuoi dire. Devi avere un tema.", author:"Hayao Miyazaki" },
  { text:"Molti realizzano opere con un altissimo livello tecnico, ma con un'idea molto sfocata di cosa vogliono davvero dire.", author:"Hayao Miyazaki" },
  { text:"Se non passi del tempo a osservare le persone reali, non puoi disegnarle: non le hai mai viste davvero.", author:"Hayao Miyazaki" },
  { text:"Traggo ispirazione dalla mia vita di tutti i giorni.", author:"Hayao Miyazaki" },
];

export function getTodayTip(){
  // Tip deterministico per giorno — cambia ogni giorno ma stabile nella giornata
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  return TIPS[dayOfYear % TIPS.length];
}

// ── TROFEI / MILESTONE ──
export const TROPHIES = [
  { id:'first_project', icon:'🌱', name:'Primo passo', desc:'Hai creato il tuo primo progetto', check:()=>projects.length>=1 },
  { id:'first_soggetto', icon:'✍️', name:'Narratore', desc:'Hai scritto il tuo primo soggetto', check:()=>projects.some(p=>p.story&&p.story.soggetto&&p.story.soggetto.trim()) },
  { id:'first_struttura', icon:'🎬', name:'Architetto', desc:'Hai completato una struttura a 3 atti', check:()=>projects.some(p=>{const a=p.story&&p.story.acts;return a&&(a.setup||[]).length&&(a.confrontation||[]).length&&(a.resolution||[]).length;}) },
  { id:'first_char', icon:'👤', name:'Creatore di personaggi', desc:'Hai creato il tuo primo personaggio', check:()=>projects.some(p=>p.story&&p.story.characters&&p.story.characters.length>0) },
  { id:'first_tavola', icon:'🖊️', name:'Prima china', desc:'Hai finito la tua prima tavola', check:()=>projects.some(p=>Object.values(p.tavole||{}).some(v=>v>=4)) },
  { id:'ten_tavole', icon:'📖', name:'Dieci tavole', desc:'Hai finito 10 tavole in totale', check:()=>{let t=0;projects.forEach(p=>{t+=Object.values(p.tavole||{}).filter(v=>v>=4).length;});return t>=10;} },
  { id:'streak_7', icon:'🔥', name:'Costanza', desc:'7 giorni consecutivi di lavoro', check:()=>getStreak()>=7 },
  { id:'stars_10', icon:'⭐', name:'Dieci serate', desc:'Hai completato 10 serate', check:()=>parseInt(localStorage.getItem('inkflow_stars')||'0')>=10 },
  { id:'stars_30', icon:'🌟', name:'Trenta serate', desc:'Hai completato 30 serate', check:()=>parseInt(localStorage.getItem('inkflow_stars')||'0')>=30 },
  { id:'project_100', icon:'🏆', name:'Opera completa', desc:'Hai completato un progetto al 100%', check:()=>projects.some(p=>{const done=Object.values(p.tavole||{}).filter(v=>v>=4).length;return p.numTav>0&&done>=p.numTav;}) },
];

// ── HEATMAP ──
function getActivityData(){
  // Combina storico task + tavole finite per giorno
  const data = {};
  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  // Lo storico ha solo data "g/m" senza anno — usa anno corrente come approssimazione
  const year = new Date().getFullYear();
  history.forEach(h=>{
    if(h.date){
      const [d,m]=h.date.split('/');
      if(d&&m){
        const key=`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        data[key]=(data[key]||0)+1;
      }
    }
  });
  // Tavole finite dal velocityLog
  projects.forEach(p=>{
    (p.velocityLog||[]).forEach(e=>{
      const dt=new Date(e.date);
      const key=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      data[key]=(data[key]||0)+1;
    });
  });
  return data;
}

export function renderStats(){
  // Tip del giorno
  const tip = getTodayTip();
  const tipEl = document.getElementById('stats-tip');
  if(tipEl){
    tipEl.innerHTML = `<div style="font-size:14px;line-height:1.6;color:var(--ink);font-style:italic">"${tip.text}"</div><div style="font-size:12px;color:var(--ink3);margin-top:8px;text-align:right;font-weight:600">— ${tip.author}</div>`;
  }

  // Statistiche numeriche
  let totalTav=0, totalDone=0;
  projects.forEach(p=>{
    totalTav+=p.numTav||0;
    totalDone+=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  });
  const stars=parseInt(localStorage.getItem('inkflow_stars')||'0');
  const streak=getStreak();
  const completed=projects.filter(p=>{const d=Object.values(p.tavole||{}).filter(v=>v>=4).length;return p.numTav>0&&d>=p.numTav;}).length;

  const statsgrid=document.getElementById('stats-numbers');
  if(statsgrid_exists(statsgrid)){
    statsgrid.innerHTML=`
      <div class="stat-cell"><div class="stat-big">${totalDone}</div><div class="stat-lbl">tavole finite</div></div>
      <div class="stat-cell"><div class="stat-big">${projects.length}</div><div class="stat-lbl">progetti</div></div>
      <div class="stat-cell"><div class="stat-big">${stars}</div><div class="stat-lbl">serate</div></div>
      <div class="stat-cell"><div class="stat-big">${streak}</div><div class="stat-lbl">streak</div></div>`;
  }

  renderHeatmap();
  renderTrophies();
}

function statsgrid_exists(el){ return !!el; }

function renderHeatmap(){
  const cont=document.getElementById('stats-heatmap');
  if(!cont)return;
  const data=getActivityData();
  const now=new Date();
  const start=new Date(now); start.setDate(start.getDate()-364);
  // Allinea al lunedì
  const startDay=start.getDay();
  start.setDate(start.getDate()-(startDay===0?6:startDay-1));

  const weeks=[];
  let cur=new Date(start);
  while(cur<=now){
    const week=[];
    for(let d=0;d<7;d++){
      const key=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
      week.push({date:new Date(cur),count:data[key]||0,future:cur>now});
      cur.setDate(cur.getDate()+1);
    }
    weeks.push(week);
  }

  const cell=11, gap=3;
  const W=weeks.length*(cell+gap);
  const H=7*(cell+gap)+20;
  let svg=`<svg width="100%" viewBox="0 0 ${W} ${H}" style="max-width:100%;display:block">`;
  const MONTHS=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  let lastMonth=-1;
  weeks.forEach((week,wi)=>{
    const m=week[0].date.getMonth();
    if(m!==lastMonth&&week[0].date.getDate()<=7){
      svg+=`<text x="${wi*(cell+gap)}" y="10" font-size="9" fill="#9a9088" font-family="sans-serif">${MONTHS[m]}</text>`;
      lastMonth=m;
    }
    week.forEach((day,di)=>{
      if(day.future)return;
      const c=day.count;
      const color=c===0?'#ece5d8':c===1?'#bfe3c0':c===2?'#7fc882':c>=3?'#48a848':'#ece5d8';
      const y=14+di*(cell+gap);
      const x=wi*(cell+gap);
      svg+=`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2.5" fill="${color}"><title>${day.date.getDate()}/${day.date.getMonth()+1} · ${c} attività</title></rect>`;
    });
  });
  svg+=`</svg>`;
  cont.innerHTML=svg;

  // Legenda
  const totalDays=Object.keys(data).length;
  const legend=document.getElementById('stats-heatmap-legend');
  if(legend) legend.textContent=`${totalDays} giorni attivi nell'ultimo anno`;
}

function renderTrophies(){
  const cont=document.getElementById('stats-trophies');
  if(!cont)return;
  cont.innerHTML='';
  TROPHIES.forEach(t=>{
    const unlocked=t.check();
    const el=document.createElement('div');
    el.className='trophy'+(unlocked?' unlocked':'');
    el.innerHTML=`
      <div class="trophy-icon">${unlocked?t.icon:'🔒'}</div>
      <div class="trophy-name">${t.name}</div>
      <div class="trophy-desc">${t.desc}</div>`;
    cont.appendChild(el);
  });
}
