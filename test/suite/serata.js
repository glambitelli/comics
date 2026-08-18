// Serata — le stelle, la striscia dei giorni, i trofei
//
// È la parte dell'app che non produce niente e che però tiene in piedi tutto
// il resto: la sera si spunta il task, si prende una stella, la striscia dei
// giorni consecutivi cresce. Se sbaglia, sbaglia in silenzio e nel modo
// peggiore possibile — una striscia di quaranta giorni che si azzera per un
// conto di date fatto male non si può ricostruire, e chi la perde smette.
//
// Qui il tempo si semina a mano in localStorage (com'è scritto davvero), che è
// l'unico modo di provare "ieri", "l'altro ieri" e "tre giorni fa" senza
// aspettare tre giorni.
const { suite } = require('../motore.js');

module.exports = () => suite("Serata — stelle, striscia dei giorni e trofei", {
  banco: '/test/banco/serata.html',
}, async ({ page, ok, sezione }) => {

  sezione('spuntare un task la sera vale una stella');
  const spuntato = await page.evaluate(()=>{
    window.pulisci();
    window.seminaProgetti([{ title:'Kara', microtask:'Inchiostrare la tavola 4' }]);
    window.evening.renderEveningList();
    const primaDelTocco = document.getElementById('evening-list').textContent;
    window.spunta('p1');
    return {
      primaDelTocco,
      stelle: localStorage.getItem('inkflow_stars'),
      storico: JSON.parse(localStorage.getItem('inkflow_task_history')||'[]'),
      microtask: window.progetti()[0].microtask,
      salvataggi: (window.__salvataggi||[]).slice(),
    };
  });
  ok('il task di stasera compare nell\'elenco',
     /Inchiostrare la tavola 4/.test(spuntato.primaDelTocco), spuntato.primaDelTocco);
  ok('spuntandolo si prende una stella', spuntato.stelle === '1', spuntato);
  ok('e il task finisce nello storico, con il nome del progetto',
     spuntato.storico.length === 1 && spuntato.storico[0].project === 'Kara'
     && /Inchiostrare/.test(spuntato.storico[0].task), spuntato.storico);
  ok('e il progetto viene salvato', spuntato.salvataggi.length >= 1, spuntato);
  // Il task spuntato si cancella dal progetto: e' quello che lo fa sparire da
  // "da fare stasera" domani sera, invece di ripresentarsi gia' fatto.
  ok('e il task si toglie dal progetto, non resta li\' fatto',
     spuntato.microtask === '', spuntato);

  const dopo = await page.evaluate(()=>{
    window.evening.renderEveningList();
    return {
      testo: document.getElementById('evening-list').textContent,
      mensile: JSON.parse(localStorage.getItem('inkflow_monthly_stars')||'{}'),
    };
  });
  ok('il task spuntato esce da "da fare" e passa fra le completate',
     /Task completate/.test(dopo.testo) && !/Da fare stasera/.test(dopo.testo), dopo.testo);
  ok('e la stella viene contata anche nel mese',
     Object.values(dopo.mensile).reduce((a,b)=>a+b,0) === 1, dopo.mensile);

  sezione('la striscia dei giorni: cresce, si ferma, riparte');
  // Il conto guarda solo due cose: qual era l'ultimo giorno segnato e se era
  // ieri. Tutto il resto — quante volte spunti oggi, a che ora — non conta.
  const striscia = await page.evaluate(()=>{
    const prova = (ultimo, quanti)=>{
      window.pulisci();
      if(ultimo !== null){
        localStorage.setItem('inkflow_streak_last', window.chiave(ultimo));
        localStorage.setItem('inkflow_streak', String(quanti));
      }
      window.evening.updateStreak();
      return parseInt(localStorage.getItem('inkflow_streak'));
    };
    return {
      primoGiorno: prova(null, 0),
      dopoIeri: prova(1, 5),
      dopoUnBuco: prova(3, 40),
    };
  });
  ok('il primo giorno la striscia vale uno', striscia.primoGiorno === 1, striscia);
  ok('se ieri c\'eri, oggi la striscia cresce', striscia.dopoIeri === 6, striscia);
  ok('se sono passati tre giorni si riparte da uno, non da zero',
     striscia.dopoUnBuco === 1, striscia);

  // Spuntare due task nella stessa sera non deve far crescere la striscia due
  // volte: e' un giorno solo, per quanti task si facciano.
  const stessoGiorno = await page.evaluate(()=>{
    window.pulisci();
    localStorage.setItem('inkflow_streak_last', window.chiave(1));
    localStorage.setItem('inkflow_streak', '3');
    window.evening.updateStreak();
    const dopoUno = parseInt(localStorage.getItem('inkflow_streak'));
    window.evening.updateStreak();
    window.evening.updateStreak();
    return { dopoUno, dopoTre: parseInt(localStorage.getItem('inkflow_streak')) };
  });
  ok('due task nella stessa sera contano un giorno solo',
     stessoGiorno.dopoUno === 4 && stessoGiorno.dopoTre === 4, stessoGiorno);

  // Quello che si LEGGE e' un'altra cosa da quello che e' SCRITTO: una striscia
  // ferma da tre giorni e' finita, e va mostrata a zero anche se il numero
  // vecchio e' ancora li'.
  const letta = await page.evaluate(()=>{
    const leggi = (ultimo, quanti)=>{
      window.pulisci();
      localStorage.setItem('inkflow_streak_last', window.chiave(ultimo));
      localStorage.setItem('inkflow_streak', String(quanti));
      return window.evening.getStreak();
    };
    return { oggi: leggi(0, 9), ieri: leggi(1, 9), vecchia: leggi(4, 9) };
  });
  ok('segnata oggi, la striscia si legge intera', letta.oggi === 9, letta);
  ok('segnata ieri pure: la serata di oggi puo\' ancora arrivare', letta.ieri === 9, letta);
  ok('ma una striscia interrotta si legge zero, non nove', letta.vecchia === 0, letta);

  // Il record non deve seguire la striscia quando si azzera: e' il numero che
  // vale un trofeo, e un trofeo preso non si toglie.
  const record = await page.evaluate(()=>{
    window.pulisci();
    localStorage.setItem('inkflow_streak_last', window.chiave(1));
    localStorage.setItem('inkflow_streak', '13');
    window.evening.updateStreak();                       // arriva a 14
    const max = localStorage.getItem('inkflow_max_streak');
    localStorage.setItem('inkflow_streak_last', window.chiave(9));  // poi si interrompe
    window.evening.updateStreak();                       // riparte da 1
    return { max, adesso: localStorage.getItem('inkflow_streak'),
             maxDopo: localStorage.getItem('inkflow_max_streak') };
  });
  ok('il record si segna quando la striscia cresce', record.max === '14', record);
  ok('e resta anche dopo che la striscia si e\' interrotta',
     record.adesso === '1' && record.maxDopo === '14', record);

  sezione('lo storico si puo\' svuotare, e le stelle restano');
  const svuotato = await page.evaluate(()=>{
    window.pulisci();
    window.seminaProgetti([{ title:'Kara', microtask:'Una cosa' }]);
    window.evening.renderEveningList();
    window.spunta('p1');
    const prima = { stelle: localStorage.getItem('inkflow_stars'),
                    storico: JSON.parse(localStorage.getItem('inkflow_task_history')||'[]').length };
    window.evening.clearTaskHistory();
    return { prima, storico: localStorage.getItem('inkflow_task_history'),
             stelle: localStorage.getItem('inkflow_stars') };
  });
  ok('svuotando lo storico l\'elenco delle task se ne va',
     svuotato.prima.storico === 1 && !svuotato.storico, svuotato);
  ok('ma le stelle guadagnate non si toccano', svuotato.stelle === '1', svuotato);

  sezione('le statistiche raccontano gli stessi numeri');
  const numeri = await page.evaluate(()=>{
    window.pulisci();
    localStorage.setItem('inkflow_stars', '12');
    localStorage.setItem('inkflow_streak_last', window.chiave(0));
    localStorage.setItem('inkflow_streak', '4');
    window.seminaProgetti([
      { title:'Kara', numTav:10, tavole:{1:4,2:4,3:2} },
      { title:'Altro', numTav:5, tavole:{1:4} },
    ]);
    window.stats.renderStats();
    return document.getElementById('stats-numbers').textContent.replace(/\s+/g,' ');
  });
  ok('conta le tavole finite, non quelle cominciate', /3\s*tavole finite/.test(numeri), numeri);
  ok('i progetti sono due', /2\s*progetti/.test(numeri), numeri);
  ok('le serate sono le stelle prese', /12\s*serate/.test(numeri), numeri);
  ok('e la striscia e\' quella viva', /4\s*streak/.test(numeri), numeri);

  sezione('e i trofei si accendono quando te li sei guadagnati');
  const trofei = await page.evaluate(()=>{
    const leggi = ()=>{
      window.stats.renderStats();
      const presi = Array.from(document.querySelectorAll('.trophy-item.earned'));
      return { presi: presi.map(t=> (t.dataset.tip||t.textContent).replace(/\s+/g,' ').trim()),
               quanti: presi.length,
               targhetta: (document.getElementById('trophy-caption')||{}).textContent || '' };
    };
    window.pulisci();
    window.seminaProgetti([]);
    const vuoto = leggi();
    window.seminaProgetti([{ title:'Kara', numTav:10, tavole:{1:4},
      story:{ soggetto:'C\'era una volta.', characters:[{name:'Kara'}] } }]);
    localStorage.setItem('inkflow_stars', '1');
    const pieno = leggi();
    return { vuoto, pieno };
  });
  ok('senza progetti non c\'e\' niente da festeggiare', trofei.vuoto.quanti === 0, trofei.vuoto);
  ok('col primo progetto arriva il primo trofeo',
     trofei.pieno.presi.some(t=>/primo seme/i.test(t)), trofei.pieno.presi);
  ok('e il soggetto scritto ne accende un altro',
     trofei.pieno.presi.some(t=>/prima voce/i.test(t)), trofei.pieno.presi);
  ok('la prima tavola finita pure',
     trofei.pieno.presi.some(t=>/orma sulla sabbia/i.test(t)), trofei.pieno.presi);
  ok('e la prima serata anche',
     trofei.pieno.presi.some(t=>/prima notte/i.test(t)), trofei.pieno.presi);

});
