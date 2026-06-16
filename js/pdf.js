import { getProject, currentId, PHASE_NAMES } from './state.js';
import { calcPct, getPhaseIndex } from './progress.js';
import { calcVelocity, calcDaysLeft } from './velocity.js';

export function exportPDF(){
  const p = getProject(currentId); if(!p) return;
  const color = p.color||'#4ab8d8';
  const tavDone = Object.values(p.tavole||{}).filter(v=>v>=4).length;
  const pct = calcPct(p);
  const phase = PHASE_NAMES[getPhaseIndex(p)];
  const v = calcVelocity(p);
  const daysLeft = calcDaysLeft(p);
  const countdownStr = daysLeft===null ? '—' : daysLeft<0 ? ('Scaduto da '+Math.abs(daysLeft)+' giorni') : (daysLeft+' giorni mancanti');

  const TAV_L=['Matite','Inchiostro','Retini','Balloon','Finita'];

  // Build parts as strings safely
  let body = '';

  // Header
  body += '<div style="border-bottom:4px solid '+color+';padding-bottom:16px;margin-bottom:24px">';
  body += '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">';
  body += '<div><div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;margin-bottom:4px">Inkflow · Report progetto</div>';
  body += '<div style="font-size:32px;font-weight:700;color:#222;line-height:1.1">'+p.title+'</div>';
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
    if(p.dateStart) body += '<div>Inizio: <strong>'+p.dateStart+'</strong></div>';
    if(p.dateEnd) body += '<div>Fine: <strong>'+p.dateEnd+'</strong></div>';
    body += '</div></div>';
  }

  // Soggetto
  if(p.story&&p.story.soggetto){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Soggetto</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+p.story.soggetto+'</div></div>';
  }

  // 3-act structure
  if(p.story&&p.story.acts){
    const actColors={setup:'#4ab8d8',confrontation:'#f0c020',resolution:'#48a848'};
    const actLabels={setup:'Setup',confrontation:'Confrontation',resolution:'Resolution'};
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Struttura a 3 atti</div>';
    ['setup','confrontation','resolution'].forEach(function(actId,i){
      const scenes=(p.story.acts[actId]||[]).filter(function(s){return s.trim();});
      const ac=actColors[actId];
      body += '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:'+ac+';margin-bottom:4px">'+actLabels[actId]+'</div>';
      scenes.forEach(function(s){
        body += '<div style="padding:5px 10px;border-left:3px solid '+ac+';margin-bottom:3px;font-size:13px;color:#444;background:#fafafa">'+s+'</div>';
      });
      if(i<2) body += '<div style="text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:#e84848;margin:6px 0">— Plot Point '+(i+1)+' —</div>';
      body += '</div>';
    });
    body += '</div>';
  }

  // Pipeline
  body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Pipeline</div>';
  [['Sviluppo',['Moodboard visiva','Soggetto','Struttura a 3 atti']],['Pre-produzione',['Layouts','Reference']]].forEach(function(fase){
    body += '<div style="margin-bottom:8px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#aaa;margin-bottom:3px">'+fase[0]+'</div>';
    fase[1].forEach(function(item){
      const done=!!(p.steps&&p.steps[item.slice(0,30)]);
      body += '<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid #f0f0f0">';
      body += '<div style="width:14px;height:14px;border-radius:50%;background:'+(done?color:'#e8e8e8')+';flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff">'+(done?'✓':'')+'</div>';
      body += '<span style="font-size:13px;color:'+(done?'#aaa':'#333')+';'+(done?'text-decoration:line-through':'')+'">'+item+'</span></div>';
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
      body += '<span style="font-size:13px;color:'+(s.done?'#aaa':'#333')+';'+(s.done?'text-decoration:line-through':'')+'">'+s.text+'</span>';
      body += '<span style="margin-left:auto;font-size:10px;color:'+(s.ref?color:'#aaa')+'">'+(s.ref?'ref ✓':'ref?')+'</span></div>';
    });
    body += '</div>';
  }

  // Notes
  if(p.notes){
    body += '<div style="margin-bottom:20px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:6px;padding-bottom:4px;border-bottom:2px solid '+color+'">Note</div>';
    body += '<div style="font-size:13px;color:#444;line-height:1.7;white-space:pre-wrap">'+p.notes+'</div></div>';
  }

  // Footer
  body += '<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10px;color:#ccc"><span>Inkflow</span><span>Generato il '+new Date().toLocaleDateString('it-IT')+'</span></div>';

  const win = window.open('','_blank');
  if(!win){alert('Abilita i popup per esportare il PDF');return;}
  win.document.open();
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+p.title+' — Inkflow</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;color:#222;background:#fff;padding:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div style="max-width:680px;margin:0 auto;padding:32px 28px">'+body+'</div></body></html>');
  win.document.close();
  setTimeout(function(){win.print();},600);
}

