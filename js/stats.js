import { projects , loadJSON } from './state.js';
import { getStreak } from './evening.js';

// ── GLIFI MINIMALI (SVG, currentColor) — sostituiscono le emoji dei trofei ──
const GLYPHS = {
  germoglio:'<path d="M12 20 V11" class="ln"/><path d="M12 12 C12 8 9 7 6 7 C6 11 9 12 12 12 Z"/><path d="M12 10 C12 6.5 15 5.5 18 5.5 C18 9.5 15 10.5 12 10.5 Z"/>',
  penna:'<path d="M12 3 L17 12 L12 16 L7 12 Z"/><path d="M12 16 V20" class="ln"/>',
  volto:'<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20 a7.5 6 0 0 1 15 0 Z"/>',
  gruppo:'<circle cx="6" cy="12" r="2.6"/><circle cx="12" cy="9" r="3"/><circle cx="18" cy="12" r="2.6"/>',
  bussola:'<circle cx="12" cy="12" r="8.5" class="out"/><path d="M12 6.5 L14.2 12 L12 17.5 L9.8 12 Z"/>',
  orma:'<ellipse cx="11" cy="14" rx="4" ry="5.5"/><circle cx="16.5" cy="8" r="2.2"/>',
  duna:'<path d="M2 17 Q8 8 13 13 T22 12 L22 19 L2 19 Z"/>',
  tenda:'<path d="M12 4 L21 20 H14 L12 15 L10 20 H3 Z"/>',
  monolite:'<path d="M9 3 L15 3 L14 21 L10 21 Z"/>',
  citta:'<rect x="3" y="11" width="4.5" height="10"/><rect x="9.5" y="5" width="4.5" height="16"/><rect x="16" y="9" width="4.5" height="12"/>',
  orizzonte:'<path d="M12 5 a7 7 0 0 1 7 7 H5 a7 7 0 0 1 7 -7 Z"/><path d="M2 15 H22" class="ln"/>',
  crescente:'<path d="M15.5 3 A9.5 9.5 0 1 0 21 14.5 A7.5 7.5 0 1 1 15.5 3 Z"/>',
  stella:'<path d="M12 2 L14.3 9.7 L22 12 L14.3 14.3 L12 22 L9.7 14.3 L2 12 L9.7 9.7 Z"/>',
  costellazione:'<path d="M8 5 L9.6 9.4 L14 11 L9.6 12.6 L8 17 L6.4 12.6 L2 11 L6.4 9.4 Z"/><circle cx="17" cy="6" r="2"/><circle cx="19" cy="17" r="2.4"/>',
  lampada:'<path d="M12 4 C15 8 16.5 10.5 16.5 13 A4.5 4.5 0 0 1 7.5 13 C7.5 10.5 9 8 12 4 Z"/><path d="M8 20 H16" class="ln"/>',
  notturno:'<path d="M14 3 A8 8 0 1 0 19 13 A6.3 6.3 0 1 1 14 3 Z"/><circle cx="18.5" cy="5.5" r="1.8"/>',
  lunapiena:'<circle cx="12" cy="12" r="8.5"/>',
  scintilla:'<path d="M12 4 L13.8 10.2 L20 12 L13.8 13.8 L12 20 L10.2 13.8 L4 12 L10.2 10.2 Z"/>',
  fiamma:'<path d="M12 3 C15.5 7.5 17 10.5 17 13.5 A5 5 0 0 1 7 13.5 C7 12 7.7 10.3 9 8.6 C9.4 10 10.2 10.8 11 11 C10.6 8.4 11 5.6 12 3 Z"/>',
  focolare:'<circle cx="12" cy="12" r="9" class="out"/><path d="M12 7 C14 9.7 15 11.4 15 13.2 A3 3 0 0 1 9 13.2 C9 11.4 10 9.7 12 7 Z"/>',
  sole:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5 V5.5 M12 18.5 V21.5 M2.5 12 H5.5 M18.5 12 H21.5 M5.3 5.3 L7.4 7.4 M16.6 16.6 L18.7 18.7 M18.7 5.3 L16.6 7.4 M7.4 16.6 L5.3 18.7" class="ln"/>',
  miraggio:'<path d="M3 8 Q7 5 11 8 T19 8 M5 13 Q9 10 13 13 T21 13 M3 18 Q7 15 11 18 T19 18" class="ln"/>',
  goccia:'<path d="M12 3 C15.5 8 17.5 11 17.5 14 A5.5 5.5 0 0 1 6.5 14 C6.5 11 8.5 8 12 3 Z"/>',
  palma:'<path d="M11 21 C11.5 16 11.5 12 12 9" class="ln"/><path d="M12 9 C9 5.5 5.5 5.5 3 7.5 C6 9.5 9.5 9.5 12 9 Z"/><path d="M12 9 C15 5.5 18.5 5.5 21 7.5 C18 9.5 14.5 9.5 12 9 Z"/><path d="M12 9 C11 5.5 8.5 3.5 6.5 3 C7.5 6 9.5 8 12 9 Z"/>',
  arco:'<path d="M5 21 V11 a7 7 0 0 1 14 0 V21 h-4 V11 a3 3 0 0 0 -6 0 V21 Z"/>',
  codice:'<rect x="6" y="3" width="12" height="18" rx="2" class="out"/><path d="M9 8 H15 M9 12 H15 M9 16 H13" class="ln2"/>',
  gufo:'<circle cx="12" cy="12" r="8.5" class="out"/><circle cx="9" cy="11" r="1.7"/><circle cx="15" cy="11" r="1.7"/>',
  alba:'<path d="M12 8 a6 6 0 0 1 6 6 H6 a6 6 0 0 1 6 -6 Z"/><path d="M12 2.5 V5 M5 6.5 L6.8 8.3 M19 6.5 L17.2 8.3 M2.5 14 H21.5" class="ln"/>',
  colomba:'<path d="M3 10 Q8 6 12 10 M12 10 Q16 6 21 10" class="ln"/>',
  bandiera:'<path d="M7 3 V21" class="ln"/><path d="M7 4 H18 L15 8 L18 12 H7 Z"/>',
  lucchetto:'<rect x="6" y="10" width="12" height="9" rx="2"/><path d="M9 10 V7.5 a3 3 0 0 1 6 0 V10" class="out"/>',
  taccuino:'<rect x="5" y="3" width="14" height="18" rx="2" class="out"/><path d="M9 3 V21" class="ln2"/>',
  mondo:'<circle cx="12" cy="12" r="8.5" class="out"/><ellipse cx="12" cy="12" rx="4" ry="8.5" class="out2"/><path d="M3.5 12 H20.5" class="ln2"/>',
  fulmine:'<path d="M13 2 L5 13 H11 L9.5 22 L19 10 H12.5 Z"/>',
  colonne:'<rect x="4" y="8" width="4" height="13"/><rect x="10" y="4" width="4" height="17"/><rect x="16" y="11" width="4" height="10"/>',
  esagono:'<path d="M12 3 L19.5 7.5 V16.5 L12 21 L4.5 16.5 V7.5 Z" class="out"/>',
  pannello:'<rect x="4" y="4" width="16" height="16" rx="2" class="out"/><path d="M4 12 H20" class="ln2"/>',
  meta:'<circle cx="12" cy="12" r="8.5" class="out"/><path d="M12 3.5 A8.5 8.5 0 0 1 12 20.5 Z"/>',
  punto:'<circle cx="12" cy="12" r="5"/>',
  domanda:'<path d="M8.5 9 a3.5 3.5 0 1 1 5 3.2 c-1 .5 -1.5 1.2 -1.5 2.3" class="ln"/><circle cx="12" cy="18.5" r="1.6"/>',
};
export function glyphSvg(name){
  const g=(GLYPHS[name]||GLYPHS.punto)
    .replace(/class="ln"/g,'fill="none" stroke-width="2" stroke-linecap="round"')
    .replace(/class="ln2"/g,'fill="none" stroke-width="1.6" stroke-linecap="round"')
    .replace(/class="out"/g,'fill="none" stroke-width="2"')
    .replace(/class="out2"/g,'fill="none" stroke-width="1.4"');
  return '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-linejoin="round" style="width:100%;height:100%;display:block">'+g+'</svg>';
}

