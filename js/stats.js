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

// ── TRAGUARDI GLOBALI A LIVELLI ──
function getGlobalAchievements(){
  let totalTav=0;
  projects.forEach(p=>{ totalTav+=Object.values(p.tavole||{}).filter(v=>v>=4).length; });
  const stars=parseInt(localStorage.getItem('inkflow_stars')||'0');
  const streak=getStreak();
  const maxStreak=parseInt(localStorage.getItem('inkflow_max_streak')||'0');
  const bestStreak=Math.max(streak,maxStreak);

  return [
    {
      icon:'🖊️', name:'Tavole finite',
      value:totalTav,
      levels:[1,10,50,100,250,500],
      labels:['Prima china','Dieci tavole','Cinquanta','Cento','Duecentocinquanta','Cinquecento'],
    },
    {
      icon:'⭐', name:'Serate completate',
      value:stars,
      levels:[1,10,30,60,120,365],
      labels:['Prima sera','Dieci serate','Trenta','Sessanta','Cento­venti','Un anno'],
    },
    {
      icon:'🔥', name:'Streak record',
      value:bestStreak,
      levels:[3,7,14,30,60,100],
      labels:['Tre giorni','Una settimana','Due settimane','Un mese','Due mesi','Cento giorni'],
    },
  ];
}

// ── BADGE PER PROGETTO ──
function getProjectBadges(p){
  const story=p.story||{};
  const acts=story.acts||{};
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  return [
    {icon:'✍️', name:'Soggetto', done:!!(story.soggetto&&story.soggetto.trim())},
    {icon:'👤', name:'Personaggi', done:!!(story.characters&&story.characters.length>0)},
    {icon:'🎬', name:'Struttura', done:!!((acts.setup||[]).length&&(acts.confrontation||[]).length&&(acts.resolution||[]).length)},
    {icon:'🖊️', name:'Prima tavola', done:tavDone>=1},
    {icon:'🏆', name:'Completato', done:p.numTav>0&&tavDone>=p.numTav},
  ];
}

export function renderStats(){
  // Statistiche numeriche
  let totalTav=0, totalDone=0;
  projects.forEach(p=>{
    totalTav+=p.numTav||0;
    totalDone+=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  });
  const stars=parseInt(localStorage.getItem('inkflow_stars')||'0');
  const streak=getStreak();

  const statsgrid=document.getElementById('stats-numbers');
  if(statsgrid){
    statsgrid.innerHTML=`
      <div class="stat-cell"><div class="stat-big">${totalDone}</div><div class="stat-lbl">tavole finite</div></div>
      <div class="stat-cell"><div class="stat-big">${projects.length}</div><div class="stat-lbl">progetti</div></div>
      <div class="stat-cell"><div class="stat-big">${stars}</div><div class="stat-lbl">serate</div></div>
      <div class="stat-cell"><div class="stat-big">${streak}</div><div class="stat-lbl">streak</div></div>`;
  }

  renderHeatmap();
  renderMonthlyStars();
  renderGlobalAchievements();
  renderProjectBadges();
}

const MONTH_NAMES_STATS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function renderMonthlyStars(){
  const cont = document.getElementById('stats-monthly');
  if(!cont) return;
  const monthly = JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}');

  const months = [];
  const now = new Date();
  for(let i=11; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push({ label: MONTH_NAMES_STATS[d.getMonth()], count: monthly[key]||0, isCurrent: i===0 });
  }
  const maxCount = Math.max(...months.map(m=>m.count), 1);
  const total = Object.values(monthly).reduce((a,b)=>a+b,0);

  let html = `<div style="display:flex;gap:6px;align-items:flex-end;height:90px;margin-bottom:6px">`;
  months.forEach(m=>{
    if(m.count>0){
      const barH = Math.max(8, Math.round((m.count/maxCount)*60));
      const color = m.isCurrent ? 'var(--sky)' : m.count>=maxCount*0.8 ? 'var(--green)' : m.count>=maxCount*0.4 ? 'var(--gold)' : 'var(--sand3)';
      html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end">
        <div style="font-size:10px;font-weight:700;color:var(--ink3)">${m.count}</div>
        <div style="height:${barH}px;width:100%;border-radius:4px 4px 0 0;background:${color}"></div>
        <div style="font-size:9px;color:${m.isCurrent?'var(--sky-deep)':'var(--ink3)'};font-weight:${m.isCurrent?'700':'400'}">${m.label}</div>
      </div>`;
    } else {
      html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end">
        <div style="height:3px;width:100%;border-radius:2px;background:var(--sand2);margin-bottom:14px"></div>
        <div style="font-size:9px;color:var(--ink3)">${m.label}</div>
      </div>`;
    }
  });
  html += `</div><div style="font-size:11px;color:var(--ink3);text-align:center">${total} stelle totali</div>`;
  cont.innerHTML = html;
}

function renderGlobalAchievements(){
  const cont=document.getElementById('stats-achievements');
  if(!cont)return;
  cont.innerHTML='';
  getGlobalAchievements().forEach(a=>{
    // Trova livello attuale e prossimo
    let currentLevel=0, nextThreshold=a.levels[0];
    for(let i=0;i<a.levels.length;i++){
      if(a.value>=a.levels[i]){ currentLevel=i+1; nextThreshold=a.levels[i+1]||a.levels[i]; }
    }
    const isMaxed=currentLevel>=a.levels.length;
    const currentLabel=currentLevel>0?a.labels[currentLevel-1]:'Non ancora sbloccato';
    const progress=isMaxed?100:Math.min(100,Math.round((a.value/nextThreshold)*100));

    const el=document.createElement('div');
    el.className='achievement';
    el.innerHTML=`
      <div class="ach-icon"${currentLevel===0?' style="opacity:.35;filter:grayscale(1)"':''}>${a.icon}</div>
      <div class="ach-body">
        <div class="ach-top"><span class="ach-name">${a.name}</span><span class="ach-level">${currentLevel>0?'Lv. '+currentLevel:''}</span></div>
        <div class="ach-label">${currentLabel}</div>
        <div class="ach-bar"><div class="ach-bar-fill" style="width:${progress}%"></div></div>
        <div class="ach-next">${isMaxed?'★ Massimo livello raggiunto':a.value+' / '+nextThreshold}</div>
      </div>`;
    cont.appendChild(el);
  });
}

function renderProjectBadges(){
  const cont=document.getElementById('stats-project-badges');
  if(!cont)return;
  cont.innerHTML='';
  if(projects.length===0){
    cont.innerHTML='<div style="font-size:12px;color:var(--ink3);font-style:italic;text-align:center;padding:10px">Nessun progetto ancora</div>';
    return;
  }
  projects.forEach(p=>{
    const badges=getProjectBadges(p);
    const earned=badges.filter(b=>b.done).length;
    const color=p.color||'#4ab8d8';

    const row=document.createElement('div');
    row.className='proj-badge-row';
    row.innerHTML=`
      <div class="proj-badge-head">
        <span class="proj-badge-dot" style="background:${color}"></span>
        <span class="proj-badge-title">${escHtmlStats(p.title)}</span>
        <span class="proj-badge-count">${earned}/${badges.length}</span>
      </div>
      <div class="proj-badge-icons">
        ${badges.map(b=>`<div class="proj-badge${b.done?' earned':''}" title="${b.name}">${b.done?b.icon:'🔒'}</div>`).join('')}
      </div>`;
    cont.appendChild(row);
  });
}

function escHtmlStats(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

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