// ── EXPORT STORYBOARD — documento narrativo leggibile ──
export function exportStoryboard(){
  const p = getProject(currentId); if(!p) return;
  const color = p.color||'#4ab8d8';
  const story = p.story||{};
  const acts = story.acts||{setup:[],confrontation:[],resolution:[]};
  const pp = story.pp||{pp1:'',pp2:'',inciting:''};

  const esc = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  let body = '';

  // Header
  body += '<div style="border-bottom:4px solid '+color+';padding-bottom:16px;margin-bottom:24px">';
  body += '<div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa;margin-bottom:4px">Inkflow · Storyboard</div>';
  body += '<div style="font-size:32px;font-weight:700;color:#222;line-height:1.1">'+esc(p.title)+'</div>';
  body += '</div>';

  // Soggetto
  if(story.soggetto){
    body += '<div style="margin-bottom:24px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid '+color+'">Soggetto</div>';
    body += '<div style="font-size:14px;color:#333;line-height:1.7;white-space:pre-wrap">'+esc(story.soggetto)+'</div></div>';
  }

  // Ambientazione
  if(story.world){
    body += '<div style="margin-bottom:24px"><div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid '+color+'">Ambientazione</div>';
    body += '<div style="font-size:14px;color:#333;line-height:1.7;white-space:pre-wrap">'+esc(story.world)+'</div></div>';
  }

  // Struttura 3 atti
  const actCfg=[
    {id:'setup',label:'Atto 1 · Setup',c:'#4ab8d8'},
    {id:'confrontation',label:'Atto 2 · Confrontation',c:'#f0c020'},
    {id:'resolution',label:'Atto 3 · Resolution',c:'#48a848'},
  ];

  body += '<div style="font-size:18px;font-weight:700;color:#222;margin:32px 0 16px">Struttura narrativa</div>';

  // Inciting incident
  if(pp.inciting){
    body += '<div style="margin-bottom:20px;background:#f0f8fc;border-left:4px solid #4ab8d8;padding:12px 16px;border-radius:0 8px 8px 0">';
    body += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#4ab8d8;margin-bottom:4px">Inciting Incident</div>';
    body += '<div style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">'+esc(pp.inciting)+'</div></div>';
  }

  actCfg.forEach((act,ai)=>{
    const scenes=(acts[act.id]||[]).filter(s=>s&&s.trim());
    body += '<div style="margin-bottom:8px;margin-top:20px"><div style="font-size:15px;font-weight:700;color:'+act.c+';margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid '+act.c+'33">'+act.label+'</div>';
    if(scenes.length===0){
      body += '<div style="font-size:13px;color:#bbb;font-style:italic;margin-bottom:8px">Nessuna scena</div>';
    }
    scenes.forEach((s,si)=>{
      body += '<div style="display:flex;gap:12px;margin-bottom:10px;align-items:flex-start">';
      body += '<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:'+act.c+';color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(si+1)+'</div>';
      body += '<div style="flex:1;font-size:14px;color:#333;line-height:1.6;padding-top:3px;white-space:pre-wrap">'+esc(s)+'</div></div>';
    });
    body += '</div>';

    // Plot point dopo atto 1 e 2
    if(ai===0 && pp.pp1){
      body += '<div style="margin:16px 0;background:#fff4f2;border-left:4px solid #e84848;padding:12px 16px;border-radius:0 8px 8px 0">';
      body += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#e84848;margin-bottom:4px">⬡ Plot Point 1</div>';
      body += '<div style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">'+esc(pp.pp1)+'</div></div>';
    }
    if(ai===1 && pp.pp2){
      body += '<div style="margin:16px 0;background:#fff4f2;border-left:4px solid #e84848;padding:12px 16px;border-radius:0 8px 8px 0">';
      body += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#e84848;margin-bottom:4px">⬡ Plot Point 2</div>';
      body += '<div style="font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">'+esc(pp.pp2)+'</div></div>';
    }
  });

  // Personaggi
  const chars=(story.characters||[]).filter(c=>c.name||c.desc);
  if(chars.length>0){
    body += '<div style="font-size:18px;font-weight:700;color:#222;margin:32px 0 16px">Personaggi</div>';
    chars.forEach(c=>{
      body += '<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid #eee">';
      body += '<div style="font-size:15px;font-weight:700;color:#222;margin-bottom:4px">'+esc(c.name||'Senza nome')+'</div>';
      if(c.desc) body += '<div style="font-size:13px;color:#555;line-height:1.6;white-space:pre-wrap">'+esc(c.desc)+'</div>';
      body += '</div>';
    });
  }

  // Footer
  body += '<div style="margin-top:32px;padding-top:12px;border-top:1px solid #eee;display:flex;justify-content:space-between;font-size:10px;color:#ccc"><span>Inkflow · Storyboard</span><span>Generato il '+new Date().toLocaleDateString('it-IT')+'</span></div>';

  const win = window.open('','_blank');
  if(!win){alert('Abilita i popup per esportare lo storyboard');return;}
  win.document.open();
  win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+esc(p.title)+' — Storyboard</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;color:#222;background:#fff}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><div style="max-width:680px;margin:0 auto;padding:32px 28px">'+body+'</div></body></html>');
  win.document.close();
  setTimeout(()=>win.print(),600);
}
