// Scene — la struttura visiva di una scena breve
//
// La regola che questa suite difende sopra tutte le altre e' la prima: MAI IL
// VUOTO IN BLOCCO. Una scena nuova mostra un riquadro solo, e il secondo nasce
// quando il primo ha qualcosa dentro. Se un giorno qualcuno "sistemasse" il
// render disegnando dodici caselle in un colpo — che e' la cosa piu' naturale
// da scrivere — la sezione smetterebbe di funzionare per quello per cui e'
// stata fatta, e nessun errore lo direbbe. Lo dice questa prova.
const { suite } = require('../motore.js');

module.exports = () => suite("Scene — un riquadro per volta, cento caratteri",
  { banco: '/test/banco/scene.html' }, async ({ page, ok, sezione }) => {

  const stato = ()=> page.evaluate(()=>{
    const card = Array.from(document.querySelectorAll('.scene-card'));
    return {
      n: card.length,
      titoli: card.map(c=> c.querySelector('b').textContent),
      sottotitoli: card.map(c=>{ const s = c.querySelector('.scene-card-testo span'); return s ? s.textContent : null; }),
      vuoto: !!document.querySelector('.scene-vuoto'),
    };
  });
  const riquadri = ()=> page.evaluate(()=> Array.from(document.querySelectorAll('#scena-beat .beat')).map(b=>({
    n: b.querySelector('.beat-n').textContent,
    testo: b.querySelector('textarea').value,
    invito: b.querySelector('textarea').placeholder,
    nuovo: b.classList.contains('beat-nuovo'),
    conta: b.querySelector('.beat-conta').hidden ? null : b.querySelector('.beat-conta').textContent,
  })));
  // Le scene nuove entrano in CIMA all'elenco, quindi "la prima scheda" non e'
  // la prima scena creata: si apre quella che si vuole cercandola per titolo.
  const apriPerTitolo = async (titolo)=>{
    await page.evaluate(t=>{
      const card = Array.from(document.querySelectorAll('.scene-card'))
        .find(c=> c.querySelector('b').textContent === t);
      card.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    }, titolo);
    await page.waitForTimeout(450);
  };
  // Si scrive nell'ultimo riquadro, che e' sempre quello vuoto in coda.
  const scriviNel = async (indice, testo)=>{
    await page.evaluate(([i,t])=>{
      const ta = document.querySelectorAll('#scena-beat .beat textarea')[i];
      ta.focus(); ta.value = t;
      ta.dispatchEvent(new Event('input', {bubbles:true}));
    }, [indice, testo]);
    await page.waitForTimeout(80);
  };

  sezione('a schermata vuota non c\'e\' niente da riempire');
  let s = await stato();
  ok('nessuna scena', s.n === 0, s);
  ok('e lo stato vuoto lo dice in tre parole', s.vuoto, s);
  const invito = await page.evaluate(()=> document.getElementById('scene-nuova').textContent.trim());
  ok('c\'e\' un solo modo di cominciare, e dice quale', /nuova scena/i.test(invito), invito);

  sezione('una scena nuova si apre da sola, e mostra UN riquadro solo');
  // Il cuore di tutto: mai una griglia vuota. Dodici caselle che aspettano sono
  // l'immagine che fa chiudere l'app.
  await page.evaluate(()=> document.getElementById('scene-nuova').click());
  await page.waitForTimeout(450);
  const aperta = await page.evaluate(()=>({
    foglio: document.getElementById('scena').classList.contains('open'),
    titolo: document.getElementById('scena-titolo').value,
    invito: document.getElementById('scena-titolo').placeholder,
  }));
  ok('il foglio della scena si apre nello stesso tocco', aperta.foglio, aperta);
  ok('il titolo non e\' una domanda da sbrigare: e\' vuoto', aperta.titolo === '', aperta);
  ok('e dice come si chiamera\' se non lo scrivi', /senza titolo/i.test(aperta.invito), aperta);
  let r = await riquadri();
  ok('c\'e\' UN SOLO riquadro', r.length === 1, r);
  ok('ed e\' quello vuoto in coda', r[0].nuovo === true && r[0].testo === '', r);
  ok('con dentro la domanda giusta', r[0].invito === 'Cosa si vede?', r);
  ok('il contatore non c\'e\': non serve a chi ha appena cominciato', r[0].conta === null, r);

  sezione('compilato il primo, appare il secondo');
  await scriviNel(0, 'Il ladro entra dalla finestra, di spalle');
  r = await riquadri();
  ok('adesso i riquadri sono due', r.length === 2, r);
  ok('il primo e\' diventato un beat vero', r[0].nuovo === false && r[0].n === '1', r);
  ok('e sotto ne e\' nato uno vuoto, numero due', r[1].nuovo === true && r[1].n === '2' && r[1].testo === '', r);
  ok('mai due vuoti insieme', r.filter(x=>x.nuovo).length === 1, r);

  sezione('e il testo scritto non viene ridisegnato sotto le dita');
  // Promuovere il riquadro ridisegnando tutto sarebbe la scrittura piu' corta,
  // e porterebbe via il cursore a meta' della parola che si sta battendo.
  const fuoco = await page.evaluate(()=>{
    const ta = document.activeElement;
    return { dentroUnBeat: !!(ta && ta.closest && ta.closest('#scena-beat')),
             valore: ta && ta.value };
  });
  ok('il cursore e\' rimasto nel riquadro che si stava scrivendo',
     fuoco.dentroUnBeat && /ladro entra/.test(fuoco.valore||''), fuoco);

  sezione('il terzo nasce come il secondo, e non prima');
  await scriviNel(1, 'Primo piano della mano sul davanzale');
  r = await riquadri();
  ok('tre riquadri, due pieni e uno vuoto', r.length === 3 && r.filter(x=>x.nuovo).length === 1, r);
  ok('numerati di seguito', r.map(x=>x.n).join(',') === '1,2,3', r);

  sezione('cento caratteri, e il contatore compare solo in vista del fondo');
  const A = 'a'.repeat(60), B = 'b'.repeat(85);
  await scriviNel(2, A);
  r = await riquadri();
  ok('a sessanta caratteri il contatore tace', r[2].conta === null, r);
  await scriviNel(2, B);
  r = await riquadri();
  ok('a ottantacinque compare', r[2].conta === '85/100', r);
  const tetto = await page.evaluate(()=>{
    const ta = document.querySelectorAll('#scena-beat .beat textarea')[2];
    return ta.getAttribute('maxlength');
  });
  ok('e il limite lo tiene il campo stesso, non un avviso', tetto === '100', tetto);

  sezione('svuotare un riquadro equivale a buttarlo');
  // Stesso patto del taccuino. Succede USCENDO dal riquadro e non mentre si
  // cancella: sparire sotto le dita a meta' di una riscrittura sarebbe
  // insopportabile.
  await scriviNel(2, '');
  r = await riquadri();
  ok('mentre si cancella il riquadro resta dov\'e\'', r.length === 4, r);
  await page.evaluate(()=> document.activeElement.blur());
  await page.waitForTimeout(120);
  r = await riquadri();
  ok('uscendo, il riquadro vuoto sparisce', r.length === 3, r);
  ok('e restano i due beat scritti piu\' il vuoto in coda',
     r[0].nuovo === false && r[1].nuovo === false && r[2].nuovo === true, r);

  sezione('la board affianca tutto, e non si scrive');
  await page.evaluate(()=> document.getElementById('scena-board').click());
  await page.waitForTimeout(250);
  const board = await page.evaluate(()=>{
    const b = document.getElementById('board');
    return {
      aperta: b.classList.contains('open'),
      tessere: Array.from(b.querySelectorAll('.board-tessera')).map(t=>({
        n: t.querySelector('.board-n').textContent,
        testo: t.querySelector('p').textContent,
      })),
      campi: b.querySelectorAll('textarea, input').length,
      // Affiancate per davvero: la seconda comincia dove la prima non e' finita.
      dueSullaRiga: (()=>{
        const t = b.querySelectorAll('.board-tessera');
        if(t.length < 2) return false;
        const a = t[0].getBoundingClientRect(), c = t[1].getBoundingClientRect();
        return Math.abs(a.top - c.top) < 4 && c.left > a.left;
      })(),
    };
  });
  ok('la board si apre', board.aperta, board);
  ok('con dentro tutti i beat, numerati', board.tessere.map(t=>t.n).join(',') === '1,2', board);
  ok('e il testo e\' quello scritto', /ladro entra/.test(board.tessere[0].testo), board);
  ok('sola lettura: nessun campo in cui il dito possa finire', board.campi === 0, board);
  ok('e i beat stanno affiancati, non in colonna', board.dueSullaRiga, board);

  sezione('sul telefono la X della board non c\'e\'');
  // Stessa regola del lettore degli albi e dei frammenti: chiude il tasto
  // Indietro, che sta sotto il pollice.
  const x = await page.evaluate(()=>{
    const b = document.getElementById('board-chiudi');
    document.body.classList.add('is-touch');
    const conDito = getComputedStyle(b).display;
    document.body.classList.remove('is-touch');
    return { conDito, colMouse: getComputedStyle(b).display };
  });
  ok('col dito sparisce', x.conDito === 'none', x);
  ok('col mouse resta', x.colMouse !== 'none', x);

  sezione('il titolo si scrive quando viene, e finisce nell\'elenco');
  await page.evaluate(()=> document.getElementById('board-chiudi').click());
  await page.waitForTimeout(200);
  await page.evaluate(()=>{
    const t = document.getElementById('scena-titolo');
    t.value = 'La finestra sul cortile';
    t.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.evaluate(()=> document.getElementById('scena-chiudi').click());
  await page.waitForTimeout(250);
  s = await stato();
  ok('chiusa la scena si torna all\'elenco', s.n === 1, s);
  ok('col titolo scritto', s.titoli[0] === 'La finestra sul cortile', s);
  // NON un conteggio ("2 beat"): un numero dice quanto si e' fatto, e quanto si
  // e' fatto qui non interessa a nessuno. La prima immagine invece dice di che
  // scena si tratta.
  ok('e sotto il PRIMO BEAT, non un conteggio',
     /ladro entra/.test(s.sottotitoli[0]||'') && !/\bbeat\b/i.test(s.sottotitoli[0]||''), s);

  sezione('una scena senza titolo si chiama da sola');
  await page.evaluate(()=> document.getElementById('scene-nuova').click());
  await page.waitForTimeout(450);
  await page.evaluate(()=> document.getElementById('scena-chiudi').click());
  await page.waitForTimeout(250);
  s = await stato();
  ok('sono due scene', s.n === 2, s);
  ok('e quella nuova ha un nome suo', s.titoli.includes('Scena senza titolo'), s);
  ok('senza niente sotto, perche\' non c\'e\' ancora niente da vedere',
     s.sottotitoli.filter(x=>x===null).length === 1, s);

  sezione('e da nessuna parte c\'e\' una parola da ufficio');
  // Niente progetti, obiettivi, task, progressi, percentuali. E' la regola di
  // tono della sezione, ed e' facile perderla aggiungendo una funzione alla
  // volta: qui si guarda tutto il testo a schermo in una volta sola.
  const parole = await page.evaluate(()=>{
    const t = [document.getElementById('screen-scene'), document.getElementById('scena')]
      .map(e=> e.textContent + ' ' + Array.from(e.querySelectorAll('[placeholder]')).map(x=>x.placeholder).join(' '))
      .join(' ');
    return t.toLowerCase();
  });
  for(const p of ['progetto','progress','obiettivo','task','completat','%']){
    ok('non compare la parola "' + p + '"', !parole.includes(p), parole.slice(0, 200));
  }

  sezione('nessuna barra, nessuna soglia');
  const misure = await page.evaluate(()=>({
    barre: document.querySelectorAll('#screen-scene progress, #scena progress, #scena .barra, #scena [role="progressbar"]').length,
  }));
  ok('non c\'e\' nessuna barra di completamento', misure.barre === 0, misure);

  sezione('e quello che si scrive finisce davvero in archivio');
  const scritte = await page.evaluate(()=>{
    const s = window.__scritture || [];
    // La scena che interessa e' quella col titolo, non l'ultima scritta: le
    // scene nuove entrano in cima all'elenco, quindi l'ultima scrittura e'
    // quella vuota creata dopo.
    const ultima = s.filter(x=> x.col === 'scene' && x.data && x.data.titolo).pop();
    return {
      collezione: (s[0]||{}).col,
      quante: s.filter(x=> x.col === 'scene').length,
      beat: ultima && ultima.data && (ultima.data.beat||[]).map(b=> b.testo),
      titolo: ultima && ultima.data && ultima.data.titolo,
    };
  });
  ok('si scrive nella collezione "scene"', scritte.collezione === 'scene', scritte);
  ok('e il documento porta il titolo scritto', scritte.titolo === 'La finestra sul cortile', scritte);
  ok('e i beat, in ordine, senza il riquadro vuoto in coda',
     Array.isArray(scritte.beat) && scritte.beat.length === 2 &&
     /ladro entra/.test(scritte.beat[0]) && /davanzale/.test(scritte.beat[1]), scritte);

  sezione('il tasto Indietro chiude la scena, non la schermata');
  // Le due chiusure passano dalla stessa strada — la cronologia — cosi' il
  // tasto del telefono e la freccia a schermo fanno la stessa identica cosa.
  await apriPerTitolo('La finestra sul cortile');
  ok('la scena si riapre toccandola in elenco',
     await page.evaluate(()=> document.getElementById('scena').classList.contains('open')), null);
  const riaperta = await riquadri();
  ok('e ritrova i suoi beat, piu\' il vuoto in coda',
     riaperta.length === 3 && /ladro entra/.test(riaperta[0].testo), riaperta);
  await page.evaluate(()=> document.getElementById('scena-board').click());
  await page.waitForTimeout(250);
  await page.goBack();
  await page.waitForTimeout(250);
  const dopoUnPasso = await page.evaluate(()=>({
    board: document.getElementById('board').classList.contains('open'),
    scena: document.getElementById('scena').classList.contains('open'),
  }));
  ok('un passo indietro chiude la board', !dopoUnPasso.board, dopoUnPasso);
  ok('ma lascia aperta la scena sotto', dopoUnPasso.scena, dopoUnPasso);
  await page.goBack();
  await page.waitForTimeout(250);
  ok('un altro passo chiude la scena',
     await page.evaluate(()=> !document.getElementById('scena').classList.contains('open')), null);

  sezione('i beat si riordinano tenendoli premuti');
  // Stesso gesto delle Idee, e non per somiglianza: e' proprio lo stesso codice
  // (vedi riordino.js). Qui si prova che il modello segua le schede.
  await apriPerTitolo('La finestra sul cortile');
  const prima = (await riquadri()).map(x=>x.testo);
  await page.evaluate(()=>{
    // Si chiama direttamente la posa: il gesto col dito e' gia' provato dalle
    // Idee, quello che manca qui e' cosa ne fa la scena.
    const s = window.scene.scenaAperta();
    const f = s.beat.slice();
    const [p] = f.splice(0,1); f.splice(1,0,p);
    s.beat = f;
    window.scene.renderBeat();
  });
  await page.waitForTimeout(120);
  const dopo = (await riquadri()).map(x=>x.testo);
  ok('i due beat si scambiano di posto', dopo[0] === prima[1] && dopo[1] === prima[0], {prima, dopo});
  ok('e il riquadro vuoto resta in coda, dov\'e\' sempre',
     (await riquadri()).filter(x=>x.nuovo).length === 1 &&
     (await riquadri())[2].nuovo === true, dopo);
});
