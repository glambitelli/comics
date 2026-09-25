// Suoni — un tocco, un suono
const { suite } = require('../motore.js');

module.exports = () => suite("Suoni — un tocco, un suono", {"banco": "/test/banco/suoni.html", "args": ["--autoplay-policy=no-user-gesture-required"]}, async ({ page, base, ok }) => {

  await page.evaluate(()=>{
    window.tocca = async (sel, intento, ms=0)=>{
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      window['click'+(sel==='#b1'?1:2)] = intento ? ()=>window.playSfx(intento) : null;
      el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
      await new Promise(r=>setTimeout(r,ms));
      el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x+2,clientY:y+1,bubbles:true}));
      el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
    };
    window.trascina = async (sel)=>{
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
      el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x+60,clientY:y+4,bubbles:true}));
    };
    window.azzera = ()=>{ window.__suoni = []; };
  });
  // primo suono: aspetta il precarico
  await page.evaluate(()=> window.playSfx('tap'));
  await page.waitForTimeout(700);
  const durate = await page.evaluate(()=> window.__suoni);
  ok('i file dei suoni si caricano e suonano', durate.length >= 1, durate);
  const dNav = durate[0];

  const conta = async ()=>{ await page.waitForTimeout(320); return page.evaluate(()=>window.__suoni); };

  console.log('\n── un tocco su un bottone che chiama anche haptic(\'tap\') ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#b1','tap',30));
  let s = await conta();
  ok('suona UNA volta sola (prima erano due)', s.length === 1, s);

  console.log('\n── un tocco su un bottone che conferma: haptic(\'done\') ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#b1','done',30));
  s = await conta();
  ok('suona una volta sola', s.length === 1, s);
  ok('ed è la CONFERMA, non il tick generico', s[0] !== dNav, { suonato:s[0], nav:dNav });

  console.log('\n── azione che suona in ritardo (dopo una scrittura, un menu) ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=>{
    // Come una voce di menu che salva e POI fa il suo haptic('tap'):
    // fra il rilascio del dito e il suono passano piu' dei vecchi 70ms.
    window.click1 = ()=> setTimeout(()=> window.playSfx('tap'), 150);
    const el = document.querySelector('#b1'), r = el.getBoundingClientRect();
    const x = r.left+r.width/2, y = r.top+r.height/2;
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(500);
  s = await page.evaluate(()=>window.__suoni);
  ok('resta un suono solo anche se l\'azione arriva tardi', s.length === 1, s);
  await page.evaluate(()=>{ window.click1 = null; });

  console.log('\n── due tocchi distinti ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(async ()=>{ await window.tocca('#b1',null,20); });
  await page.waitForTimeout(220);
  await page.evaluate(async ()=>{ await window.tocca('#b2',null,20); });
  s = await conta();
  ok('due tocchi = due suoni', s.length === 2, s);

  console.log('\n── tocchi ravvicinati su un contatore (tap ripetuti veloci) ──');
  await page.evaluate(()=>window.azzera());
  for(let i=0;i<3;i++){
    await page.evaluate(async ()=>{ await window.tocca('#b1',null,10); });
    await page.waitForTimeout(120);
  }
  s = await conta();
  ok('ogni tocco vero resta udibile', s.length === 3, s);

  console.log('\n── trascinamento (scorrere una lista) ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.trascina('#b1'));
  s = await conta();
  ok('scorrere non fa suono', s.length === 0, s);

  console.log('\n── elementi non interattivi e campi di testo ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#d1',null,10));
  await page.evaluate(()=> window.tocca('#i1',null,10));
  s = await conta();
  ok('un div qualunque e un campo di testo restano muti', s.length === 0, s);

  console.log('\n── da tastiera, fuori da qualunque gesto ──');
  await page.evaluate(()=>window.azzera());
  await page.waitForTimeout(1100);   // oltre la finestra del gesto
  await page.evaluate(()=> window.playSfx('tap'));
  await page.waitForTimeout(150);
  await page.evaluate(()=> window.playSfx('tap'));
  s = await conta();
  ok('due comandi da tastiera restano due suoni', s.length === 2, s);

  console.log('\n── con l\'interruttore spento non deve suonare NIENTE ──');
  // Il buco che c'era: il tick diffuso dei tocchi non passava dal controllo
  // dell'interruttore, quindi spegnendo i suoni si zittivano le conferme —
  // quelle che passano da playSfx — e restava acceso il ticchettio di ogni
  // tocco, che e' proprio quello che si sente di piu'. Da fuori sembrava un
  // interruttore rotto.
  await page.evaluate(()=>{ window.setSoundEnabled(false); window.azzera(); });
  await page.evaluate(()=> window.tocca('#b1','tap',30));
  s = await conta();
  ok('un tocco su un bottone non ticchetta', s.length === 0, s);

  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#b2','done',30));
  s = await conta();
  ok('e nemmeno una conferma', s.length === 0, s);

  await page.evaluate(()=>window.azzera());
  await page.waitForTimeout(1100);
  await page.evaluate(()=> window.playSfx('reward'));
  await page.waitForTimeout(150);
  s = await conta();
  ok('nemmeno una ricompensa chiamata a mano', s.length === 0, s);

  console.log('\n── e riaccendendolo si torna a sentire ──');
  await page.evaluate(()=>{ window.setSoundEnabled(true); window.azzera(); });
  await page.evaluate(()=> window.tocca('#b1','tap',30));
  s = await conta();
  ok('il tocco ticchetta di nuovo', s.length === 1, s);
  console.log('\n── il verso che scende: quando suona "cancel" ──');
  // IL DIFETTO: il file cancel.wav esisteva da mesi e non lo chiamava
  // nessuno. Tornare indietro, chiudere una foto, dire di no a una conferma,
  // annullare un'eliminazione: tutto muto (Giovanni, 25 settembre 2026).
  //
  // SI IMPORTA IL state.js VERO, non quello finto del banco. L'importmap
  // dirotta la specifica esatta '/js/state.js' sul finto, che ha un haptic()
  // vuoto: con quello il collegamento non si potrebbe provare. Aggiungendo
  // una coda alla specifica non combacia piu' con l'importmap e arriva il
  // modulo vero, che parla con lo STESSO sound.js del banco — quindi il
  // suono che esce finisce in window.__suoni come tutti gli altri.
  //
  // E SI GUARDA LA DURATA di quello che e' uscito: cosi' non si prova solo
  // che un suono ci sia stato, ma che sia proprio cancel.wav e non uno degli
  // altri tre.
  const indietro = await page.evaluate(async ()=>{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const atteso = +(await ctx.decodeAudioData(
      await (await fetch('/sfx/cancel.wav')).arrayBuffer())).duration.toFixed(4);
    const st = await import('/js/state.js?vero');
    window.azzera();
    let rimesso = false;
    st.showUndoToast('Prova', ()=>{ rimesso = true; });
    document.getElementById('undo-toast-btn').click();
    await new Promise(r=> setTimeout(r, 900));
    return { atteso, usciti: window.__suoni.slice(), rimesso };
  });
  ok('annullare un\'eliminazione fa il verso che scende',
     indietro.usciti.includes(indietro.atteso), indietro);
  ok('e rimette davvero a posto quello che era sparito',
     indietro.rimesso === true, indietro);

  console.log('\n── il set di suoni ──');
  // Quello che si prova qui e' che il file suonato dipenda dal SET SCELTO
  // invece di essere scritto a mano da qualche parte.
  const sets = await page.evaluate(async ()=>{
    const m = await import('/js/sound.js');
    return { elenco: m.SET_SUONI.map(x=>x.id), attivo: m.setSuoniAttivo() };
  });
  ok('c\'e\' almeno un set e uno e\' attivo',
     sets.elenco.length >= 1 && sets.elenco.includes(sets.attivo), sets);

  const scelta = await page.evaluate(async ()=>{
    const m = await import('/js/sound.js');
    localStorage.setItem('inkflow-sfx-pack', 'un-set-che-non-esiste');
    return m.setSuoniAttivo();
  });
  ok('un set salvato che non esiste piu\' non zittisce l\'app',
     scelta === sets.elenco[0], scelta);

  await page.evaluate(()=>{ localStorage.removeItem('inkflow-sfx-pack'); window.azzera(); });
  await page.evaluate(()=> window.playSfx('done'));
  await page.waitForTimeout(400);
  const dopoScelta = await page.evaluate(()=> window.__suoni);
  ok('e i suoni continuano a uscire', dopoScelta.length === 1, dopoScelta);

  // ── UN SET A CUI MANCANO I FILE NON RESTA MUTO ──
  // "Survival Horror" legge da una cartella che nel repository e' vuota: i
  // file li mette chi pubblica il sito, non il codice. Finche' non ci sono —
  // o se ce ne sono solo due su quattro — quel comando deve suonare col
  // campione di serie. Il silenzio si legge come un tocco che non ha
  // funzionato, ed e' il difetto peggiore che un set incompleto possa avere.
  const vuoto = await page.evaluate(async ()=>{
    const m = await import('/js/sound.js');
    const set = m.SET_SUONI.find(x=> x.id === 'survival');
    if(!set) return { manca: true };
    // La cartella c'e' ma i suoni no: lo si prova davvero, chiedendone uno.
    const via = set.cartella.replace(/^\.\//, '/') + 'nav.wav';
    const r = await fetch(via);
    m.setSuoniScegli('survival');
    window.azzera();
    window.playSfx('done');
    await new Promise(r=> setTimeout(r, 900));
    const usciti = window.__suoni.length;
    m.setSuoniScegli(m.SET_SUONI[0].id);
    return { stato: r.status, attivo: 'survival', usciti };
  });
  ok('il set Survival Horror c\'è', !vuoto.manca, vuoto);
  ok('la sua cartella nel repository è vuota',
     !vuoto.manca && vuoto.stato !== 200, vuoto);
  ok('e finché è vuota si sente comunque il set di serie',
     !vuoto.manca && vuoto.usciti >= 1, vuoto);

  console.log('\n── i tuoi file riempiono Survival Horror ──');
  // PERCHE' ESISTE QUESTA STRADA. La cartella sfx/survival/ nel sito e'
  // vuota, e riempirla voleva dire caricare i file sul repository dalla
  // pagina di GitHub: dal telefono non e' un'operazione che si chiede a
  // qualcuno, e infatti non arrivava in fondo — mentre il set sembrava rotto
  // perche' suonava come quello di serie. Da qui i file si scelgono
  // dall'app, e restano SUL DISPOSITIVO: niente rete, niente repository.
  const miei = await page.evaluate(async ()=>{
    const m = await import('/js/sound.js');
    const s = await import('/js/suonimiei.js');
    await s.svuotaSuoniMiei();
    // SI CARICA UN FILE CHE DURA DIVERSO da quello di serie, e poi si guarda
    // la DURATA di quello che esce. Senza questo trucco la prova non
    // proverebbe niente: togliendo la lettura dal dispositivo, il suono
    // ripiegherebbe su quello di serie e un controllo del tipo "e' uscito un
    // suono" resterebbe verde lo stesso. Qui invece il premio (lungo) viene
    // messo al posto del cursore (corto): se si sente il corto, i file sul
    // dispositivo non vengono letti.
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const durata = async v => (await ctx.decodeAudioData(
      await (await fetch(v)).arrayBuffer())).duration;
    const attesa = +(await durata('/sfx/reward.wav')).toFixed(4);
    const diSerie = +(await durata('/sfx/nav.wav')).toFixed(4);
    const blob = await (await fetch('/sfx/reward.wav')).blob();
    const quali = await s.salvaSuoniMiei({ tap: blob });
    const bytes = await s.leggiSuonoMio('tap');
    // UN SOLO FILE CARICATO NON ZITTISCE GLI ALTRI TRE.
    const mancante = await s.leggiSuonoMio('done');
    m.setSuoniScegli('survival');
    m.scordaISuoni();
    window.azzera();
    window.playSfx('done');
    await new Promise(r=> setTimeout(r, 900));
    const conRipiego = window.__suoni.length;
    window.azzera();
    window.playSfx('tap');
    await new Promise(r=> setTimeout(r, 900));
    const conIlMio = window.__suoni.length;
    await s.svuotaSuoniMiei();
    const dopo = s.haSuoniMiei();
    m.setSuoniScegli(m.SET_SUONI[0].id);
    m.scordaISuoni();
    return { quali, byte: bytes ? bytes.byteLength : 0, mancante,
             conRipiego, conIlMio, dopo, attesa, diSerie,
             durataUscita: window.__suoni[0] };
  });
  ok('i file scelti restano sul dispositivo, rileggibili',
     miei.quali.join() === 'tap' && miei.byte > 1000, miei);
  ok('un comando che non hai coperto ripiega sul set di serie',
     miei.mancante === null && miei.conRipiego >= 1, miei);
  ok('e quello che hai caricato suona LUI, non quello di serie',
     miei.conIlMio >= 1 && miei.durataUscita === miei.attesa
     && miei.attesa !== miei.diSerie, miei);
  ok('e si tolgono quando vuoi', miei.dopo === false, miei);

  // A QUALE COMANDO VA OGNI FILE: prima il nome, poi l'ordine di scelta.
  const nomi = await page.evaluate(async ()=>{
    const s = await import('/js/suonimiei.js');
    const f = n => ({ name: n });
    const dimmi = m => Object.fromEntries(Object.entries(m).map(([k,v])=>[k, v.name]));
    return {
      perNome: dimmi(s.assegnaFile([f('cursor.wav'), f('select.wav'), f('back.wav'), f('fanfare.wav')])),
      aCaso:   dimmi(s.assegnaFile([f('1.wav'), f('2.wav'), f('3.wav'), f('4.wav')])),
      misto:   dimmi(s.assegnaFile([f('boh.wav'), f('cancel.wav')])),
    };
  });
  ok('i nomi riconoscibili vanno al posto giusto',
     nomi.perNome.tap === 'cursor.wav' && nomi.perNome.done === 'select.wav'
     && nomi.perNome.cancel === 'back.wav' && nomi.perNome.reward === 'fanfare.wav', nomi);
  ok('e quelli senza nome seguono l\'ordine in cui li hai scelti',
     nomi.aCaso.tap === '1.wav' && nomi.aCaso.done === '2.wav', nomi);
  ok('un nome riconosciuto si prende il suo posto anche in mezzo agli altri',
     nomi.misto.cancel === 'cancel.wav' && nomi.misto.tap === 'boh.wav', nomi);

});