// ── CITAZIONI & TIPS VERIFICATI ──
// Fonti: Moebius "Breve manual para historietistas" (1996); Miyazaki "Starting Point";
// James Cameron (MasterClass, intervista Charlie Rose, Variety); Quentin Tarantino (interviste Creative Screenwriting, Far Out)
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
  // ── James Cameron ──
  { text:"Devi trovare una chiave per il cuore del pubblico: temi universali, espressi in modi nuovi e sorprendenti.", author:"James Cameron" },
  { text:"Comincio sempre dal finale: mi chiedo se il punto in cui tutto arriva saprà emozionarmi.", author:"James Cameron" },
  { text:"Ci deve essere conflitto: i personaggi si rivelano attraverso il conflitto, il tradimento e la perdita.", author:"James Cameron" },
  { text:"Molti non realizzano i loro sogni perché ci pensano troppo, o sono troppo cauti per fare il salto.", author:"James Cameron" },
  // ── Quentin Tarantino ──
  { text:"Metto i personaggi nella stanza insieme e li lascio parlare: sono loro a fare la maggior parte del lavoro.", author:"Quentin Tarantino" },
  { text:"So dove deve arrivare la scena, ma non costruisco i dialoghi a tavolino per arrivarci.", author:"Quentin Tarantino" },
  { text:"L'obiettivo è far prendere fuoco alla conversazione tra i personaggi.", author:"Quentin Tarantino" },
  { text:"Prometti al pubblico, fin dalle prime battute, che sta per succedere qualcosa di interessante.", author:"Quentin Tarantino" },
  { text:"Ogni parola conta: a volte ciò che non viene detto è potente quanto ciò che si dice.", author:"Quentin Tarantino" },
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
  const history = loadJSON('inkflow_task_history', []);
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
  const secrets=loadJSON('inkflow_secrets', {});

  return [
    // ── INIZIO ──
    {cat:'Inizio', icon:'germoglio', name:'Il primo seme', desc:'Crea il tuo primo progetto', done:projects.length>=1},
    {cat:'Inizio', icon:'penna', name:'La prima voce', desc:'Scrivi il tuo primo soggetto', done:hasSoggetto},
    {cat:'Inizio', icon:'volto', name:'Il primo volto', desc:'Crea il tuo primo personaggio', done:hasChar},
    {cat:'Inizio', icon:'gruppo', name:'La carovana', desc:'Crea almeno 3 personaggi in un progetto', done:has3Char},
    {cat:'Inizio', icon:'bussola', name:'La rotta tracciata', desc:'Completa una struttura a 3 atti', done:hasStruttura},

    // ── TAVOLE ──
    {cat:'Tavole', icon:'orma', name:'Orma sulla sabbia', desc:'Finisci 1 tavola', done:totalTav>=1},
    {cat:'Tavole', icon:'duna', name:'Il viandante', desc:'Finisci 10 tavole', done:totalTav>=10},
    {cat:'Tavole', icon:'tenda', name:'L\'accampamento', desc:'Finisci 25 tavole', done:totalTav>=25},
    {cat:'Tavole', icon:'duna', name:'Il nomade', desc:'Finisci 50 tavole', done:totalTav>=50},
    {cat:'Tavole', icon:'monolite', name:'Il monolite', desc:'Finisci 100 tavole', done:totalTav>=100},
    {cat:'Tavole', icon:'citta', name:'La città perduta', desc:'Finisci 250 tavole', done:totalTav>=250},
    {cat:'Tavole', icon:'orizzonte', name:'L\'orizzonte infinito', desc:'Finisci 500 tavole', done:totalTav>=500},

    // ── COSTANZA (serate) ──
    {cat:'Costanza', icon:'crescente', name:'La prima notte', desc:'Completa 1 serata', done:stars>=1},
    {cat:'Costanza', icon:'stella', name:'Sotto le stelle', desc:'Completa 10 serate', done:stars>=10},
    {cat:'Costanza', icon:'costellazione', name:'Il cielo nomade', desc:'Completa 30 serate', done:stars>=30},
    {cat:'Costanza', icon:'lampada', name:'La lampada accesa', desc:'Completa 75 serate', done:stars>=75},
    {cat:'Costanza', icon:'notturno', name:'Il sentiero notturno', desc:'Completa 150 serate', done:stars>=150},
    {cat:'Costanza', icon:'lunapiena', name:'Mille e una notte', desc:'Completa 365 serate', done:stars>=365},

    // ── STREAK ──
    {cat:'Costanza interrotta', icon:'scintilla', name:'La scintilla', desc:'3 giorni consecutivi', done:bestStreak>=3},
    {cat:'Costanza interrotta', icon:'fiamma', name:'Il falò', desc:'7 giorni consecutivi', done:bestStreak>=7},
    {cat:'Costanza interrotta', icon:'focolare', name:'Il fuoco custodito', desc:'14 giorni consecutivi', done:bestStreak>=14},
    {cat:'Costanza interrotta', icon:'sole', name:'Il sole alto', desc:'30 giorni consecutivi', done:bestStreak>=30},
    {cat:'Costanza interrotta', icon:'miraggio', name:'Il miraggio eterno', desc:'100 giorni consecutivi', done:bestStreak>=100},

    // ── OPERE ──
    {cat:'Opere', icon:'goccia', name:'L\'oasi', desc:'Completa un progetto al 100%', done:completati>=1},
    {cat:'Opere', icon:'palma', name:'Il giardino', desc:'Completa 3 progetti', done:completati>=3},
    {cat:'Opere', icon:'arco', name:'La carovaniera', desc:'Completa 5 progetti', done:completati>=5},
    {cat:'Opere', icon:'codice', name:'Il grande codice', desc:'Completa 10 progetti', done:completati>=10},

    // ── SEGRETI (nascosti finché non sbloccati) ──
    {cat:'Segreti', icon:'gufo', name:'Nottambulo', desc:'Completa una task tra mezzanotte e le 5', done:!!secrets.nottambulo, secret:true},
    {cat:'Segreti', icon:'alba', name:'Voce dell\'alba', desc:'Completa una task tra le 5 e le 8 del mattino', done:!!secrets.albe, secret:true},
    {cat:'Segreti', icon:'colomba', name:'Riposo del guerriero', desc:'Completa una task di domenica', done:!!secrets.domenica, secret:true},
    {cat:'Segreti', icon:'duna', name:'Sabato nel deserto', desc:'Completa una task di sabato', done:!!secrets.sabato, secret:true},
    {cat:'Segreti', icon:'bandiera', name:'Spirito instancabile', desc:'Completa una task in un giorno di festa', done:!!secrets.festa, secret:true},
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
    {icon:'taccuino', name:'Taccuino', done:!!(story.taccuino&&story.taccuino.trim())},
    {icon:'penna', name:'Soggetto', done:!!(story.soggetto&&story.soggetto.trim())},
    {icon:'mondo', name:'Ambientazione', done:!!(story.world&&story.world.trim())},
    {icon:'volto', name:'Personaggi', done:!!(story.characters&&story.characters.length>0)},
    {icon:'fulmine', name:'Inciting', done:!!(pp.inciting&&pp.inciting.trim())},
    {icon:'colonne', name:'Struttura', done:!!((acts.setup||[]).length&&(acts.confrontation||[]).length&&(acts.resolution||[]).length)},
    {icon:'esagono', name:'Plot point', done:!!(pp.pp1&&pp.pp1.trim()&&pp.pp2&&pp.pp2.trim())},
    {icon:'pannello', name:'Prima tavola', done:tavDone>=1},
    {icon:'meta', name:'Metà strada', done:tavMeta},
    {icon:'stella', name:'Completato', done:p.numTav>0&&tavDone>=p.numTav},
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
  renderStageDonut();
  renderWeekdayChart();
  renderTrophyCase();
  renderProjectBadges();
}

