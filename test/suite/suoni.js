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
  console.log('\n── il set di suoni ──');
  // Adesso sono due: Final Fantasy VII e Survival horror. Quello che si prova
  // qui e' che il file suonato dipenda dal SET SCELTO invece di essere
  // scritto a mano da qualche parte.
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

  // ── IL SECONDO SET SUONA DAVVERO ──
  // Un set nell'elenco che poi non ha i file dietro non e' un set: e' una
  // voce nel menu che zittisce l'app. Qui si cambia set per davvero e si
  // controlla che i quattro file esistano, si decodifichino e escano.
  const altro = await page.evaluate(async ()=>{
    const m = await import('/js/sound.js');
    const set = m.SET_SUONI.find(x=> x.id !== m.SET_SUONI[0].id);
    if(!set) return { uno: true };
    const NOMI = ['nav.wav','done.wav','reward.wav','cancel.wav'];
    const file = {};
    for(const n of NOMI){
      // La cartella e' relativa alla pagina dell'app; dal banco si risale.
      const via = set.cartella.replace(/^\.\//, '/');
      const r = await fetch(via + n);
      const b = r.ok ? await r.arrayBuffer() : null;
      file[n] = { stato: r.status, byte: b ? b.byteLength : 0 };
    }
    m.setSuoniScegli(set.id);
    window.azzera();
    window.playSfx('done');
    await new Promise(r=> setTimeout(r, 800));
    return { id: set.id, nome: set.nome, file,
             attivo: m.setSuoniAttivo(), usciti: window.__suoni.length };
  });
  ok('il secondo set ha tutti e quattro i file',
     !!altro.uno || Object.values(altro.file).every(f=> f.stato === 200 && f.byte > 1000), altro);
  ok('e scegliendolo suona lui',
     !!altro.uno || (altro.attivo === altro.id && altro.usciti >= 1), altro);

  console.log('\n── i tuoi suoni, sul tuo dispositivo ──');
  // PERCHE' ESISTE QUESTA STRADA. I suoni di un gioco che ti piace sono di chi
  // il gioco l'ha fatto, e questo repository e' pubblico: metterceli dentro
  // vorrebbe dire pubblicarli. Caricarli sul proprio dispositivo e' un'altra
  // cosa — e questo prova che ci restano: niente rete, niente repository.
  const miei = await page.evaluate(async ()=>{
    const m = await import('/js/sound.js');
    const s = await import('/js/suonimiei.js');
    await s.svuotaSuoniMiei();
    const prima = { spia: s.haSuoniMiei(), quanti: m.setSuoniDisponibili().length };
    // Un file vero, cosi' si prova anche che venga poi DECODIFICATO: un blob
    // finto passerebbe il salvataggio e fallirebbe dove conta.
    const blob = await (await fetch('/sfx/re/nav.wav')).blob();
    const quali = await s.salvaSuoniMiei({ tap: blob });
    const elenco = m.setSuoniDisponibili();
    const bytes = await s.leggiSuonoMio('tap');
    // UN SOLO SUONO CARICATO NON DEVE ZITTIRE GLI ALTRI TRE: chi cambia il
    // tick del cursore non vuole perdere la conferma.
    const mancante = await s.leggiSuonoMio('done');
    m.setSuoniScegli('mio');
    m.scordaISuoni();
    window.azzera();
    window.playSfx('done');
    await new Promise(r=> setTimeout(r, 900));
    const conFallback = window.__suoni.length;
    window.azzera();
    window.playSfx('tap');
    await new Promise(r=> setTimeout(r, 900));
    const conIlMio = window.__suoni.length;
    // E si tolgono: il set personale sparisce dal menu e si torna a quelli
    // di serie, senza restare su un set che non c'e' piu'.
    await s.svuotaSuoniMiei();
    const dopoVuoto = { spia: s.haSuoniMiei(), quanti: m.setSuoniDisponibili().length,
                        attivo: m.setSuoniAttivo() };
    m.setSuoniScegli(m.SET_SUONI[0].id);
    m.scordaISuoni();
    return { prima, quali, elenco: elenco.map(x=>x.id), byte: bytes ? bytes.byteLength : 0,
             mancante, conFallback, conIlMio, dopoVuoto };
  });
  ok('senza file tuoi il set personale non c\'e\'',
     miei.prima.spia === false && miei.prima.quanti === 2, miei);
  ok('caricandone uno il set personale compare',
     miei.elenco.includes('mio') && miei.quali.join() === 'tap', miei);
  ok('e i byte restano sul dispositivo, rileggibili',
     miei.byte > 1000, miei);
  ok('un suono tuo che manca ripiega su quello di serie',
     miei.mancante === null && miei.conFallback >= 1, miei);
  ok('e quello caricato suona', miei.conIlMio >= 1, miei);
  ok('togliendoli si torna ai set di serie',
     miei.dopoVuoto.spia === false && miei.dopoVuoto.quanti === 2
     && miei.dopoVuoto.attivo !== 'mio', miei);

  // ── A QUALE COMANDO VA OGNI FILE ──
  // Si guarda il nome, perche' chi scarica un pacchetto si ritrova file che
  // si chiamano cursor, select, back, fanfare: indovinarlo risparmia quattro
  // scelte. Quello che non si riconosce prende il primo posto libero,
  // nell'ordine in cui e' stato scelto — cosi' anche 1,2,3,4 funziona.
  const nomi = await page.evaluate(async ()=>{
    const s = await import('/js/suonimiei.js');
    const f = n => ({ name: n });
    const perNome = s.assegnaFile([f('cursor.wav'), f('select.wav'), f('back.wav'), f('fanfare.wav')]);
    const aCaso = s.assegnaFile([f('1.wav'), f('2.wav'), f('3.wav'), f('4.wav')]);
    const misto = s.assegnaFile([f('boh.wav'), f('cancel.wav')]);
    const dimmi = m => Object.fromEntries(Object.entries(m).map(([k,v])=>[k, v.name]));
    return { perNome: dimmi(perNome), aCaso: dimmi(aCaso), misto: dimmi(misto) };
  });
  ok('i nomi riconoscibili vanno al posto giusto',
     nomi.perNome.tap === 'cursor.wav' && nomi.perNome.done === 'select.wav'
     && nomi.perNome.cancel === 'back.wav' && nomi.perNome.reward === 'fanfare.wav', nomi);
  ok('e quelli senza nome seguono l\'ordine in cui li hai scelti',
     nomi.aCaso.tap === '1.wav' && nomi.aCaso.done === '2.wav'
     && nomi.aCaso.reward === '3.wav' && nomi.aCaso.cancel === '4.wav', nomi);
  ok('un nome riconosciuto si prende il suo posto anche in mezzo agli altri',
     nomi.misto.cancel === 'cancel.wav' && nomi.misto.tap === 'boh.wav', nomi);

});
