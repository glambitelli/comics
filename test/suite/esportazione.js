// Esportazione — il report e il copione che mandi fuori
//
// È l'unica cosa dell'app che esce da qui e finisce sotto gli occhi di
// qualcun altro: un editore, uno studio, un amico che legge. Un numero
// sbagliato dentro l'app te lo correggi; un numero sbagliato dentro un PDF già
// mandato no. E c'è il difetto peggiore di tutti, quello silenzioso: un pezzo
// di storia che nel documento non c'è, e di cui ci si accorge solo dall'altra
// parte.
//
// L'esportazione apre una finestra e ci scrive dentro il documento, poi lo
// manda in stampa. Qui la finestra è finta e tiene da parte l'HTML: si legge
// cosa sarebbe finito sulla carta, senza carta.
const { suite } = require('../motore.js');

module.exports = () => suite("Esportazione — il report e il copione che mandi fuori", {
  banco: '/test/banco/pdf.html',
}, async ({ page, ok, sezione }) => {

  const PROGETTO = {
    title: 'Kara', numTav: 4, tavole: {1:4, 2:4, 3:2},
    dateStart: '2026-01-10', dateEnd: '2026-12-31',
    notes: 'Non dimenticare la scena del treno.',
    sfide: [{ text:'Le mani in prospettiva', done:false }],
    story: {
      soggetto: 'Kara cerca il padre in una città che non esiste più.',
      world: 'Italia, 1998. Piove sempre.',
      pp: { inciting:'Trova la lettera.', pp1:'Parte.', pp2:'Scopre la verità.' },
      characters: [{ name:'Kara', desc:'Diciassette anni, non parla mai per prima.' }],
      acts: {
        setup: ['INT. CUCINA - ALBA\nKara apre la lettera.'],
        confrontation: ['INT. TRENO - NOTTE\nGuarda fuori.'],
        resolution: ['EST. MARE - GIORNO\nFine.'],
      },
    },
  };

  sezione('nel report c\'e\' tutto il progetto, non un riassunto');
  const report = await page.evaluate(async (p)=>{
    window.seminaProgetto(p);
    return await window.esporta('report');
  }, PROGETTO);
  ok('il documento viene scritto e mandato in stampa',
     report.html.length > 500 && report.stampata && report.chiusa, {
       lungo: report.html.length, stampata: report.stampata });
  ok('c\'e\' il titolo del progetto', /Kara/.test(report.html), null);
  ok('e i numeri della produzione: quante tavole finite su quante',
     /2 \/ 4/.test(report.html), null);
  ok('con l\'avanzamento in percentuale', /\d+%/.test(report.html), null);
  ok('le date di inizio e fine', /2026-01-10/.test(report.html) && /2026-12-31/.test(report.html), null);
  ok('il soggetto per intero', /Kara cerca il padre/.test(report.html), null);
  ok('l\'ambientazione', /Piove sempre/.test(report.html), null);
  ok('i personaggi con la loro descrizione',
     /Diciassette anni/.test(report.html), null);
  ok('tutte e tre le scene dei tre atti, con dentro cosa succede',
     /Kara apre la lettera/.test(report.html) && /Guarda fuori/.test(report.html)
     && /Fine\./.test(report.html), null);
  ok('l\'inciting incident e i due plot point',
     /Trova la lettera/.test(report.html) && /Parte\./.test(report.html)
     && /Scopre la verit/.test(report.html), null);
  ok('le sfide visive', /mani in prospettiva/.test(report.html), null);
  ok('le note', /scena del treno/.test(report.html), null);
  // La tabella delle tavole ha una riga per tavola, sempre: e' il colpo
  // d'occhio su cosa manca.
  const righe = await page.evaluate(()=> (window.__finestra.html.match(/<tr /g)||[]).length);
  ok('e una riga per ogni tavola, anche per quelle non cominciate', righe >= 4, righe);

  sezione('e la Pipeline dice quello che hai davvero spuntato');
  // È IL DIFETTO PEGGIORE CHE ABBIA AVUTO QUESTO FILE, ed era invisibile: le
  // voci erano scritte a mano nel report ('Soggetto', 'Layouts', 'Moodboard
  // visiva') mentre le chiavi vere erano il testo della casella col tag
  // attaccato ('Soggetto mattina'). Nessuna delle cinque cercate esisteva:
  // la sezione Pipeline usciva SEMPRE tutta da fare, anche a progetto finito.
  // Un report non lo si rilegge riga per riga, quindi nessuno se ne accorgeva.
  const pipeline = await page.evaluate(async (p)=>{
    window.seminaProgetto(Object.assign({}, p, {
      steps: { soggetto:true, layouts:true },   // due spuntati, cinque no
    }));
    const html = (await window.esporta('report')).html;
    // La sezione Pipeline sta fra il suo titolo e quello dopo.
    const da = html.indexOf('>Pipeline<');
    const pezzo = html.slice(da, html.indexOf('Tavole', da));
    const spunta = nome =>{
      const i = pezzo.indexOf('>' + nome + '<');
      if(i < 0) return null;
      // il pallino della voce sta subito prima del suo nome
      return pezzo.lastIndexOf('✓', i) > pezzo.lastIndexOf('#e8e8e8', i);
    };
    return {
      nomi: window.state.STEPS.map(x=> x.nome).filter(n=> pezzo.includes('>' + n + '<')),
      soggetto: spunta('Soggetto'),
      layouts: spunta('Layouts'),
      personaggi: spunta('Personaggi'),
      reference: spunta('Reference'),
    };
  }, PROGETTO);
  // Nell'elenco scritto a mano mancavano proprio Personaggi e Ambientazione.
  ok('ci sono tutte e sette le voci', pipeline.nomi.length === 7, pipeline);
  ok('quelle spuntate risultano spuntate',
     pipeline.soggetto === true && pipeline.layouts === true, pipeline);
  ok('e quelle no, no',
     pipeline.personaggi === false && pipeline.reference === false, pipeline);

  sezione('un progetto appena nato si esporta lo stesso, senza rompersi');
  // Il caso in cui e' facile andare in errore: niente storia, niente date,
  // niente di niente. Deve uscire un documento, non una pagina bianca.
  const nudo = await page.evaluate(async ()=>{
    window.seminaProgetto({ title:'Nuovo', numTav:1 });
    return await window.esporta('report');
  });
  ok('il documento esce comunque', nudo.html.length > 300 && nudo.stampata, nudo.html.length);
  ok('e dice che le scene non ci sono, invece di mentire',
     /Nessuna scena/.test(nudo.html) || !/Struttura narrativa/.test(nudo.html), null);

  sezione('e un titolo con dentro dei simboli non rompe la pagina');
  // Un titolo con < o & finirebbe dentro l'HTML del documento: se non viene
  // messo al sicuro, da li' in poi la pagina e' rotta e mezzo report sparisce.
  const simboli = await page.evaluate(async ()=>{
    window.seminaProgetto({ title:'<b>Kara</b> & il "mare"', numTav:1,
      story:{ soggetto:'Una <cosa> & un\'altra' } });
    const r = await window.esporta('report');
    return { html: r.html, grezzo: /<b>Kara<\/b>/.test(r.html) };
  });
  ok('il titolo viene messo al sicuro, non interpretato',
     !simboli.grezzo && /&lt;b&gt;Kara/.test(simboli.html), simboli.grezzo);
  ok('e la e commerciale pure', /&amp;/.test(simboli.html), null);
  ok('anche dentro il soggetto', /Una &lt;cosa&gt;/.test(simboli.html), null);

  sezione('il copione esce impaginato come una sceneggiatura');
  const COPIONE = [
    'INT. CUCINA - ALBA',
    'Kara apre la lettera.',
    'KARA: Non ci credo.',
    'CUT TO:',
    'EST. STAZIONE - GIORNO',
    'Il treno parte senza di lei.',
  ].join('\n');
  const copione = await page.evaluate(async (testo)=>{
    window.seminaProgetto({ title:'Kara', scriptment:{ text:testo, font:'courier', size:13 } });
    return await window.esporta('copione');
  }, COPIONE);
  ok('c\'e\' il frontespizio col titolo', /Kara/.test(copione.html), null);
  ok('le scene sono scene', /sp-scene/.test(copione.html), null);
  ok('i nomi e le battute sono al loro posto',
     /sp-character/.test(copione.html) && /sp-dialogue/.test(copione.html), null);
  ok('e lo stacco pure', /sp-transition/.test(copione.html), null);
  // La cosa che conta davvero: nel copione ci devono essere TUTTE le parole
  // dello scriptment. Un documento impaginato bene ma incompleto e' peggio di
  // uno brutto.
  const perse = await page.evaluate((testo)=>{
    const html = window.__finestra.html;
    const testoDoc = html.replace(/<[^>]+>/g,' ').toLowerCase();
    const parole = (testo.toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]);
    return parole.filter(w=> !testoDoc.includes(w));
  }, COPIONE);
  ok('e non manca una parola di quello che avevi scritto', perse.length === 0, perse);
  ok('il copione viene mandato in stampa', copione.stampata, copione.stampata);

  const copioneVuoto = await page.evaluate(async ()=>{
    window.seminaProgetto({ title:'Vuoto', scriptment:{ text:'', font:'courier', size:13 } });
    return await window.esporta('copione');
  });
  ok('senza niente scritto lo dice, invece di stampare pagine bianche',
     /Ancora niente scritto/.test(copioneVuoto.html), null);

  sezione('e se il browser blocca la finestra, si capisce perche\'');
  // Su mobile capita spesso, ed e' il momento in cui un pulsante che "non fa
  // niente" fa pensare che l'esportazione sia rotta.
  const bloccato = await page.evaluate(async ()=>{
    window.__popupBloccato = true;
    window.seminaProgetto({ title:'Kara', numTav:1 });
    const r = await window.esporta('report');
    const c = await window.esporta('copione');
    window.__popupBloccato = false;
    return { avvisiReport: r.avvisi, avvisiCopione: c.avvisi };
  });
  ok('il report lo dice a parole', /popup/i.test(bloccato.avvisiReport[0]||''), bloccato);
  ok('e il copione anche', /popup/i.test(bloccato.avvisiCopione[0]||''), bloccato);

});
