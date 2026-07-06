import { getProject, currentId, PHASE_NAMES } from './state.js';
import { calcPct, getPhaseIndex } from './progress.js';
import { calcVelocity, calcDaysLeft } from './velocity.js';
import { renderScreenplayHTML } from './scriptment.js';

// ── EXPORT REPORT — documento unico: produzione + storia completa ──
export function exportPDF(){
  const p = getProject(currentId); if(!p) return;
  const color = p.color||'#4ab8d8';
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const tavDone = Object.values(p.tavole||{}).filter(v=>v>=4).length;
  const pct = calcPct(p);
  const phase = PHASE_NAMES[getPhaseIndex(p)];
  const v = calcVelocity(p);
  const daysLeft = calcDaysLeft(p);
  const countdownStr = daysLeft===null ? '—' : daysLeft<0 ? ('Scaduto da '+Math.abs(daysLeft)+' giorni') : (daysLeft+' giorni mancanti');
  const story = p.story||{};
  const acts = story.acts||{setup:[],confrontation:[],resolution:[]};
  const pp = story.pp||{pp1:'',pp2:'',inciting:''};

  const TAV_L=['Matite','Inchiostro','Retini','Balloon','Finita'];

  let body = '';

  // Header
  body += '<div style="border-bottom:4px solid '+color+';padding-bottom:16px;margin-bottom:24px">';
  body += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">';
  body += '<div><div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;margin-bottom:4px">Inkflow · Report progetto</div>';
  body += '<div style="font-size:32px;font-weight:700;color:#222;line-height:1.1">'+esc(p.title)+'</div>';
  body += '<div style="font-size:13px;color:#888;margin-top:6px">'+(p.createdAt||'')+' · '+p.numTav+' tavole · '+phase+'</div></div>';
  body += '<div style="background:'+color+';width:48px;height:48px;border-radius:50%;flex-shrink:0"></div></div></div>';

  // Stats
  body += '<div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap">';
  const stats = [['Avanzamento',pct+'%',color],['Tavole finite',tavDone+' / '+p.numTav,'#48a848'],['Tav/sett',v.actual,'#4ab8d8'],['Deadline',countdownStr,'#888']];
  stats.forEach(function(s){
    body += '<div style="flex:1;min-width:110px;background:#fafafa;border-radius:10px;padding:10px 12px;border-left:3px solid '+s[2]+'">';
    body += '<div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#aaa;margin-bottom:3px">'+s[0]+'</div>';
    body += '<div style="font-size:16px;font-weight:700;color:'+s[2]+'">'+s[1]+'</div></div>';
  });
  body += '</div>';

  // Deadline dates
  if(p.dateStart||p.dateEnd){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Deadline</div>';
    body += '<div style="display:flex;gap:20px;font-size:13px;color:#444">';
    if(p.dateStart) body += '<div>Inizio: <strong>'+esc(p.dateStart)+'</strong></div>';
    if(p.dateEnd) body += '<div>Fine: <strong>'+esc(p.dateEnd)+'</strong></div>';
    body += '</div></div>';
  }

  // Soggetto
  if(story.soggetto){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Soggetto</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+esc(story.soggetto)+'</div></div>';
  }

  // Ambientazione
  if(story.world){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Ambientazione</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+esc(story.world)+'</div></div>';
  }

  // Struttura narrativa completa (inciting incident, scene numerate, plot point)
  const actCfg=[
    {id:'setup',label:'Atto 1 · Setup',c:'#4ab8d8'},
    {id:'confrontation',label:'Atto 2 · Confrontation',c:'#f0c020'},
    {id:'resolution',label:'Atto 3 · Resolution',c:'#48a848'},
  ];
  const anyScenes = ['setup','confrontation','resolution'].some(id=>(acts[id]||[]).some(s=>s&&s.trim()));
  if(anyScenes || pp.inciting){
    body += '<div style="font-size:16px;font-weight:700;color:#222;margin:28px 0 14px;padding-bottom:4px;border-bottom:2px solid '+color+'">Struttura narrativa</div>';
    if(pp.inciting){
      body += '<div style="margin-bottom:16px;background:#f0f8fc;border-left:4px solid #4ab8d8;padding:10px 14px;border-radius:0 8px 8px 0">';
      body += '<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:#4ab8d8;margin-bottom:4px">Inciting Incident</div>';
      body += '<div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">'+esc(pp.inciting)+'</div></div>';
    }
    actCfg.forEach((act,ai)=>{
      const scenes=(acts[act.id]||[]).filter(s=>s&&s.trim());
      body += '<div style="margin-bottom:6px;margin-top:16px"><div style="font-size:13px;font-weight:700;color:'+act.c+';margin-bottom:8px;padding-bottom:5px;border-bottom:2px solid '+act.c+'33">'+act.label+'</div>';
      if(scenes.length===0){
        body += '<div style="font-size:12px;color:#bbb;font-style:italic;margin-bottom:6px">Nessuna scena</div>';
      }
      scenes.forEach((s,si)=>{
        body += '<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">';
        body += '<div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;background:'+act.c+';color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(si+1)+'</div>';
        body += '<div style="flex:1;font-size:13px;color:#333;line-height:1.6;padding-top:2px;white-space:pre-wrap">'+esc(s)+'</div></div>';
      });
      body += '</div>';
      if(ai===0 && pp.pp1){
        body += '<div style="margin:14px 0;background:#fff4f2;border-left:4px solid #e84848;padding:10px 14px;border-radius:0 8px 8px 0">';
        body += '<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:#e84848;margin-bottom:4px">⬡ Plot Point 1</div>';
        body += '<div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">'+esc(pp.pp1)+'</div></div>';
      }
      if(ai===1 && pp.pp2){
        body += '<div style="margin:14px 0;background:#fff4f2;border-left:4px solid #e84848;padding:10px 14px;border-radius:0 8px 8px 0">';
        body += '<div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:#e84848;margin-bottom:4px">⬡ Plot Point 2</div>';
        body += '<div style="font-size:13px;color:#333;line-height:1.6;white-space:pre-wrap">'+esc(pp.pp2)+'</div></div>';
      }
    });
  }

  // Personaggi
  const chars=(story.characters||[]).filter(c=>c.name||c.desc);
  if(chars.length>0){
    body += '<div style="font-size:16px;font-weight:700;color:#222;margin:28px 0 14px;padding-bottom:4px;border-bottom:2px solid '+color+'">Personaggi</div>';
    chars.forEach(c=>{
      body += '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #eee">';
      body += '<div style="font-size:14px;font-weight:700;color:#222;margin-bottom:3px">'+esc(c.name||'Senza nome')+'</div>';
      if(c.desc) body += '<div style="font-size:12.5px;color:#555;line-height:1.6;white-space:pre-wrap">'+esc(c.desc)+'</div>';
      body += '</div>';
    });
  }

  // Pipeline
  body += '<div style="margin-bottom:20px;margin-top:8px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Pipeline</div>';
  [['Sviluppo',['Moodboard visiva','Soggetto','Struttura a 3 atti']],['Pre-produzione',['Layouts','Reference']]].forEach(function(fase){
    body += '<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#aaa;margin-bottom:3px">'+fase[0]+'</div>';
    fase[1].forEach(function(item){
      const done=!!(p.steps&&p.steps[item.slice(0,30)]);
      body += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0">';
      body += '<div style="width:14px;height:14px;border-radius:50%;background:'+(done?color:'#e8e8e8')+';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff">'+(done?'✓':'')+'</div>';
      body += '<span style="font-size:13px;color:'+(done?'#aaa':'#333')+';'+(done?'text-decoration:line-through':'')+'">'+esc(item)+'</span></div>';
    });
    body += '</div>';
  });
  body += '</div>';

  // Tavole
  body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Realizzazione</div>';
  body += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#fafafa"><th style="padding:5px 8px;text-align:left;color:#aaa">#</th>';
  TAV_L.forEach(function(l){ body += '<th style="padding:5px 8px;text-align:center;color:#aaa;font-size:10px">'+l+'</th>'; });
  body += '</tr></thead><tbody>';
  for(let i=1;i<=p.numTav;i++){
    const stage=p.tavole&&p.tavole[i]!=null?p.tavole[i]:0;
    body += '<tr style="border-bottom:1px solid #f0f0f0"><td style="padding:4px 8px;font-weight:600;color:'+color+'">'+i+'</td>';
    TAV_L.forEach(function(_,li){
      const bg=li<stage?color:li===stage&&stage<4?color+'44':'#f0f0f0';
      body += '<td style="padding:4px 8px;text-align:center"><div style="width:16px;height:16px;border-radius:50%;background:'+bg+';margin:0 auto;font-size:9px;color:#fff;display:flex;align-items:center;justify-content:center">'+(li<stage?'✓':'')+'</div></td>';
    });
    body += '</tr>';
  }
  body += '</tbody></table></div>';

  // Sfide
  if((p.sfide||[]).length>0){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Sfide visive</div>';
    p.sfide.forEach(function(s){
      body += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #f0f0f0;align-items:center">';
      body += '<div style="width:14px;height:14px;border-radius:50%;background:'+(s.done?color:'#e8e8e8')+';flex-shrink:0;font-size:9px;color:#fff;display:flex;align-items:center;justify-content:center">'+(s.done?'✓':'')+'</div>';
      body += '<span style="font-size:13px;color:'+(s.done?'#aaa':'#333')+';'+(s.done?'text-decoration:line-through':'')+'">'+esc(s.text)+'</span>';
      body += '<span style="margin-left:auto;font-size:10px;color:'+(s.ref?color:'#aaa')+'">'+(s.ref?'ref ✓':'ref?')+'</span></div>';
    });
    body += '</div>';
  }

  // Notes
  if(p.notes){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Note</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+esc(p.notes)+'</div></div>';
  }

  // Footer
  body += '<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10px;color:#ccc"><span>Inkflow</span><span>Generato il '+new Date().toLocaleDateString('it-IT')+'</span></div>';

  const win = window.open('','_blank');
  if(!win){alert('Abilita i popup per esportare il report');return;}
  win.document.open();
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(p.title)+' — Inkflow</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;color:#222;background:#fff;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div style="max-width:680px;margin:0 auto;padding:32px 28px">'+body+'</div></body></html>');
  win.document.close();
  setTimeout(function(){win.print();},600);
}

