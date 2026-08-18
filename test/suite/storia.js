// Storia — soggetto, personaggi, struttura a tre atti
//
// L'altra metà del testo che scrivi (la prima è lo scriptment). Qui però il
// testo non è in un blocco solo: sta in decine di campi separati — il soggetto,
// il mondo, il nome e la descrizione di ogni personaggio, ogni scena dei tre
// atti — e ognuno ha un suo modo di finire nel progetto. Un campo che non salva
// non si vede: sembra tutto a posto finché non riapri il progetto il giorno
// dopo e quella cosa non c'è più.
//
// E c'è un secondo pericolo, tutto suo: il BREAKDOWN. Un pulsante che legge lo
// scriptment e riempie personaggi e struttura da solo — cioè un pulsante che
// SCRIVE sopra il lavoro fatto a mano. Premuto due volte non deve raddoppiare
// niente, e non deve mai buttare via quello che hai scritto tu.
const { suite } = require('../motore.js');

module.exports = () => suite("Storia — il soggetto, i personaggi e i tre atti", {
  banco: '/test/banco/storia.html',
}, async ({ page, ok, sezione }) => {

  sezione('i campi lunghi finiscono nel progetto mentre scrivi');
  const campi = await page.evaluate(()=>{
    window.seminaProgetto({});
    window.apriStoria();
    const s = window.scriviIn('#soggetto-wrap .story-textarea',
      'Kara cerca il padre in una città che non esiste più.');
    const w = window.scriviIn('#world-wrap .story-textarea',
      'Italia, 1998. Piove sempre.');
    return { s, w, story: window.__p.story, salvataggi: (window.__salvataggi||[]).length };
  });
  ok('il soggetto si scrive nel progetto',
     /Kara cerca il padre/.test((campi.story||{}).soggetto||''), campi);
  ok('e il mondo pure', /Piove sempre/.test((campi.story||{}).world||''), campi);
  ok('con un salvataggio per ogni campo toccato', campi.salvataggi >= 2, campi);

  // Riaprire la scheda e' il momento in cui un campo scritto male si svuota:
  // si ridisegna tutto da capo, e se il valore non viene rimesso sparisce.
  const riaperto = await page.evaluate(()=>{
    window.apriStoria();
    window.apriStoria();
    return {
      soggetto: document.querySelector('#soggetto-wrap .story-textarea').value,
      world: document.querySelector('#world-wrap .story-textarea').value,
      inProgetto: window.__p.story.soggetto,
    };
  });
  ok('riaprendo la scheda il soggetto e\' ancora li\'',
     /Kara cerca il padre/.test(riaperto.soggetto), riaperto);
  ok('e anche il mondo', /Piove sempre/.test(riaperto.world), riaperto);
  ok('senza che la riapertura tocchi quello che c\'era scritto',
     riaperto.inProgetto === riaperto.soggetto, riaperto);

  sezione('la struttura a tre atti: aggiungere, scrivere, ritrovare');
  const atti = await page.evaluate(()=>{
    window.seminaProgetto({});
    window.apriStoria();
    window.story.addScene('setup');
    window.story.addScene('setup');
    window.story.addScene('confrontation');
    // Si scrive dentro le schede come si scriverebbe col dito.
    const carte = document.querySelectorAll('#act-body-setup .scene-text');
    carte[0].value = 'Kara trova la lettera.';
    carte[0].dispatchEvent(new Event('input', {bubbles:true}));
    carte[1].value = 'Il treno parte senza di lei.';
    carte[1].dispatchEvent(new Event('input', {bubbles:true}));
    return { acts: JSON.parse(JSON.stringify(window.__p.story.acts)), carte: carte.length };
  });
  ok('le scene si aggiungono nell\'atto giusto',
     atti.acts.setup.length === 2 && atti.acts.confrontation.length === 1, atti.acts);
  ok('e quello che ci scrivi dentro finisce nel progetto',
     atti.acts.setup[0] === 'Kara trova la lettera.' &&
     atti.acts.setup[1] === 'Il treno parte senza di lei.', atti.acts);

  const ridisegnate = await page.evaluate(()=>{
    window.story.renderActBoard(window.__p);
    return Array.from(document.querySelectorAll('#act-body-setup .scene-text')).map(t=>t.value);
  });
  ok('ridisegnando la lavagna le scene si rileggono tutte',
     ridisegnate.length === 2 && /lettera/.test(ridisegnate[0]) && /treno/.test(ridisegnate[1]),
     ridisegnate);

  sezione('e cancellare una scena si puo\' sempre annullare');
  // Una scena e' un pezzo di storia scritto a mano: se il dito sbaglia bottone
  // deve esserci un modo di rimetterla, e deve tornare al SUO posto.
  const cancellata = await page.evaluate(()=>{
    window.story.deleteScene('setup', 0);
    return { dopo: window.__p.story.acts.setup.slice(),
             toast: !!document.getElementById('undo-toast') };
  });
  ok('la scena se ne va', cancellata.dopo.length === 1 && /treno/.test(cancellata.dopo[0]), cancellata);
  ok('ma compare l\'annulla', cancellata.toast, cancellata);
  const rimessa = await page.evaluate(()=>{
    window.annullaUltima();
    return window.__p.story.acts.setup.slice();
  });
  ok('e annullando la scena torna, con dentro il suo testo',
     rimessa.length === 2 && rimessa[0] === 'Kara trova la lettera.', rimessa);
  ok('e torna al suo posto, non in fondo', /treno/.test(rimessa[1]), rimessa);

  sezione('i personaggi: nome, descrizione, e l\'annulla anche qui');
  const pers = await page.evaluate(()=>{
    window.seminaProgetto({});
    window.apriStoria();
    window.story.addCharacter();
    window.story.addCharacter();
    const nomi = document.querySelectorAll('#chars-list .char-name-v2');
    const desc = document.querySelectorAll('#chars-list .char-desc-v2');
    nomi[0].value = 'Kara'; nomi[0].dispatchEvent(new Event('input', {bubbles:true}));
    desc[0].value = 'Diciassette anni, non parla mai per prima.';
    desc[0].dispatchEvent(new Event('input', {bubbles:true}));
    nomi[1].value = 'Il padre'; nomi[1].dispatchEvent(new Event('input', {bubbles:true}));
    return { chars: JSON.parse(JSON.stringify(window.__p.story.characters)),
             iniziale: (document.querySelector('#chars-list .char-avatar')||{}).textContent };
  });
  ok('nome e descrizione finiscono nel progetto',
     pers.chars[0].name === 'Kara' && /Diciassette anni/.test(pers.chars[0].desc), pers.chars);
  ok('e il pallino prende l\'iniziale del nome', pers.iniziale === 'K', pers);

  const persCancellato = await page.evaluate(()=>{
    window.story.deleteCharacter(0);
    const dopo = JSON.parse(JSON.stringify(window.__p.story.characters));
    window.annullaUltima();
    return { dopo, tornato: JSON.parse(JSON.stringify(window.__p.story.characters)) };
  });
  ok('cancellando resta solo l\'altro',
     persCancellato.dopo.length === 1 && persCancellato.dopo[0].name === 'Il padre', persCancellato);
  ok('e annullando torna con la sua descrizione, non vuoto',
     persCancellato.tornato.length === 2 &&
     persCancellato.tornato[0].name === 'Kara' &&
     /Diciassette anni/.test(persCancellato.tornato[0].desc), persCancellato);

  sezione('il Breakdown legge lo scriptment e riempie la scheda');
  const COPIONE = [
    '# Atto I',
    'INT. CUCINA - ALBA',
    'Kara apre la lettera.',
    'KARA: Non ci credo.',
    '',
    'EST. STAZIONE - GIORNO',
    'Il treno parte.',
    'IL CAPOSTAZIONE: Si sbrighi.',
    '# Atto II',
    'INT. TRENO - NOTTE',
    'Kara guarda fuori.',
  ].join('\n');
  const breakdown = await page.evaluate(async (copione)=>{
    window.seminaProgetto({ scriptment: { text: copione, font:'courier', size:13 } });
    window.apriStoria();
    const quanti = await window.story.extractAllFromScript(null);
    return { quanti,
             chars: JSON.parse(JSON.stringify(window.__p.story.characters||[])),
             acts: JSON.parse(JSON.stringify(window.__p.story.acts)) };
  }, COPIONE);
  ok('i personaggi che parlano diventano personaggi',
     breakdown.chars.some(c=>/kara/i.test(c.name)) &&
     breakdown.chars.some(c=>/capostazione/i.test(c.name)), breakdown.chars);
  ok('scritti come nomi e non urlati in maiuscolo',
     breakdown.chars.every(c=> c.name !== c.name.toUpperCase()), breakdown.chars);
  ok('le scene finiscono nella struttura',
     breakdown.acts.setup.length === 2 && breakdown.acts.confrontation.length === 1,
     breakdown.acts);
  ok('e i marcatori d\'atto decidono in quale atto va ognuna',
     /TRENO/.test(breakdown.acts.confrontation[0]||''), breakdown.acts);
  ok('sotto l\'intestazione c\'e\' anche cosa succede',
     /Kara apre la lettera/.test(breakdown.acts.setup[0]||''), breakdown.acts);
  ok('battute comprese, con chi le dice',
     /KARA/.test(breakdown.acts.setup[0]||'') && /Non ci credo/.test(breakdown.acts.setup[0]||''),
     breakdown.acts);

  // Premuto due volte: e' il gesto normale (si scrive ancora un po' e si
  // ri-preme). Se raddoppiasse, la struttura diventerebbe inservibile.
  const dueVolte = await page.evaluate(async ()=>{
    await window.story.extractAllFromScript(null);
    return { chars: (window.__p.story.characters||[]).length,
             scene: window.__p.story.acts.setup.length + window.__p.story.acts.confrontation.length
                  + window.__p.story.acts.resolution.length };
  });
  ok('premendolo di nuovo non raddoppia i personaggi', dueVolte.chars === breakdown.chars.length, dueVolte);
  ok('ne\' le scene', dueVolte.scene === 3, dueVolte);

  sezione('e soprattutto non scrive sopra quello che hai scritto tu');
  const rispetta = await page.evaluate(async (copione)=>{
    window.seminaProgetto({ scriptment: { text: copione, font:'courier', size:13 } });
    window.__p.story = {
      characters: [{ name:'Kara', desc:'La descrizione che ho scritto io.' }],
      acts: { setup:['Una scena mia, scritta a mano.'], confrontation:[], resolution:[] },
    };
    window.apriStoria();
    await window.story.extractAllFromScript(null);
    const s = window.__p.story;
    return {
      kara: (s.characters||[]).filter(c=>/^kara$/i.test(c.name||'')),
      mia: (s.acts.setup||[]).filter(x=>/scritta a mano/.test(x)),
      totScene: s.acts.setup.length + s.acts.confrontation.length + s.acts.resolution.length,
    };
  }, COPIONE);
  ok('un personaggio che c\'era gia\' non viene duplicato', rispetta.kara.length === 1, rispetta);
  ok('e la sua descrizione resta la tua',
     /ho scritto io/.test(rispetta.kara[0].desc), rispetta);
  ok('la scena scritta a mano non viene cancellata', rispetta.mia.length === 1, rispetta);
  ok('e le scene del copione si aggiungono alle tue, non al posto loro',
     rispetta.totScene === 4, rispetta);

  sezione('la vista sceneggiatura mostra tutto, non un riassunto');
  // Il passaggio lavagna → sceneggiatura e' una riscrittura: se per strada
  // perde una scena, uno se ne accorge solo rileggendo tutto.
  const copione = await page.evaluate(()=>{
    window.seminaProgetto({});
    window.__p.story = { acts: {
      setup:['INT. CUCINA\nKara apre la lettera.'],
      confrontation:['INT. TRENO\nKara guarda fuori.'],
      resolution:['EST. MARE\nFine.'],
    }};
    window.apriStoria();
    window.story.toggleScreenplay();
    const testo = document.getElementById('act-board').textContent;
    window.story.toggleScreenplay();           // e si torna alla lavagna
    return { testo, tornato: !!document.getElementById('act-body-setup') };
  });
  ok('ci sono tutte e tre le scene',
     /CUCINA/.test(copione.testo) && /TRENO/.test(copione.testo) && /MARE/.test(copione.testo),
     copione.testo);
  ok('col loro contenuto, non solo i titoli',
     /apre la lettera/.test(copione.testo) && /guarda fuori/.test(copione.testo), copione.testo);
  ok('e si torna alla lavagna com\'era', copione.tornato, copione);

});
