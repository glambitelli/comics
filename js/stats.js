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

// ── BACHECA TROFEI — collezione di conquiste singole ──
function getAllTrophies(){
  let totalTav=0;
  projects.forEach(p=>{ totalTav+=Object.values(p.tavole||{}).filter(v=>v>=4).length; });
  const stars=parseInt(localStorage.getItem('inkflow_stars')||'0');
  const streak=getStreak();
  const maxStreak=parseInt(localStorage.getItem('inkflow_max_streak')||'0');
  const bestStreak=Math.max(streak,maxStreak);
  const completati=projects.filter(p=>{const d=Object.values(p.tavole||{}).filter(v=>v>=4).length;return p.numTav>0&&d>=p.numTav;}).length;
  const hasSoggetto=projects.some(p=>p.story&&p.story.soggetto&&p.story.soggetto.trim());
  const hasChar=projects.some(p=>p.story&&p.story.characters&&p.story.characters.length>0);
  const hasStruttura=projects.some(p=>{const a=p.story&&p.story.acts;return a&&(a.setup||[]).length&&(a.confrontation||[]).length&&(a.resolution||[]).length;});
  const has3Char=projects.some(p=>p.story&&p.story.characters&&p.story.characters.length>=3);
  const secrets=JSON.parse(localStorage.getItem('inkflow_secrets')||'{}');

  return [
    // ── INIZIO ──
    {cat:'Inizio', icon:'🌱', name:'Il primo seme', desc:'Crea il tuo primo progetto', done:projects.length>=1},
    {cat:'Inizio', icon:'✍️', name:'La prima voce', desc:'Scrivi il tuo primo soggetto', done:hasSoggetto},
    {cat:'Inizio', icon:'👤', name:'Il primo volto', desc:'Crea il tuo primo personaggio', done:hasChar},
    {cat:'Inizio', icon:'🎭', name:'La carovana', desc:'Crea almeno 3 personaggi in un progetto', done:has3Char},
    {cat:'Inizio', icon:'🧭', name:'La rotta tracciata', desc:'Completa una struttura a 3 atti', done:hasStruttura},

    // ── TAVOLE ──
    {cat:'Tavole', icon:'🐾', name:'Orma sulla sabbia', desc:'Finisci 1 tavola', done:totalTav>=1},
    {cat:'Tavole', icon:'🌾', name:'Il viandante', desc:'Finisci 10 tavole', done:totalTav>=10},
    {cat:'Tavole', icon:'🏕️', name:'L\'accampamento', desc:'Finisci 25 tavole', done:totalTav>=25},
    {cat:'Tavole', icon:'🏜️', name:'Il nomade', desc:'Finisci 50 tavole', done:totalTav>=50},
    {cat:'Tavole', icon:'🗿', name:'Il monolite', desc:'Finisci 100 tavole', done:totalTav>=100},
    {cat:'Tavole', icon:'🏛️', name:'La città perduta', desc:'Finisci 250 tavole', done:totalTav>=250},
    {cat:'Tavole', icon:'🌅', name:'L\'orizzonte infinito', desc:'Finisci 500 tavole', done:totalTav>=500},

    // ── COSTANZA (serate) ──
    {cat:'Costanza', icon:'🌙', name:'La prima notte', desc:'Completa 1 serata', done:stars>=1},
    {cat:'Costanza', icon:'⭐', name:'Sotto le stelle', desc:'Completa 10 serate', done:stars>=10},
    {cat:'Costanza', icon:'🌌', name:'Il cielo nomade', desc:'Completa 30 serate', done:stars>=30},
    {cat:'Costanza', icon:'🪔', name:'La lampada accesa', desc:'Completa 75 serate', done:stars>=75},
    {cat:'Costanza', icon:'🌠', name:'Il sentiero notturno', desc:'Completa 150 serate', done:stars>=150},
    {cat:'Costanza', icon:'🌑', name:'Mille e una notte', desc:'Completa 365 serate', done:stars>=365},

    // ── STREAK ──
    {cat:'Costanza interrotta', icon:'✨', name:'La scintilla', desc:'3 giorni consecutivi', done:bestStreak>=3},
    {cat:'Costanza interrotta', icon:'🔥', name:'Il falò', desc:'7 giorni consecutivi', done:bestStreak>=7},
    {cat:'Costanza interrotta', icon:'🏮', name:'Il fuoco custodito', desc:'14 giorni consecutivi', done:bestStreak>=14},
    {cat:'Costanza interrotta', icon:'☀️', name:'Il sole alto', desc:'30 giorni consecutivi', done:bestStreak>=30},
    {cat:'Costanza interrotta', icon:'🔆', name:'Il miraggio eterno', desc:'100 giorni consecutivi', done:bestStreak>=100},

    // ── OPERE ──
    {cat:'Opere', icon:'💧', name:'L\'oasi', desc:'Completa un progetto al 100%', done:completati>=1},
    {cat:'Opere', icon:'🌴', name:'Il giardino', desc:'Completa 3 progetti', done:completati>=3},
    {cat:'Opere', icon:'🏯', name:'La carovaniera', desc:'Completa 5 progetti', done:completati>=5},
    {cat:'Opere', icon:'📜', name:'Il grande codice', desc:'Completa 10 progetti', done:completati>=10},

    // ── SEGRETI (nascosti finché non sbloccati) ──
    {cat:'Segreti', icon:'🦉', name:'Nottambulo', desc:'Completa una task tra mezzanotte e le 5', done:!!secrets.nottambulo, secret:true},
    {cat:'Segreti', icon:'🌄', name:'Voce dell\'alba', desc:'Completa una task tra le 5 e le 8 del mattino', done:!!secrets.albe, secret:true},
    {cat:'Segreti', icon:'🕊️', name:'Riposo del guerriero', desc:'Completa una task di domenica', done:!!secrets.domenica, secret:true},
    {cat:'Segreti', icon:'🏜️', name:'Sabato nel deserto', desc:'Completa una task di sabato', done:!!secrets.sabato, secret:true},
    {cat:'Segreti', icon:'🎍', name:'Spirito instancabile', desc:'Completa una task in un giorno di festa', done:!!secrets.festa, secret:true},
  ];
}