// ── EXPORT COPIONE (Sequenza) — formato sceneggiatura impaginato ──
export function exportScreenplay(){
  const p = getProject(currentId); if(!p) return;
  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const sm = p.scriptment || {};
  const text = sm.text || '';

  let body = '';
  // Frontespizio
  body += '<div style="text-align:center;margin:140px 0 0">';
  body += '<div style="font-size:26px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">'+esc(p.title)+'</div>';
  body += '<div style="margin-top:14px;font-size:13px">scriptment</div>';
  body += '<div style="margin-top:90px;font-size:12px;color:#555">Inkflow · '+new Date().toLocaleDateString('it-IT')+'</div>';
  body += '</div><div style="page-break-after:always"></div>';

  // Corpo: rendering screenplay strutturato (scene, dialoghi centrati, transizioni)
  if(text.trim()){
    body += '<div class="scriptment-body">'+renderScreenplayHTML(text)+'</div>';
  } else {
    body += '<div style="text-align:center;color:#999;margin-top:60px">Ancora niente scritto.</div>';
  }

  const css = `
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Courier New',Courier,monospace;color:#111;background:#fff;font-size:12pt;line-height:1.5}
    .page{max-width:8.5in;margin:0 auto;padding:1in 1in 1in 1.4in}
    .scriptment-body{font-family:'Courier New',Courier,monospace;font-size:12pt;line-height:1.6;counter-reset:sp-scene-counter}
    .sp-blank{height:.9em}
    .sp-action{margin:.1em 0}
    .sp-note{margin:.1em 0;color:#777;font-style:italic}
    .sp-scene{position:relative;text-align:left;padding-right:2.4em;font-weight:700;text-transform:uppercase;margin:.5em 0 .2em;counter-increment:sp-scene-counter}
    .sp-scene::after{content:counter(sp-scene-counter);position:absolute;right:0;top:0;color:#666;font-weight:700;text-transform:none}
    .sp-transition{text-align:right;font-weight:700;text-transform:uppercase;margin:.3em 0}
    .sp-character{text-align:center;text-transform:uppercase;font-weight:700;margin:.5em 0 0}
    .sp-dialogue{text-align:center;margin:0 auto;max-width:62%}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  `;
  const win = window.open('','_blank');
  if(!win){alert('Abilita i popup per esportare il copione');return;}
  win.document.open();
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(p.title)+' — Scriptment</title><style>'+css+'</style></head><body><div class="page">'+body+'</div></body></html>');
  win.document.close();
  setTimeout(()=>win.print(),600);
}