// ── DONUT: tavole per stadio (tutti i progetti) ──
function renderStageDonut(){
  const cont=document.getElementById('stats-stage-donut');
  if(!cont) return;
  const STAGES=['Matite','Inchiostro','Retini','Balloon','Finita'];
  const COLORS=['#ece2cd','#e8d4a0','#ddbe72','#cca343','#b8860f'];
  const counts=[0,0,0,0,0];
  let total=0;
  projects.forEach(p=>{
    for(let i=1;i<=(p.numTav||0);i++){
      const s=p.tavole&&p.tavole[i]!=null?p.tavole[i]:0;
      counts[Math.min(s,4)]++; total++;
    }
  });
  if(!total){ cont.innerHTML='<div style="font-size:12px;color:var(--ink3);font-style:italic;text-align:center;padding:10px">Nessuna tavola ancora</div>'; return; }
  const done=counts[4];
  // Donut SVG
  const R=42, CX=60, CY=60, SW=20;
  const C=2*Math.PI*R;
  let acc=0, segs='';
  counts.forEach((n,i)=>{
    if(!n) return;
    const frac=n/total;
    const len=frac*C;
    segs+=`<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${COLORS[i]}" stroke-width="${SW}" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-acc}" transform="rotate(-90 ${CX} ${CY})"/>`;
    acc+=len;
  });
  const legend=STAGES.map((s,i)=>`<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--ink2)"><span style="width:10px;height:10px;border-radius:2px;background:${COLORS[i]};display:inline-block"></span>${s} <strong>${counts[i]}</strong></span>`).join('');
  cont.innerHTML=`<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
    <svg viewBox="0 0 120 120" style="width:120px;height:120px;flex-shrink:0">${segs}
      <text x="${CX}" y="${CY-3}" text-anchor="middle" font-size="22" font-weight="700" fill="#2a2420" font-family="Nunito,sans-serif">${done}</text>
      <text x="${CX}" y="${CY+14}" text-anchor="middle" font-size="9" fill="#9a9088" font-family="Nunito,sans-serif">di ${total} finite</text>
    </svg>
    <div style="display:flex;flex-direction:column;gap:5px">${legend}</div>
  </div>`;
}

