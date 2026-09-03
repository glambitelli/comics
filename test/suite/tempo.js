// Il tempo al tavolo — un numero che non deve perdersi per anni
//
// Questa suite difende una cosa sola, e vale piu' di tutte le altre di questo
// file: le ore accumulate NON si perdono. Sono il genere di dato che non si
// puo' ricostruire — se sparisce un mese di sessioni, quel mese e' andato — e
// devono sopravvivere al cambio telefono, alla mancanza di rete e a due
// dispositivi che scrivono lo stesso giorno.
const { suite } = require('../motore.js');

module.exports = () => suite("Il tempo al tavolo — le ore non si perdono",
  { banco: '/test/banco/tempo.html' }, async ({ page, ok, sezione }) => {

  const pulisci = ()=> page.evaluate(()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    window.__scritture = [];
  });

  sezione('il cronometro parte, conta, e si mette in pausa');
  await pulisci();
  const partito = await page.evaluate(async ()=>{
    window.tempo.avvia();
    await new Promise(r=> setTimeout(r, 1200));
    return {
      acceso: window.tempo.acceso(),
      secondi: window.tempo.secondiCorrenti(),
      // Il cronometro acceso si scrive in tasca, e si scrive QUANDO e' partito
      // — non quanto e' passato: e' l'unico modo perche' il tempo continui a
      // scorrere mentre l'app e' chiusa.
      inTasca: JSON.parse(localStorage.getItem('inkflow_tempo_acceso') || 'null'),
    };
  });
  ok('parte', partito.acceso, partito);
  ok('e conta i secondi', partito.secondi >= 1, partito);
  ok('scrivendo in tasca QUANDO e\' partito, non quanto e\' passato',
     !!(partito.inTasca && typeof partito.inTasca.da === 'number'), partito);

  const fermo = await page.evaluate(async ()=>{
    window.tempo.pausa();
    const subito = window.tempo.secondiCorrenti();
    await new Promise(r=> setTimeout(r, 900));
    return { subito, dopo: window.tempo.secondiCorrenti(), inPausa: window.tempo.inPausa() };
  });
  ok('in pausa il tempo si ferma davvero', fermo.inPausa && fermo.dopo === fermo.subito, fermo);

  const ripreso = await page.evaluate(async ()=>{
    window.tempo.riprendi();
    const prima = window.tempo.secondiCorrenti();
    await new Promise(r=> setTimeout(r, 1200));
    return { prima, dopo: window.tempo.secondiCorrenti() };
  });
  ok('e riprendendo riparte da dov\'era, senza perdere niente',
     ripreso.dopo > ripreso.prima && ripreso.prima >= 1, ripreso);

  sezione('e chiudendo l\'app il tempo continua a scorrere');
  // Il caso vero: si avvia il cronometro, si mette via il telefono e si disegna
  // per un'ora. L'app non e' aperta, nessun intervallo sta girando — eppure
  // quell'ora deve esserci.
  const ripresa = await page.evaluate(async ()=>{
    // Si finge una sessione partita quaranta minuti fa e mai chiusa.
    const quaranta = Date.now() - 40*60*1000;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({ da: quaranta, accumulato: 0, inPausa: false }));
    window.tempo.riprendiSessione();
    return { acceso: window.tempo.acceso(), minuti: Math.round(window.tempo.secondiCorrenti()/60) };
  });
  ok('riaprendo l\'app la sessione riparte da sola', ripresa.acceso, ripresa);
  ok('coi minuti passati nel frattempo', ripresa.minuti === 40, ripresa);

  sezione('la sessione dimenticata non regala una notte di disegno');
  // Il cronometro acceso e lasciato li' fino al mattino: senza un tetto il
  // totale diventerebbe una bugia che non si puo' piu' togliere, perche' nessuno
  // sa quale pezzo buttare via.
  const notte = await page.evaluate(async ()=>{
    window.__scritture = [];
    const ieri = Date.now() - 14*3600*1000;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({ da: ieri, accumulato: 0, inPausa: false }));
    window.tempo.riprendiSessione();
    await new Promise(r=> setTimeout(r, 400));
    const w = (window.__scritture||[]).filter(x=> x.col === 'sessioni').pop();
    return {
      acceso: window.tempo.acceso(),
      segnati: w && w.data && w.data.secondi && w.data.secondi.__somma,
      inTasca: localStorage.getItem('inkflow_tempo_acceso'),
    };
  });
  ok('si chiude da sola', !notte.acceso, notte);
  ok('e segna otto ore, non quattordici', notte.segnati === 8*3600, notte);
  ok('senza lasciare il cronometro acceso in tasca', notte.inTasca === null, notte);

  sezione('fermando, il tempo va in archivio — SOMMATO, non sovrascritto');
  // E' il cuore di tutto. Ogni altra cosa nell'app scrive documenti interi e
  // chi scrive per ultimo vince: per un titolo va bene, per un contatore no.
  // Due telefoni che aggiungono mezz'ora ciascuno, scrivendo il totale, ne
  // perderebbero una — e sarebbe tempo davvero passato a disegnare, sparito.
  const messo = await page.evaluate(async ()=>{
    window.__scritture = [];
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({
      da: Date.now() - 25*60*1000, accumulato: 0, inPausa: false }));
    window.tempo.riprendiSessione();
    const secondi = await window.tempo.ferma();
    const w = (window.__scritture||[]).filter(x=> x.col === 'sessioni').pop();
    const oggi = window.tempo.giornoDi(Date.now());
    return {
      secondi,
      collezione: w && w.col,
      // Il documento e' IL GIORNO: una riga al giorno, non una per sessione.
      // Trecentosessantacinque righe l'anno, e il totale e' la loro somma.
      documento: w && w.id,
      oggi,
      // E il valore non e' un numero: e' una richiesta di somma.
      somma: w && w.data && w.data.secondi && w.data.secondi.__somma,
      sessioni: w && w.data && w.data.sessioni && w.data.sessioni.__somma,
      numeroSecco: w && typeof (w.data||{}).secondi === 'number',
    };
  });
  ok('la sessione dura quello che deve', messo.secondi === 1500, messo);
  ok('si scrive nella collezione "sessioni"', messo.collezione === 'sessioni', messo);
  ok('un documento per GIORNO', messo.documento === messo.oggi, messo);
  ok('e il tempo si SOMMA a quello che c\'era', messo.somma === 1500, messo);
  ok('non si scrive un totale che sovrascrive', !messo.numeroSecco, messo);
  ok('e si conta anche quante sessioni', messo.sessioni === 1, messo);

  // ── IL NUMERO NON SCENDE MAI, NEMMENO PER UN ISTANTE ──
  // E' successo davvero: cronometro a 4 secondi, la settimana diceva 17, stop e
  // tornava 13. I totali contavano gia' la sessione in corso, ma allo stop una
  // soglia minima la buttava via. Un contatore che scende davanti agli occhi
  // non e' piu' un contatore.
  sezione('premendo stop il totale non torna mai indietro');
  const salto = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    window.tempo.__seminaGiorni(new Map([[window.tempo.giornoDi(Date.now()), 13]]));
    window.tempo.avvia();
    // Quattro secondi: il caso esatto della segnalazione.
    const st = JSON.parse(localStorage.getItem('inkflow_tempo_acceso'));
    st.da = Date.now() - 4*1000;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify(st));
    window.tempo.riprendiSessione();
    const prima = window.tempo.secondiSettimana();
    await window.tempo.ferma();
    const dopo = window.tempo.secondiSettimana();
    localStorage.removeItem('inkflow_tempo_coda');
    return { prima, dopo };
  });
  ok('coi quattro secondi in corso la settimana dice 17', salto.prima === 17, salto);
  ok('e dopo lo stop dice ancora 17, non 13', salto.dopo === 17, salto);

  sezione('un tocco per sbaglio non sporca lo storico, una prova vera si');
  const brevissima = await page.evaluate(async ()=>{
    window.__scritture = [];
    window.tempo.avvia();
    await new Promise(r=> setTimeout(r, 300));
    const secondi = await window.tempo.ferma();
    return { secondi, scritte: (window.__scritture||[]).filter(x=> x.col === 'sessioni').length };
  });
  // Non per una soglia, ma perche' trecento millisecondi arrotondati ai
  // secondi fanno zero: non c'e' niente da segnare.
  ok('start e stop di fila non si registrano',
     brevissima.secondi === 0 && brevissima.scritte === 0, brevissima);

  // VENTI SECONDI DEVONO CONTARE. E' la prova che si fa tutti la prima volta:
  // si avvia, si aspetta un attimo, si preme stop e si va a vedere. Se quella
  // sessione sparisce, l'unica conclusione e' che il cronometro sia rotto.
  const venti = await page.evaluate(async ()=>{
    window.__scritture = [];
    window.tempo.__seminaGiorni(new Map());
    window.tempo.avvia();
    // Si sposta indietro l'istante di avvio invece di aspettare davvero venti
    // secondi: la prova deve durare un attimo, non mezzo minuto.
    const s = JSON.parse(localStorage.getItem('inkflow_tempo_acceso'));
    s.da = Date.now() - 20*1000;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify(s));
    window.tempo.riprendiSessione();
    const secondi = await window.tempo.ferma();
    return {
      secondi,
      scritte: (window.__scritture||[]).filter(x=> x.col === 'sessioni').length,
      totale: window.tempo.secondiTotali(),
      scritto: window.tempo.scriviBreve(secondi),
    };
  });
  ok('venti secondi si registrano', venti.secondi >= 19 && venti.scritte === 1, venti);
  ok('e finiscono subito nel totale, senza aspettare Firestore',
     venti.totale >= 19, venti);
  ok('e si leggono in secondi, non come "0 min"',
     /^\d+ sec$/.test(venti.scritto), venti);

  sezione('di ogni seduta si tiene l\'ora e la durata');
  // Per un anno si e' salvato solo il totale del giorno, e ogni sera si
  // buttavano via due cose che non si recuperano: a che ora hai disegnato e
  // quanto e' durata la singola seduta. Sono la materia prima di qualunque
  // domanda seria che ci si possa fare dopo, e la risposta esiste solo se si
  // comincia a registrarla PRIMA di volerla sapere.
  const seduta = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    window.__scritture = [];
    // Una seduta di mezz'ora cominciata alle 21 di ieri sera.
    const avvio = new Date(); avvio.setDate(avvio.getDate()-1); avvio.setHours(21, 0, 0, 0);
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({
      da: avvio.getTime(), accumulato: 30*60, inPausa: true }));
    window.tempo.riprendiSessione();
    await window.tempo.ferma();
    const w = (window.__scritture||[]).filter(x=> x.col === 'sessioni').pop();
    return {
      giorno: w && w.id,
      giornoAtteso: window.tempo.giornoDi(avvio.getTime()),
      dati: w && w.data,
      avvio: avvio.getTime(),
    };
  });
  ok('la seduta finisce nella riga del suo giorno',
     seduta.giorno === seduta.giornoAtteso, seduta);
  // La fascia oraria e' quella in cui la sessione e' PARTITA, anche se
  // sconfina nell'ora dopo: stessa scelta gia' fatta per la mezzanotte.
  ok('l\'ora del giorno si registra, nella fascia in cui e\' partita',
     seduta.dati && seduta.dati.ore && seduta.dati.ore['21'] &&
     seduta.dati.ore['21'].__somma === 1800, seduta);
  ok('e la durata della singola seduta pure',
     seduta.dati && seduta.dati.elenco && seduta.dati.elenco.__aggiungi &&
     seduta.dati.elenco.__aggiungi[0].sec === 1800 &&
     seduta.dati.elenco.__aggiungi[0].da === seduta.avvio, seduta);
  // Il totale del giorno continua a sommarsi come prima: quello che c'era non
  // si tocca, si aggiunge accanto.
  ok('e il totale del giorno resta quello di prima',
     seduta.dati && seduta.dati.secondi.__somma === 1800 &&
     seduta.dati.sessioni.__somma === 1, seduta);

  // ANCHE QUELLO CHE PASSA DALLA CODA tiene la sua ora: una seduta rifiutata e
  // rimandata ore dopo non deve finire nella fascia sbagliata.
  const dallaCoda = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    window.__scritture = [];
    window.__rifiuta = 'sessioni';
    const avvio = new Date(); avvio.setHours(7, 30, 0, 0);
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({
      da: avvio.getTime(), accumulato: 20*60, inPausa: true }));
    window.tempo.riprendiSessione();
    await window.tempo.ferma();          // rifiutata: finisce in coda
    window.__rifiuta = null;
    await window.tempo.svuotaCoda();     // e adesso passa
    const w = (window.__scritture||[]).filter(x=> x.col === 'sessioni').pop();
    localStorage.removeItem('inkflow_tempo_coda');
    return { ore: w && w.data && w.data.ore, avvio: avvio.getTime(),
             da: w && w.data && w.data.elenco && w.data.elenco.__aggiungi[0].da };
  });
  ok('e una seduta passata dalla coda tiene la sua ora',
     dallaCoda.ore && dallaCoda.ore['7'] && dallaCoda.ore['7'].__somma === 1200, dallaCoda);
  ok('e il suo istante d\'avvio', dallaCoda.da === dallaCoda.avvio, dallaCoda);

  sezione('e se il server dice di no, il tempo non sparisce lo stesso');
  // E' IL DIFETTO CHE NON SI VEDE. La scrittura viene rifiutata — una regola di
  // sicurezza, una collezione nuova che nessuno ha aperto — e prima finiva in
  // una riga di console: il tempo appena fatto restava a schermo un istante e
  // poi tornava indietro al primo aggiornamento da fuori, senza una parola.
  const rifiutata = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    window.tempo.__seminaGiorni(new Map());
    window.__scritture = [];
    window.__rifiuta = 'sessioni';          // il server rifiuta tutto
    window.tempo.avvia();
    const s = JSON.parse(localStorage.getItem('inkflow_tempo_acceso'));
    s.da = Date.now() - 30*1000;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify(s));
    window.tempo.riprendiSessione();
    await window.tempo.ferma();
    const dopoRifiuto = {
      totale: window.tempo.secondiTotali(),
      inCoda: window.tempo.daSincronizzare(),
      scritte: (window.__scritture||[]).length,
      // E deve sopravvivere all'app chiusa e riaperta: la coda sta in tasca.
      inTasca: !!localStorage.getItem('inkflow_tempo_coda'),
    };
    // Anche se adesso arriva un aggiornamento da Firestore che non sa niente
    // di quella sessione, il totale non deve scendere.
    window.tempo.__seminaGiorni(new Map());
    dopoRifiuto.dopoAggiornamento = window.tempo.secondiTotali();
    // E quando il server torna a dire di si', la coda si svuota.
    window.__rifiuta = null;
    const andate = await window.tempo.svuotaCoda();
    dopoRifiuto.andate = andate;
    dopoRifiuto.codaDopo = window.tempo.daSincronizzare();
    dopoRifiuto.scritteDopo = (window.__scritture||[]).filter(x=> x.col === 'sessioni').length;
    return dopoRifiuto;
  });
  ok('la scrittura rifiutata non finisce nel nulla', rifiutata.inCoda === 1, rifiutata);
  ok('il tempo resta contato nei totali', rifiutata.totale >= 29, rifiutata);
  ok('e non scende quando arriva un aggiornamento da fuori',
     rifiutata.dopoAggiornamento >= 29, rifiutata);
  ok('la coda sopravvive alla chiusura dell\'app', rifiutata.inTasca, rifiutata);
  ok('e appena il server accetta, parte davvero',
     rifiutata.andate === 1 && rifiutata.scritteDopo === 1, rifiutata);
  ok('e la coda si svuota', rifiutata.codaDopo === 0, rifiutata);

  sezione('il cronometro non puo\' essere spento in una schermata e acceso in un\'altra');
  // localStorage e' la verita': se in tasca c'e' una sessione, tutte le
  // schermate devono vederla, anche quelle che non l'hanno fatta partire.
  const verita = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_coda');
    await window.tempo.ferma();
    // Nessuno chiama riprendiSessione: la si mette in tasca e basta, com'e'
    // dopo un ricaricamento della pagina a cronometro acceso.
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({
      da: Date.now() - 45*1000, accumulato: 0, inPausa: false }));
    const acceso = window.tempo.acceso();
    const secondi = window.tempo.secondiCorrenti();
    // E "avvia" su una sessione gia' aperta non deve azzerarla.
    window.tempo.avvia();
    const dopoAvvia = window.tempo.secondiCorrenti();
    await window.tempo.ferma();
    localStorage.removeItem('inkflow_tempo_coda');
    return { acceso, secondi, dopoAvvia };
  });
  ok('una sessione in tasca la vedono tutti', verita.acceso, verita);
  ok('coi secondi giusti', verita.secondi >= 44, verita);
  ok('e riavviare non la azzera', verita.dopoAvvia >= 44, verita);

  sezione('i totali sanno leggersi: settimana, mese, sempre');
  const conti = await page.evaluate(()=>{
    const g = window.tempo.giornoDi;
    const oggi = new Date();
    const meno = n => { const d = new Date(oggi); d.setDate(d.getDate()-n); return d; };
    // Si semina a mano la mappa dei giorni, com'e' quando arriva da Firestore.
    const dentro = new Map();
    dentro.set(g(oggi.getTime()), 3600);           // un'ora oggi
    dentro.set(g(meno(400).getTime()), 7200);      // due ore l'anno scorso
    window.tempo.__seminaGiorni(dentro);
    return {
      settimana: window.tempo.secondiSettimana(),
      totale: window.tempo.secondiTotali(),
      // Il lunedi' e' il primo giorno: la settimana di chi lavora comincia li'.
      primoGiorno: window.tempo.inizioSettimana(new Date('2026-08-27T12:00:00')).getDay(),
    };
  });
  ok('la settimana conta solo i suoi giorni', conti.settimana === 3600, conti);
  ok('il totale li conta tutti', conti.totale === 10800, conti);
  ok('e la settimana comincia di lunedi\'', conti.primoGiorno === 1, conti);

  sezione('e i tempi si scrivono come si leggono');
  const scritture = await page.evaluate(()=>({
    breve20: window.tempo.scriviBreve(20),
    grandeSec: window.tempo.scriviGrande(35),
    breve45: window.tempo.scriviBreve(45*60),
    breve90: window.tempo.scriviBreve(90*60),
    breve120: window.tempo.scriviBreve(120*60),
    grandeMin: window.tempo.scriviGrande(40*60),
    grandePoche: window.tempo.scriviGrande(3.5*3600),
    grandeTante: window.tempo.scriviGrande(312.4*3600),
    corsaMin: window.tempo.scriviCorsa(65),
    corsaOre: window.tempo.scriviCorsa(3725),
  }));
  ok('sotto il minuto si dicono i secondi', scritture.breve20 === '20 sec', scritture);
  ok('e anche il numero grande', scritture.grandeSec.n === '35' && scritture.grandeSec.u === 'sec', scritture);
  ok('sotto l\'ora si dicono i minuti', scritture.breve45 === '45 min', scritture);
  ok('sopra, le ore e i minuti', scritture.breve90 === '1h 30', scritture);
  ok('e le ore tonde restano tonde', scritture.breve120 === '2h', scritture);
  ok('il numero grande sotto l\'ora sono minuti',
     scritture.grandeMin.n === 40 && scritture.grandeMin.u === 'min', scritture);
  ok('poche ore hanno il decimale', scritture.grandePoche.n === '3,5', scritture);
  // Trecentododici ore e ventiquattro minuti si dicono "312 ore": il decimale,
  // a quel punto, e' una precisione che non interessa a nessuno.
  ok('tante ore no', scritture.grandeTante.n === '312', scritture);
  ok('il cronometro acceso si legge come un cronometro',
     scritture.corsaMin === '01:05' && scritture.corsaOre === '1:02:05', scritture);

  sezione('e la scheda in Statistiche mette la settimana davanti');
  // Il totale dice chi sei diventato e lo dice una volta sola; la settimana
  // dice come stai andando adesso, ed e' l'unica delle due che cambia tornando
  // qui domani. Ma il totale resta in vista, perche' e' il numero che non
  // scende mai e sta li' per le settimane storte.
  const scheda = await page.evaluate(async ()=>{
    const g = window.tempo.giornoDi;
    const oggi = new Date();
    const meno = n => { const d = new Date(oggi); d.setDate(d.getDate()-n); return d; };
    const dentro = new Map();
    dentro.set(g(oggi.getTime()), 2*3600);
    dentro.set(g(meno(300).getTime()), 100*3600);
    window.tempo.__seminaGiorni(dentro);
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 400));
    const box = document.getElementById('stats-tempo');
    return {
      grande: (box.querySelector('.tempo-grande b')||{}).textContent,
      sotto: (box.querySelector('.tempo-sotto-grande')||{}).textContent,
      righe: Array.from(box.querySelectorAll('.tempo-righe span')).map(x=> x.textContent),
      totale: Array.from(box.querySelectorAll('.tempo-righe b')).map(x=> x.textContent),
      // Nessun obiettivo, nessuna percentuale, nessuna barra verso le diecimila
      // ore: dopo un mese saresti allo 0,3% e il grafico direbbe "non hai fatto
      // niente", che e' falso.
      barre: box.querySelectorAll('progress, .barra, [role="progressbar"]').length,
      percentuali: /%/.test(box.textContent),
      obiettivo: /obiettiv|mancano|traguard/i.test(box.textContent),
    };
  });
  ok('il numero grande e\' la settimana', scheda.grande === '2', scheda);
  ok('e lo dice', /settimana/i.test(scheda.sotto||''), scheda);
  ok('il totale di sempre resta in vista, in piccolo',
     scheda.righe.some(x=> /da sempre/i.test(x)) && scheda.totale.includes('102h'), scheda);
  ok('nessuna barra di completamento', scheda.barre === 0, scheda);
  ok('nessuna percentuale', !scheda.percentuali, scheda);
  ok('e nessun obiettivo da mancare', !scheda.obiettivo, scheda);

  sezione('e a zero non ti rimprovera');
  const vuota = await page.evaluate(async ()=>{
    window.tempo.__seminaGiorni(new Map());
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 300));
    const box = document.getElementById('stats-tempo');
    return { zeri: /\b0\b/.test(box.textContent), testo: box.textContent.trim() };
  });
  ok('non scrive "0 ore" tre volte', !vuota.zeri, vuota);
  ok('dice invece dove sta il cronometro', /home/i.test(vuota.testo), vuota);

  sezione('e la sessione in corso conta GIA\', senza aspettare lo stop');
  // Il difetto: si disegnava mezz'ora, si andava a vedere le Statistiche e non
  // c'era niente — le ore entravano nei conti soltanto premendo stop. L'unica
  // conclusione ragionevole era che il cronometro non stesse funzionando.
  const inCorso = await page.evaluate(async ()=>{
    window.tempo.__seminaGiorni(new Map());
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify({
      da: Date.now() - 30*60*1000, accumulato: 0, inPausa: false }));
    window.tempo.riprendiSessione();
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 400));
    const box = document.getElementById('stats-tempo');
    return {
      settimana: Math.round(window.tempo.secondiSettimana()/60),
      totale: Math.round(window.tempo.secondiTotali()/60),
      // E la scheda lo dice, invece di far sembrare che il numero sia fermo.
      dice: /sta contando/i.test(box.textContent),
      // Non e' piu' la scheda vuota: mezz'ora e' gia' qualcosa.
      vuota: /cronometro sta in cima/i.test(box.textContent),
    };
  });
  ok('la mezz\'ora in corso e\' gia\' nella settimana', inCorso.settimana === 30, inCorso);
  ok('e nel totale di sempre', inCorso.totale === 30, inCorso);
  ok('la scheda dice che sta contando', inCorso.dice, inCorso);
  ok('e non e\' piu\' quella vuota', !inCorso.vuota, inCorso);

  // RIAVVIARE IL CRONOMETRO MENTRE LE STATISTICHE SONO A SCHERMO. E' il caso
  // che si prova per primo: si guardano i secondi fermi, si riparte, e da li'
  // in poi il numero deve muoversi da solo. Se resta fermo, la conclusione e'
  // che il cronometro non riparta affatto.
  const riacceso = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();   // e cosi' si spegne davvero
    const g = window.tempo.giornoDi;
    const dentro = new Map();
    dentro.set(g(Date.now()), 13);            // i tredici secondi gia' segnati
    window.tempo.__seminaGiorni(dentro);
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 300));
    const box = document.getElementById('stats-tempo');
    const prima = box.textContent;
    // E adesso si riparte, con la scheda gia' a schermo.
    window.tempo.avvia();
    await new Promise(r=> setTimeout(r, 1400));
    const dopo = box.textContent;
    const n = s => parseInt((s.match(/(\d+)\s*sec/)||[])[1] || '0', 10);
    window.tempo.__seminaGiorni(new Map());
    localStorage.removeItem('inkflow_tempo_acceso');
    return { prima, dopo, nPrima: n(prima), nDopo: n(dopo),
             dice: /sta contando/i.test(dopo) };
  });
  ok('riavviando, la scheda si accorge che sta contando', riacceso.dice, riacceso);
  ok('e il numero riparte a salire da solo', riacceso.nDopo > riacceso.nPrima, riacceso);

  sezione('buttare via non e\' fermare, e azzerare tutto e\' un\'altra cosa ancora');
  // BUTTARE VIA non mette in archivio: e' il cronometro dimenticato acceso a
  // cena, tempo che non e' stato passato a disegnare. Fermare, invece, salva
  // sempre — sono due gesti diversi e non devono somigliarsi.
  const buttata = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    window.tempo.__seminaGiorni(new Map([[window.tempo.giornoDi(Date.now()), 600]]));
    window.__scritture = [];
    window.tempo.avvia();
    const st = JSON.parse(localStorage.getItem('inkflow_tempo_acceso'));
    st.da = Date.now() - 90*1000;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify(st));
    window.tempo.riprendiSessione();
    const conLaSessione = window.tempo.secondiTotali();
    const persi = window.tempo.scarta();
    return {
      persi, conLaSessione,
      dopo: window.tempo.secondiTotali(),
      acceso: window.tempo.acceso(),
      inTasca: !!localStorage.getItem('inkflow_tempo_acceso'),
      scritte: (window.__scritture||[]).filter(x=> x.col === 'sessioni').length,
      inCoda: window.tempo.daSincronizzare(),
    };
  });
  ok('butta via i minuti che stavano correndo', buttata.persi >= 89, buttata);
  ok('il cronometro si spegne', !buttata.acceso && !buttata.inTasca, buttata);
  ok('e non finiscono in archivio', buttata.scritte === 0 && buttata.inCoda === 0, buttata);
  // Quello che era gia' archiviato non lo tocca: butta via SOLO la corsa.
  ok('ma quello che era gia\' archiviato resta', buttata.dopo === 600, buttata);
  ok('ed era davvero contato un attimo prima', buttata.conLaSessione >= 689, buttata);

  // AZZERARE TUTTO cancella l'archivio, riga per riga. E' l'unica cosa in tutta
  // l'app che fa scendere quel numero, e sta dietro una conferma.
  const azzerato = await page.evaluate(async ()=>{
    const g = window.tempo.giornoDi;
    const oggi = new Date();
    const meno = n => { const d = new Date(oggi); d.setDate(d.getDate()-n); return d; };
    window.__archivio = { sessioni: {} };
    window.__archivio.sessioni[g(oggi.getTime())] = { secondi: 600 };
    window.__archivio.sessioni[g(meno(9).getTime())] = { secondi: 3600 };
    window.__cancellati = [];
    window.tempo.__seminaGiorni(new Map([
      [g(oggi.getTime()), 600], [g(meno(9).getTime()), 3600],
    ]));
    // E anche una sessione in corso e una in coda: devono sparire tutte e due.
    window.tempo.avvia();
    localStorage.setItem('inkflow_tempo_coda', JSON.stringify([{ giorno: g(oggi.getTime()), secondi: 45 }]));
    const prima = window.tempo.secondiTotali();
    const quante = await window.tempo.azzeraTutto();
    return {
      prima, quante,
      dopo: window.tempo.secondiTotali(),
      acceso: window.tempo.acceso(),
      inCoda: window.tempo.daSincronizzare(),
      cancellati: (window.__cancellati||[]).filter(x=> x.col === 'sessioni').length,
    };
  });
  ok('prima c\'era un archivio pieno', azzerato.prima >= 4200, azzerato);
  ok('le righe dei giorni si cancellano davvero', azzerato.cancellati === 2, azzerato);
  ok('il totale torna a zero', azzerato.dopo === 0, azzerato);
  ok('il cronometro in corso si spegne', !azzerato.acceso, azzerato);
  ok('e la coda si svuota', azzerato.inCoda === 0, azzerato);

  sezione('e la scheda non racconta un cronometro che non c\'e\'');
  const stati = await page.evaluate(async ()=>{
    const box = ()=> document.getElementById('stats-tempo');
    const st = await import('/js/stats.js');
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    window.tempo.__seminaGiorni(new Map([[window.tempo.giornoDi(Date.now()), 600]]));

    window.tempo.avvia();
    st.renderStats();
    await new Promise(r=> setTimeout(r, 250));
    const acceso = box().textContent;

    window.tempo.pausa();
    st.renderStats();
    await new Promise(r=> setTimeout(r, 250));
    const fermo = box().textContent;

    // E con qualcosa che il server non ha preso, lo dice.
    window.__rifiuta = 'sessioni';
    const s = JSON.parse(localStorage.getItem('inkflow_tempo_acceso'));
    s.inPausa = false; s.da = Date.now() - 30*1000; s.accumulato = 0;
    localStorage.setItem('inkflow_tempo_acceso', JSON.stringify(s));
    window.tempo.riprendiSessione();
    await window.tempo.ferma();
    // Il server continua a dire di no anche mentre si guarda la scheda: se lo
    // lasciassimo accettare, la coda si svuoterebbe da sola prima del disegno
    // — che e' quello che deve succedere, ma non e' quello che si prova qui.
    st.renderStats();
    await new Promise(r=> setTimeout(r, 250));
    const daSalvare = box().textContent;
    window.__rifiuta = null;

    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    return { acceso, fermo, daSalvare };
  });
  ok('acceso dice che sta contando', /sta contando/i.test(stati.acceso), stati);
  ok('in pausa non lo dice piu\'', !/sta contando/i.test(stati.fermo), stati);
  ok('e dice invece che e\' in pausa', /in pausa/i.test(stati.fermo), stati);
  ok('e quello che il server non ha preso si vede',
     /da salvare/i.test(stati.daSalvare), stati);

  sezione('le otto settimane si leggono come un ritmo');
  const barre = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_tempo_acceso');
    localStorage.removeItem('inkflow_tempo_coda');
    window.tempo.riprendiSessione();
    const g = window.tempo.giornoDi;
    const oggi = new Date();
    const meno = n => { const d = new Date(oggi); d.setDate(d.getDate()-n); return d; };
    const dentro = new Map();
    dentro.set(g(oggi.getTime()), 3600);          // questa settimana: un'ora
    dentro.set(g(meno(10).getTime()), 4*3600);    // due settimane fa: quattro
    dentro.set(g(meno(45).getTime()), 2*3600);    // sette settimane fa: due
    window.tempo.__seminaGiorni(dentro);
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 300));
    const box = document.getElementById('stats-tempo');
    const b = Array.from(box.querySelectorAll('.tempo-barra span'));
    return {
      quante: b.length,
      // Le altezze sono in proporzione alla settimana piu' alta, non a un
      // obiettivo: la piu' alta e' piena, le altre in scala.
      altezze: b.map(x=> x.style.height),
      // Nemmeno una settimana a zero sparisce del tutto: una colonna che non
      // c'e' sembra un buco nel grafico, non una settimana senza disegno.
      nessunaVuota: b.every(x=> parseFloat(x.style.height) > 0),
      // L'ultima e' quella in corso, ed e' segnata come tale.
      ultimaInCorso: box.querySelectorAll('.tempo-barra.ora').length === 1,
      migliore: /nella migliore/.test(box.textContent),
    };
  });
  ok('ci sono otto settimane', barre.quante === 8, barre);
  ok('la migliore riempie la colonna', barre.altezze.includes('100%'), barre);
  ok('nessuna settimana sparisce del tutto', barre.nessunaVuota, barre);
  ok('e l\'ultima e\' segnata come quella in corso', barre.ultimaInCorso, barre);
  ok('col riferimento della settimana migliore', barre.migliore, barre);

  sezione('e le ore colorano la mappa dell\'anno');
  // Senza, un giorno passato a disegnare senza finire niente restava bianco:
  // la mappa diceva "non hai fatto niente" proprio nei giorni di lavoro vero.
  const mappa = await page.evaluate(async ()=>{
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 300));
    const piede = document.getElementById('stats-heatmap-legend');
    const attivi = (piede.textContent.match(/(\d+) giorni attivi/)||[])[1];
    return { attivi: parseInt(attivi||'0',10), didascalia: piede.textContent };
  });
  ok('i giorni con ore risultano attivi', mappa.attivi >= 3, mappa);
  ok('e la didascalia lo dice', /ore al tavolo/i.test(mappa.didascalia), mappa);

  // MEZZ'ORA NON E' ZERO. Arrotondando alle ore, venti minuti diventavano
  // niente e il quadrato restava bianco: la mappa perdeva tutte le sedute
  // corte, che sono la maggior parte.
  const corta = await page.evaluate(async ()=>{
    const g = window.tempo.giornoDi;
    const oggi = new Date();
    const meno = n => { const d = new Date(oggi); d.setDate(d.getDate()-n); return d; };
    const dentro = new Map();
    dentro.set(g(meno(2).getTime()), 20*60);   // venti minuti
    dentro.set(g(meno(3).getTime()), 90);      // un minuto e mezzo
    window.tempo.__seminaGiorni(dentro);
    const st = await import('/js/stats.js');
    st.renderStats();
    await new Promise(r=> setTimeout(r, 300));
    const piede = document.getElementById('stats-heatmap-legend');
    const attivi = (piede.textContent.match(/(\d+) giorni attivi/)||[])[1];
    // I quadrati non devono essere quelli scuri delle giornate piene: un
    // minuto e mezzo accende il giorno, non lo colora come otto ore.
    const scuri = document.querySelectorAll('#stats-heatmap rect[fill="#c8930f"]').length;
    return { attivi: parseInt(attivi||'0',10), scuri };
  });
  ok('venti minuti accendono comunque il giorno', corta.attivi >= 2, corta);
  ok('e un minuto e mezzo pure', corta.attivi >= 2, corta);
  ok('ma senza colorarli come una giornata piena', corta.scuri === 0, corta);
});