// Scriptment — il testo che scrivi deve restare il testo che hai scritto
//
// È la prova più importante dopo il backup, e per lo stesso motivo: qui dentro
// c'è l'unica cosa dell'app che non si può rifare. Un ritaglio si ricarica, una
// tavola si ridisegna, una percentuale sbagliata si nota; una frase riscritta
// da sola nel modo sbagliato non torna più, e nessuno se ne accorge finché non
// serve.
//
// L'editor non è un <textarea>: è un contenteditable dove il testo viene
// IMPAGINATO (scene in maiuscolo, nomi, battute) e poi RILETTO dal DOM ad ogni
// tasto premuto. Quel giro — testo → HTML → testo — è il punto in cui il testo
// può cambiare senza che nessuno l'abbia chiesto. Ed è esattamente quello che
// succedeva: due difetti trovati scrivendo questa suite, tutti e due qui sotto
// nella sezione "quello che non deve più succedere".
const { suite } = require('../motore.js');

module.exports = () => suite("Scriptment — il testo che scrivi resta quello che hai scritto", {
  banco: '/test/banco/scriptment.html',
}, async ({ page, ok, sezione }) => {

  // Il giro completo: si semina il testo nel progetto, si apre l'editor (che lo
  // impagina) e si preme un tasto (che lo fa rileggere e salvare). È il viaggio
  // che fa il testo ogni volta che si scrive dentro lo scriptment.
  const giro = (testo)=> page.evaluate(t=> window.giroCompleto(t), testo);

  sezione('la prosa torna indietro identica, virgola per virgola');
  const prosa = 'Kara cammina sotto la pioggia.\n\nLa città è vuota: nemmeno un cane.\nPoi, dal fondo, una luce.';
  ok('parola per parola, com\'era', await giro(prosa) === prosa, await giro(prosa));
  const vuote = 'Prima riga.\n\n\nUltima riga.';
  ok('e le righe vuote in mezzo restano quante erano', await giro(vuote) === vuote, await giro(vuote));
  const accenti = 'Perché è così? Un\'idea, «virgolette», trattini — e i tre puntini…';
  ok('accenti, apostrofi e trattini non si perdono per strada',
     await giro(accenti) === accenti, await giro(accenti));

  sezione('quello che non deve piu\' succedere');
  // 1) OGNI RIGA DIVENTAVA UN TITOLO. La rilettura guardava se la classe della
  // riga "conteneva" sp-act — e sp-action la contiene. Risultato: bastava
  // premere un tasto perche' ogni riga di prosa si portasse a casa un "# "
  // davanti, e alla riapertura non fosse piu' testo ma un marcatore d'atto.
  const senzaCancelletti = await giro('Kara cammina.\nPoi si ferma.');
  ok('una riga di prosa non si trasforma in un titolo d\'atto',
     !/^#/m.test(senzaCancelletti), senzaCancelletti);
  // E l'altra meta' della correzione: i titoli d'atto VERI devono continuare a
  // tornare indietro col loro cancelletto, se no si aggiusta una cosa
  // rompendone un'altra.
  const conAtto = '# Atto I\nKara cammina.';
  ok('ma un titolo d\'atto vero resta un titolo d\'atto',
     await giro(conAtto) === conAtto, await giro(conAtto));
  // 2) UN NUMERO DA SOLO SPARIVA. Era scartato sempre, con la scusa che "non e'
  // mai contenuto valido": ma un anno, una data, un'annata su una riga sua lo
  // sono eccome.
  const anno = '1984\nUn anno qualunque.';
  ok('un anno scritto su una riga sua non sparisce', await giro(anno) === anno, await giro(anno));
  // Il residuo vero da buttare c'e' ancora ed e' un altro: il vecchio difetto
  // che ripeteva il numero della scena subito sotto l'intestazione.
  const doppione = await giro('INT. BAR - NOTTE\n1\nKara entra.');
  ok('ma il numero di scena ripetuto sotto l\'intestazione se ne va',
     !/^1$/m.test(doppione) && /INT\. BAR/.test(doppione) && /Kara entra/.test(doppione), doppione);

  // 3) LA RETE DI SICUREZZA SCATTAVA A VUOTO, E FACEVA DANNI. Alla fine della
  // rilettura c'e' un controllo che confronta le parole lette con quelle
  // visibili: se qualcosa manca, ripiega su innerText — cioe' sul testo COME
  // SI VEDE, con il maiuscolo del CSS e senza i cancelletti. Ma il confronto
  // incollava le righe fra loro ("Atto I" + "Kara" = "ikara"), quindi dichiarava
  // parole mancanti ogni volta che una riga non finiva con un punto. Ad ogni
  // tasto premuto il testo veniva riscritto dalla rete di sicurezza.
  const senzaPunto = 'Titolo senza punto\nUn nome qualunque\nE poi si va avanti.';
  ok('due righe che non finiscono con un punto restano come sono',
     await giro(senzaPunto) === senzaPunto, await giro(senzaPunto));
  const moltoVuote = 'Prima.\n\n\n\n\nDopo un lungo respiro.';
  ok('e una pausa lunga cinque righe vuote resta lunga cinque righe',
     await giro(moltoVuote) === moltoVuote, await giro(moltoVuote));

  sezione('e riaprire cento volte non cambia una virgola');
  // La deriva e' il modo silenzioso in cui un testo si rovina: ogni apertura lo
  // cambia un pochino, e dopo un mese non e' piu' quello che avevi scritto.
  const misto = 'INT. BAR - NOTTE\n\nKara entra e si scuote l\'acqua di dosso.\n\nKARA\nHo freddo.\n\nCUT TO:';
  const primo = await giro(misto);
  const secondo = await giro(primo);
  const terzo = await giro(secondo);
  ok('la seconda apertura lascia tutto com\'era', secondo === primo, { primo, secondo });
  ok('e la terza pure', terzo === primo, { primo, terzo });

  sezione('lo screenplay viene riconosciuto per quello che e\'');
  const tipi = await page.evaluate(()=>
    window.sm.parseScreenplay('# Atto I\nINT. BAR - NOTTE\nKara entra.\nKARA\nHo freddo.\nCUT TO:\n// nota mia')
      .map(n=> n.type));
  ok('l\'intestazione di scena e\' una scena', tipi.includes('scene'), tipi);
  ok('il nome in maiuscolo e\' un personaggio, e la riga dopo la sua battuta',
     tipi.indexOf('character') >= 0 && tipi[tipi.indexOf('character')+1] === 'dialogue', tipi);
  ok('lo stacco e\' uno stacco', tipi.includes('transition'), tipi);
  ok('il marcatore d\'atto e\' un atto', tipi.includes('act'), tipi);
  ok('e le note con // restano note', tipi.includes('note'), tipi);
  const numerata = await page.evaluate(()=>
    window.sm.parseScreenplay('INT. BAR\nEST. STRADA')
      .filter(n=> n.type==='scene').map(n=> n.scene));
  ok('le scene si numerano da sole, in ordine',
     numerata.length === 2 && numerata[0] === 1 && numerata[1] === 2, numerata);

  sezione('formattare mette in ordine, non butta via');
  // "Formatta" riscrive tutto il testo: e' il gesto piu' pericoloso dell'editor.
  // Non si controlla che il risultato sia bello — si controlla che dentro ci
  // siano ancora TUTTE le parole di partenza.
  const formattato = await page.evaluate(()=>{
    const testo = 'int. bar - notte\nkara entra bagnata fradicia\nKARA: ho freddo da morire\ncut to:\nEST. STRADA - GIORNO\nil sole acceca';
    window.seminaProgetto({ scriptment:{ text:testo, font:'courier', size:13 } });
    window.sm.openScriptment();
    window.sm.formatScriptment();
    const parole = s => (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
    const dopo = window.__p.scriptment.text;
    const mancanti = parole(testo).filter(w => !parole(dopo).includes(w));
    return { dopo, mancanti };
  });
  ok('non manca nessuna parola all\'appello', formattato.mancanti.length === 0, formattato);
  ok('le scene salgono in maiuscolo', /INT\. BAR - NOTTE/.test(formattato.dopo), formattato.dopo);
  ok('e i nomi restano nomi', /KARA/.test(formattato.dopo), formattato.dopo);

  // Il caso che fa perdere un pomeriggio di lavoro: premere formatta e
  // ritrovarsi la pagina bianca. C'e' una difesa nel codice, e va provata.
  const vuoto = await page.evaluate(()=>{
    window.seminaProgetto({ scriptment:{ text:'Una riga sola, ma mia.', font:'courier', size:13 } });
    window.sm.openScriptment();
    const ta = document.getElementById('scriptment-text');
    ta.innerHTML = '';                       // l'editor sembra vuoto...
    ta.textContent = 'Una riga sola, ma mia.'; // ...ma il testo c'e'
    window.sm.formatScriptment();
    return window.__p.scriptment.text;
  });
  ok('formattare non sostituisce mai il testo con il vuoto', /Una riga sola/.test(vuoto), vuoto);

  sezione('e ogni tasto premuto arriva fino al progetto');
  const salvato = await page.evaluate(()=>{
    window.seminaProgetto({ scriptment:{ text:'Prima riga.', font:'courier', size:13 } });
    window.sm.openScriptment();
    window.__salvataggi = [];
    window.scriviRiga('Seconda riga, scritta adesso.');
    return {
      testo: window.__p.scriptment.text,
      salvataggi: (window.__salvataggi||[]).length,
      conta: (document.getElementById('scriptment-foot-count')||{}).textContent || '',
    };
  });
  ok('la riga nuova finisce nel progetto', /Seconda riga, scritta adesso\./.test(salvato.testo), salvato);
  ok('senza portarsi via quella di prima', /Prima riga\./.test(salvato.testo), salvato);
  ok('e parte un salvataggio', salvato.salvataggi >= 1, salvato);
  ok('il conto delle parole si aggiorna mentre scrivi', /\d+ parole/.test(salvato.conta), salvato);

  sezione('chiudere l\'editor non e\' un modo di perdere l\'ultima riga');
  const chiuso = await page.evaluate(()=>{
    window.seminaProgetto({ scriptment:{ text:'Inizio.', font:'courier', size:13 } });
    window.sm.openScriptment();
    window.scriviRiga('Ultima cosa scritta prima di chiudere.');
    window.sm.closeScriptment();
    return {
      testo: window.__p.scriptment.text,
      aperto: document.getElementById('scriptment-overlay').classList.contains('open'),
    };
  });
  ok('l\'ultima riga e\' nel progetto', /Ultima cosa scritta/.test(chiuso.testo), chiuso);
  ok('e l\'editor si e\' chiuso davvero', !chiuso.aperto, chiuso);

  // Riaprendolo deve ritrovare tutto: e' la prova che il salvataggio in memoria
  // e la rilettura parlano la stessa lingua.
  const riaperto = await page.evaluate(()=>{
    window.sm.openScriptment();
    return document.getElementById('scriptment-text').textContent;
  });
  ok('e riaprendo si ritrova tutto quello che c\'era',
     /Inizio\./.test(riaperto) && /Ultima cosa scritta/.test(riaperto), riaperto);

  sezione('il carattere e il corpo restano quelli scelti');
  const stile = await page.evaluate(()=>{
    window.seminaProgetto({ scriptment:{ text:'Prova.', font:'courier', size:13 } });
    window.sm.openScriptment();
    window.sm.setScriptmentFont('serif');
    window.sm.stepScriptmentSize(2);
    window.sm.stepScriptmentSize(2);
    const ta = document.getElementById('scriptment-text');
    return { font: window.__p.scriptment.font, size: window.__p.scriptment.size,
             classe: ta.className, css: ta.style.fontSize, testo: window.__p.scriptment.text };
  });
  ok('il carattere scelto si scrive nel progetto', stile.font === 'serif', stile);
  ok('e si vede davvero nell\'editor', /sm-font-serif/.test(stile.classe), stile);
  ok('il corpo cresce di due alla volta', stile.size === 17 && stile.css === '17px', stile);
  ok('e cambiare vestito non tocca il testo', stile.testo === 'Prova.', stile);
  // Il corpo ha un tetto: 22. Senza, si arriva a caratteri che non stanno in
  // pagina e l'editor diventa inusabile senza un modo ovvio di tornare indietro.
  const tetto = await page.evaluate(()=>{
    for(let i=0;i<20;i++) window.sm.stepScriptmentSize(1);
    const su = window.__p.scriptment.size;
    for(let i=0;i<30;i++) window.sm.stepScriptmentSize(-1);
    return { su, giu: window.__p.scriptment.size };
  });
  ok('e non si va oltre il leggibile, ne\' sopra ne\' sotto',
     tetto.su === 22 && tetto.giu === 10, tetto);

});