// ── BADGE PER PROGETTO ──
function getProjectBadges(p){
  const story=p.story||{};
  const acts=story.acts||{};
  const pp=story.pp||{};
  const tavDone=Object.values(p.tavole||{}).filter(v=>v>=4).length;
  const tavMeta=p.numTav>0&&tavDone>=Math.ceil(p.numTav/2);
  return [
    {icon:'📓', name:'Taccuino', done:!!(story.taccuino&&story.taccuino.trim())},
    {icon:'✍️', name:'Soggetto', done:!!(story.soggetto&&story.soggetto.trim())},
    {icon:'🌍', name:'Ambientazione', done:!!(story.world&&story.world.trim())},
    {icon:'👤', name:'Personaggi', done:!!(story.characters&&story.characters.length>0)},
    {icon:'⚡', name:'Inciting', done:!!(pp.inciting&&pp.inciting.trim())},
    {icon:'🎬', name:'Struttura', done:!!((acts.setup||[]).length&&(acts.confrontation||[]).length&&(acts.resolution||[]).length)},
    {icon:'⬡', name:'Plot point', done:!!(pp.pp1&&pp.pp1.trim()&&pp.pp2&&pp.pp2.trim())},
    {icon:'🖊️', name:'Prima tavola', done:tavDone>=1},
    {icon:'📈', name:'Metà strada', done:tavMeta},
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
  renderTrophyCase();
  renderProjectBadges();
}

const MONTH_NAMES_STATS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function renderMonthlyStars(){
  const cont = document.getElementById('stats-monthly');
  if(!cont) return;

  // Deriva i conteggi mensili DALLO STORICO REALE delle task completate.
  // Così non può mai desincronizzarsi dal numero di stelle.
  const history = JSON.parse(localStorage.getItem('inkflow_task_history')||'[]');
  const counts = {};
  const nowY = new Date().getFullYear();
  history.forEach(h=>{
    let d;
    if(h.ts){ d=new Date(h.ts); }
    else if(h.date){ const [dd,mm]=h.date.split('/'); d=new Date(nowY, parseInt(mm)-1, parseInt(dd)); }
    if(d && !isNaN(d)){
      const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      counts[key]=(counts[key]||0)+1;
    }
  });

  const months = [];
  const now = new Date();
  for(let i=11; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    months.push({ label: MONTH_NAMES_STATS[d.getMonth()], count: counts[key]||0, isCurrent: i===0 });
  }
  const maxCount = Math.max(...months.map(m=>m.count), 1);
  const total = months.reduce((a,m)=>a+m.count,0);

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

function renderTrophyCase(){
  const cont=document.getElementById('stats-achievements');
  if(!cont)return;
  const trophies=getAllTrophies();
  const earned=trophies.filter(t=>t.done).length;

  // Raggruppa per categoria
  const cats={};
  trophies.forEach(t=>{ (cats[t.cat]=cats[t.cat]||[]).push(t); });

  let html=`<div class="trophy-progress"><span>${earned} di ${trophies.length} trofei</span><div class="trophy-progress-bar"><div class="trophy-progress-fill" style="width:${Math.round(earned/trophies.length*100)}%"></div></div></div>`;

  Object.keys(cats).forEach(cat=>{
    // Per i segreti: mostra quanti sbloccati su totali nel titolo
    if(cat==='Segreti'){
      const got=cats[cat].filter(t=>t.done).length;
      html+=`<div class="trophy-cat">${cat} <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:.6">· ${got}/${cats[cat].length} scoperti</span></div><div class="trophy-grid">`;
    } else {
      html+=`<div class="trophy-cat">${cat}</div><div class="trophy-grid">`;
    }
    cats[cat].forEach(t=>{
      const isSecret = t.secret && !t.done;
      const icon = t.done ? t.icon : (isSecret ? '❔' : '🔒');
      const name = isSecret ? '???' : t.name;
      const tip = isSecret ? 'Trofeo segreto — scoprilo lavorando' : t.desc;
      html+=`<div class="trophy-medal${t.done?' earned':''}${isSecret?' secret':''}" title="${tip}">
        <div class="trophy-medal-icon">${icon}</div>
        <div class="trophy-medal-name">${name}</div>
      </div>`;
    });
    html+=`</div>`;
  });

  cont.innerHTML=html;
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
        ${badges.map(b=>`<div class="proj-badge${b.done?' earned':''}" title="${b.name}"><span>${b.done?b.icon:'🔒'}</span><span class="proj-badge-lbl">${b.name}</span></div>`).join('')}
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

  const cell=13, gap=3;
  const leftPad=4, topPad=18;
  const W=weeks.length*(cell+gap)+leftPad;
  const H=7*(cell+gap)+topPad;
  // width 100% con viewBox: riempie la card mantenendo proporzioni — via di mezzo
  let svg=`<svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block">`;
  const MONTHS=['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  let lastMonth=-1;
  weeks.forEach((week,wi)=>{
    const m=week[0].date.getMonth();
    if(m!==lastMonth&&week[0].date.getDate()<=7){
      svg+=`<text x="${leftPad+wi*(cell+gap)}" y="9" font-size="8" fill="#9a9088" font-family="sans-serif">${MONTHS[m]}</text>`;
      lastMonth=m;
    }
    week.forEach((day,di)=>{
      if(day.future)return;
      const c=day.count;
      const color=c===0?'#ece5d8':c===1?'#bfe3c0':c===2?'#7fc882':'#48a848';
      const y=topPad+di*(cell+gap);
      const x=leftPad+wi*(cell+gap);
      const plural=c===1?'attività':'attività';
      svg+=`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${color}"><title>${day.date.getDate()}/${day.date.getMonth()+1} · ${c} ${plural}</title></rect>`;
    });
  });
  svg+=`</svg>`;
  cont.innerHTML=svg;

  // Legenda con spiegazione + scala colori
  const totalDays=Object.keys(data).length;
  const legend=document.getElementById('stats-heatmap-legend');
  if(legend){
    legend.innerHTML=`
      <div style="margin-bottom:8px">Ogni quadrato è un giorno. Più è verde, più hai lavorato (task serali completate + tavole finite).</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:10px;color:var(--ink3)">
        <span>meno</span>
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ece5d8"></span>
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#bfe3c0"></span>
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#7fc882"></span>
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#48a848"></span>
        <span>più</span>
        <span style="margin-left:8px;font-weight:600">${totalDays} giorni attivi</span>
      </div>`;
  }
}