// ── ISTOGRAMMA: ritmo settimanale (task completate per giorno della settimana) ──
function renderWeekdayChart(){
  const cont=document.getElementById('stats-weekday');
  if(!cont) return;
  const DAYS=['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
  const counts=[0,0,0,0,0,0,0];
  const history=loadJSON('inkflow_task_history', []);
  const nowY=new Date().getFullYear();
  history.forEach(h=>{
    let d;
    if(h.ts){ d=new Date(h.ts); }
    else if(h.date){ const [dd,mm]=h.date.split('/'); d=new Date(nowY, parseInt(mm)-1, parseInt(dd)); }
    if(d && !isNaN(d)){ counts[(d.getDay()+6)%7]++; }
  });
  const total=counts.reduce((a,b)=>a+b,0);
  if(!total){ cont.innerHTML='<div style="font-size:12px;color:var(--ink3);font-style:italic;text-align:center;padding:10px">Ancora nessuna serata registrata</div>'; return; }
  const max=Math.max(...counts,1);
  const best=counts.indexOf(max);
  let html='<div style="display:flex;gap:6px;align-items:flex-end;height:86px;margin-bottom:4px">';
  counts.forEach((n,i)=>{
    const h=n>0?Math.max(8,Math.round(n/max*58)):3;
    const bg=i===best?'#b8860f':n>0?'#ddbe72':'var(--sand2)';
    html+=`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;justify-content:flex-end">
      ${n>0?`<div style="font-size:10px;font-weight:700;color:var(--ink3)">${n}</div>`:''}
      <div style="height:${h}px;width:100%;border-radius:4px 4px 0 0;background:${bg}"></div>
      <div style="font-size:9px;color:${i===best?'#8a6a30':'var(--ink3)'};font-weight:${i===best?'700':'400'}">${DAYS[i]}</div>
    </div>`;
  });
  html+=`</div><div style="font-size:11px;color:var(--ink3);text-align:center">Il tuo giorno d'oro è <strong style="color:#8a6a30">${['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'][best]}</strong></div>`;
  cont.innerHTML=html;
}

const MONTH_NAMES_STATS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function renderMonthlyStars(){
  const cont = document.getElementById('stats-monthly');
  if(!cont) return;

  // Deriva i conteggi mensili DALLO STORICO REALE delle task completate.
  // Così non può mai desincronizzarsi dal numero di stelle.
  const history = loadJSON('inkflow_task_history', []);
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
      const icon = glyphSvg(t.done ? t.icon : (isSecret ? 'domanda' : 'lucchetto'));
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
        ${badges.map(b=>`<div class="proj-badge${b.done?' earned':''}" title="${b.name}"><span class="proj-badge-glyph">${glyphSvg(b.done?b.icon:'lucchetto')}</span><span class="proj-badge-lbl">${b.name}</span></div>`).join('')}
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

