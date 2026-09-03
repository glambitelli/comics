// Progetti — i numeri su cui prendi le decisioni
//
// Questa è la metà dell'app che finora nessuna prova guardava: la percentuale,
// i giorni che restano, il ritmo, la previsione di fine. Sono numeri che non
// "si rompono" in modo visibile — continuano a comparire, solo sbagliati — ed
// è il guasto peggiore che possa avere un'app di lavoro: uno pianifica la
// settimana su una previsione falsa e se ne accorge a cose fatte.
//
// Si prova la MATEMATICA (calcPct, calcDaysLeft, calcVelocity, calcForecast) e
// poi che quei numeri arrivino davvero a schermo.
const { suite } = require('../motore.js');

module.exports = () => suite("Progetti — i numeri su cui prendi le decisioni", {
  banco: '/test/banco/progetto.html',
}, async ({ page, ok, sezione }) => {

  const conta = (dati)=> page.evaluate(d=>{
    const p = window.seminaProgetto(d);
    return { pct: window.progress.calcPct(p), fase: window.progress.getPhaseIndex(p) };
  }, dati);

  sezione('la percentuale conta i passi E le tavole finite');
  // IL TOTALE È SETTE PASSI più una voce per tavola: un progetto da 10 tavole
  // ha diciassette caselle da riempire. Il denominatore era scritto a mano
  // come 5 mentre le caselle erano sette, quindi la percentuale usciva
  // gonfiata di un buon dieci per cento — ed è la formula con cui si decide
  // "a che punto sono".
  const sette = await page.evaluate(()=> window.state.STEPS.map(s=> s.id));
  ok('gli step del progetto sono sette', sette.length === 7, sette);

  const vuoto = await conta({});
  ok('un progetto appena nato è a zero', vuoto.pct === 0, vuoto);
  const treStep = await conta({ steps:{ moodboard:true, soggetto:true, personaggi:true } });
  ok('tre passi su diciassette fanno il 18%', treStep.pct === 18, treStep);

  // UNA CHIAVE CHE NON È UNO STEP NON CONTA. In archivio restano le chiavi
  // vecchie (il testo della casella), e contandole con Object.values la stessa
  // spunta poteva valere due volte.
  const finte = await conta({ steps:{ 'Soggetto mattina':true, 'roba a caso':true } });
  ok('una chiave che non è uno step non gonfia la percentuale', finte.pct === 0, finte);

  const conTavole = await page.evaluate(()=>{
    window.seminaProgetto({ steps:{ moodboard:true, soggetto:true, personaggi:true, ambiente:true, struttura:true } });
    const p = window.finisciTavole(5);
    return { pct: window.progress.calcPct(p) };
  });
  ok('cinque passi e cinque tavole fanno il 59%', conTavole.pct === 59, conTavole);
  const finito = await page.evaluate(()=>{
    const tutti = {};
    window.state.STEPS.forEach(s=> tutti[s.id] = true);
    window.seminaProgetto({ steps: tutti });
    const p = window.finisciTavole(10);
    return { pct: window.progress.calcPct(p) };
  });
  ok('tutto fatto fa 100, non 99', finito.pct === 100, finito);
  // E NON PUÒ SUPERARE IL 100: col denominatore a cinque, spuntando tutte e
  // sette le caselle "done" superava "total".
  ok('e non si sfora mai il 100', finito.pct <= 100, finito);
  // Una tavola a metà lavorazione NON conta: conta solo quando è finita
  // (stato 4). Se contasse prima, la percentuale correrebbe avanti al lavoro.
  const meta = await page.evaluate(()=>{
    const p = window.seminaProgetto({});
    p.tavole = {1:1, 2:2, 3:3};
    return { pct: window.progress.calcPct(p) };
  });
  ok('e una tavola cominciata ma non finita non conta', meta.pct === 0, meta);

  sezione('la fase si legge dai passi DELLA fase, non dal mucchio');
  // Sviluppo ha cinque caselle, Pre-produzione due. Contando "quante ne ho
  // spuntate in tutto" risultava in Pre-produzione chi aveva finito mezzo
  // Sviluppo.
  const F1 = { moodboard:true, soggetto:true, personaggi:true, ambiente:true, struttura:true };
  ok('con lo Sviluppo a metà si è ancora in Sviluppo',
     (await conta({steps:{ moodboard:true, soggetto:true, personaggi:true }})).fase === 0);
  ok('finito lo Sviluppo si passa in Pre-produzione',
     (await conta({steps: F1})).fase === 1);
  ok('e non basta spuntare i Layout se lo Sviluppo non è finito',
     (await conta({steps:{ moodboard:true, layouts:true, reference:true }})).fase === 0);
  ok('finita anche la Pre-produzione si è in Realizzazione',
     (await conta({steps: Object.assign({}, F1, { layouts:true, reference:true })})).fase === 2);

  sezione('le spunte già in archivio non si perdono');
  // Chi usa Inkflow da mesi ha le chiavi vecchie: il testo della casella, tag
  // compreso. Alla prima apertura si ricopiano sugli id.
  const migrata = await page.evaluate(()=>{
    const p = window.seminaProgetto({ steps:{ 'Soggetto mattina':true, 'Layouts sera':true } });
    const cambiato = window.state.migraSteps(p);
    return { cambiato, soggetto: p.steps.soggetto, layouts: p.steps.layouts,
             vecchiaRimasta: p.steps['Soggetto mattina'],
             pct: window.progress.calcPct(p) };
  });
  ok('le chiavi vecchie diventano id', migrata.soggetto === true && migrata.layouts === true, migrata);
  ok('e chi migra lo dice, così chi chiama sa che deve salvare', migrata.cambiato === true, migrata);
  // Le vecchie si lasciano: toglierle vorrebbe dire che un ripristino da un
  // backup di ieri le farebbe sparire davvero.
  ok('la chiave vecchia resta dov\'è', migrata.vecchiaRimasta === true, migrata);
  ok('e adesso contano una volta sola, non due', migrata.pct === 12, migrata);

  sezione('i giorni che restano, contati sui giorni e non sulle ore');
  // Il calcolo azzera l'ora di oggi e della scadenza: senza, una deadline
  // fissata stamattina risulterebbe "scaduta" nel pomeriggio.
  const giorni = await page.evaluate(()=>{
    const fra = (g)=>{
      const p = window.seminaProgetto({ dateEnd: window.dataFraGiorni(g) });
      return window.velocity.calcDaysLeft(p);
    };
    const senza = window.velocity.calcDaysLeft(window.seminaProgetto({}));
    return { oggi: fra(0), fraDieci: fra(10), scaduto: fra(-3), senza };
  });
  ok('una scadenza oggi vale zero giorni, non meno uno', giorni.oggi === 0, giorni);
  ok('fra dieci giorni sono dieci', giorni.fraDieci === 10, giorni);
  ok('e una passata da tre giorni fa -3', giorni.scaduto === -3, giorni);
  ok('senza scadenza non si inventa un numero', giorni.senza === null, giorni);

  sezione('il ritmo: quante tavole a settimana');
  const ritmo = await page.evaluate(()=>{
    window.seminaProgetto({ dateStart: window.dataFraGiorni(-28), dateEnd: window.dataFraGiorni(28) });
    const p = window.finisciTavole(4);
    return window.velocity.calcVelocity(p);
  });
  ok('quattro tavole in quattro settimane fanno una a settimana',
     ritmo.actual === 1 && ritmo.weeksElapsed === 4, ritmo);
  ok('e ne servono 1,5 a settimana per finire le sei che restano in quattro',
     ritmo.needed === 1.5, ritmo);
  const senzaInizio = await page.evaluate(()=>
    window.velocity.calcVelocity(window.seminaProgetto({})));
  ok('senza data d\'inizio il ritmo è zero e non una divisione per niente',
     senzaInizio.actual === 0 && senzaInizio.needed === null, senzaInizio);

  sezione('la previsione di fine guarda solo alle settimane recenti');
  // È la ragione per cui esiste: un progetto fermo per mesi e ripreso adesso
  // deve mostrare il ritmo di ADESSO, non la media annacquata dal fermo.
  const pochi = await page.evaluate(()=>{
    const p = window.seminaProgetto({});
    window.registraTavola(3);
    return window.velocity.calcForecast(p);
  });
  ok('con una tavola sola non si azzarda una data', pochi.stato === 'pochi-dati', pochi);

  const previsione = await page.evaluate(()=>{
    window.seminaProgetto({ numTav: 10 });
    // Quattro tavole nelle ultime due settimane: due a settimana.
    [14, 10, 6, 2].forEach(g=> window.registraTavola(g));
    window.finisciTavole(4);
    return window.velocity.calcForecast(window.__p);
  });
  ok('con quattro tavole in due settimane il ritmo è due a settimana',
     previsione.stato === 'ok' && Math.abs(previsione.ritmo - 2) < 0.4, previsione);
  ok('e restano sei tavole da fare', previsione.remaining === 6, previsione);
  ok('la data prevista sta nel futuro, non nel passato',
     previsione.dataPrevista > Date.now(), previsione);
  ok('ed è scritta a parole, non in millisecondi',
     /\d+ (gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/.test(previsione.dataPrevistaLabel || ''),
     previsione.dataPrevistaLabel);

  // Le tavole vecchie non devono tirare giù il ritmo di adesso.
  const ripreso = await page.evaluate(()=>{
    window.seminaProgetto({ numTav: 10 });
    [200, 190, 180].forEach(g=> window.registraTavola(g));   // sei mesi fa
    [5, 2].forEach(g=> window.registraTavola(g));            // questa settimana
    window.finisciTavole(5);
    return window.velocity.calcForecast(window.__p);
  });
  ok('un progetto ripreso da poco mostra il ritmo di adesso, non la media di sei mesi',
     ripreso.stato === 'ok' && ripreso.ritmo >= 2, ripreso);

  const completo = await page.evaluate(()=>{
    window.seminaProgetto({ numTav: 3 });
    window.finisciTavole(3);
    return window.velocity.calcForecast(window.__p);
  });
  ok('e a lavoro finito non c\'è niente da prevedere', completo.stato === 'completo', completo);

  sezione('e i numeri arrivano davvero a schermo');
  // Fin qui si è provata la matematica: qui si controlla che quello che
  // calcola sia anche quello che leggi nella scheda del progetto.
  const schermo = await page.evaluate(()=>{
    window.seminaProgetto({ steps:{ moodboard:true, soggetto:true, personaggi:true },
                            dateEnd: window.dataFraGiorni(12) });
    window.finisciTavole(2);
    window.progress.updateProgress(window.__p);
    window.velocity.renderDeadline(window.__p);
    return {
      pct: document.getElementById('meta-pct').textContent,
      barra: document.getElementById('prog-fill').style.width,
      passi: document.getElementById('prog-lbl').textContent,
      fase: document.getElementById('meta-fase').textContent,
      giorni: document.getElementById('meta-days').textContent,
      countdown: document.getElementById('countdown-box').textContent.replace(/\s+/g,' '),
    };
  });
  // Tre passi su sette più due tavole su dieci: 5 su 17, cioè il 29%. Prima
  // il denominatore diceva 15 e la stessa scheda leggeva 33%.
  ok('la percentuale scritta è quella calcolata', schermo.pct === '29', schermo);
  ok('e la barra è lunga altrettanto', schermo.barra === '29%', schermo);
  ok('sotto c\'è il conto dei passi', /5 \/ 17/.test(schermo.passi), schermo);
  // Tre caselle su cinque in Sviluppo: si è ancora in Sviluppo. Prima a tre
  // passi la scheda annunciava già la Pre-produzione.
  ok('la fase è scritta a parole', schermo.fase === 'Sviluppo', schermo);
  ok('i giorni alla scadenza ci sono', /12gg/.test(schermo.giorni), schermo);
  // 12 giorni = una settimana e cinque giorni: il countdown lo scompone,
  // perche' "una settimana e cinque giorni" si capisce meglio di "12".
  ok('e il countdown li scompone in settimane e giorni',
     /12\s*giorni mancanti/.test(schermo.countdown) && /1\s*settimane/.test(schermo.countdown)
     && /5\s*giorni extra/.test(schermo.countdown), schermo);

  const scaduto = await page.evaluate(()=>{
    window.seminaProgetto({ dateEnd: window.dataFraGiorni(-4) });
    window.progress.updateProgress(window.__p);
    window.velocity.renderDeadline(window.__p);
    return {
      giorni: document.getElementById('meta-days').textContent,
      countdown: document.getElementById('countdown-box').textContent.replace(/\s+/g,' '),
      urgente: !!document.querySelector('.countdown-pill.urgent'),
    };
  });
  ok('una deadline passata lo dice, invece di mostrare un meno',
     /4gg scaduto/.test(scaduto.giorni), scaduto);
  ok('e lo dice anche il countdown', /giorni scaduto/.test(scaduto.countdown), scaduto);
  ok('con la pastiglia accesa di rosso', scaduto.urgente, scaduto);

  const senzaData = await page.evaluate(()=>{
    window.seminaProgetto({});
    window.progress.updateProgress(window.__p);
    window.velocity.renderDeadline(window.__p);
    return {
      nascosto: document.getElementById('meta-days-wrap').style.display,
      invito: document.getElementById('countdown-box').textContent,
    };
  });
  ok('senza scadenza la riga dei giorni sparisce', senzaData.nascosto === 'none', senzaData);
  ok('e il countdown invita a metterne una', /Imposta una deadline/.test(senzaData.invito), senzaData);

});
