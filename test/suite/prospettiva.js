// Prospettiva — il righello per leggere dove cade l'orizzonte
//
// PERCHE' ESISTE QUESTA SUITE. Lo strumento risponde a UNA domanda — a che
// altezza della vignetta sta la linea dell'orizzonte — e quella risposta e' un
// numero. Un numero sbagliato non si vede: lo schema resta bello, le linee
// convergono, e chi studia si porta a casa una conclusione falsa sul lavoro di
// Otomo. Quindi la geometria si prova sui conti, non guardando le figure.
const { suite } = require('../motore.js');

module.exports = () => suite("Prospettiva — il righello per leggere l'orizzonte",
  { banco: '/test/banco/lettore.html' }, async ({ page, ok, sezione }) => {

  // Un'immagine vera, montata a mano: lo strumento si aggancia a un <img> e
  // misura tutto su quello, quindi senza un'immagine a schermo non c'e' niente
  // da provare.
  await page.evaluate(async ()=>{
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,900,1200);
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#141414';
    const im = document.createElement('img');
    im.src = c.toDataURL('image/png');
    im.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
    wrap.appendChild(im); document.body.appendChild(wrap);
    await im.decode();
    window.__img = im;
    window.P = await import('/js/prospettiva.js');
  });

  sezione('due rette si incontrano dove devono');
  // Il conto sta sotto tutto il resto: se sbaglia qui, sbaglia l'orizzonte, e
  // sbagliare l'orizzonte e' l'unico errore che questo strumento non puo'
  // permettersi.
  const conti = await page.evaluate(()=>{
    const P = window.P;
    // Due diagonali del quadrato unitario: si incrociano esattamente al centro.
    const centro = P.incrocio({a:{x:0,y:0},b:{x:1,y:1}}, {a:{x:0,y:1},b:{x:1,y:0}});
    // Due linee che convergono FUORI a destra: dal bordo sinistro, una sale e
    // una scende, e si incontrano a x=2 (una larghezza oltre il bordo).
    const fuori = P.incrocio({a:{x:0,y:0.3},b:{x:1,y:0.4}}, {a:{x:0,y:0.7},b:{x:1,y:0.6}});
    // Due parallele non si incontrano da nessuna parte.
    const mai = P.incrocio({a:{x:0,y:0.2},b:{x:1,y:0.4}}, {a:{x:0,y:0.6},b:{x:1,y:0.8}});
    // E due quasi-parallele: si incontrerebbero a cinquanta schermi di
    // distanza, cioe' da nessuna parte per qualunque uso umano.
    const lontano = P.incrocio({a:{x:0,y:0.2},b:{x:1,y:0.4}}, {a:{x:0,y:0.6},b:{x:1,y:0.7999}});
    return { centro, fuori, mai, lontano };
  });
  ok('due diagonali si incrociano al centro',
     Math.abs(conti.centro.x - 0.5) < 1e-6 && Math.abs(conti.centro.y - 0.5) < 1e-6, conti.centro);
  ok('e una fuga fuori dal bordo cade dove deve',
     Math.abs(conti.fuori.x - 2) < 1e-6 && Math.abs(conti.fuori.y - 0.5) < 1e-6, conti.fuori);
  ok('due parallele non danno nessuna fuga', conti.mai === null, conti.mai);
  ok('e nemmeno due quasi-parallele, che sarebbero una fuga finta',
     conti.lontano === null, conti.lontano);

  sezione('l\'orizzonte, e la cassa in cui finisce');
  // IL NUMERO E' DIVENTATO UNA CASSA, il 18 settembre 2026. Per tre giorni a
  // schermo c'e' stato scritto "HL 34%" e Giovanni ha ripetuto che non gli
  // diceva niente: aveva ragione, e non perche' il numero fosse sbagliato.
  // Una percentuale NON SI SOMMA CON NIENTE, e la domanda per cui si
  // raccolgono questi studi non e' "quanto faceva" ma "quante volte
  // l'orizzonte era fuori dalla vignetta". Il numero resta sotto, per
  // ricalcolare; quello che si legge e si conta e' la cassa.
  const lettura = await page.evaluate(()=>{
    const P = window.P;
    const q = (fuochi, riq)=> P.altezzaOrizzonte(P.orizzonteDa(fuochi), riq);
    const cassa = (fuochi, riq)=> P.cassaOrizzonte(q(fuochi, riq));
    const f1 = [{ x:0.5, y:0.2 }];
    const o1 = P.orizzonteDa(f1);
    // Due fughe ad altezze diverse: l'orizzonte le unisce ed e' inclinato.
    const f2 = [{ x:-0.5, y:0.3 }, { x:1.5, y:0.5 }];
    const o2 = P.orizzonteDa(f2);
    return {
      orizzontale: Math.abs(o1.a.y - o1.b.y) < 1e-9,
      inclinato: Math.abs(o2.a.y - o2.b.y) > 0.01,
      alto:    cassa(f1),
      centro:  cassa([{ x:0.5, y:0.5 }]),
      basso:   cassa([{ x:0.5, y:0.8 }]),
      sopra:   cassa([{ x:0.5, y:-0.3 }]),
      sotto:   cassa([{ x:0.5, y:1.2 }]),
      // L'altezza grezza resta, sotto i tre campi: e' da li' che si
      // ricalcolera' qualunque misura inventata dopo.
      numero:  q(f1),
      // E si misura al CENTRO della vignetta: con l'orizzonte inclinato
      // l'altezza su un bordo direbbe una cosa e sull'altro un'altra. Le due
      // fughe stanno al 30% e al 50%, a distanza uguale dal centro.
      alCentro: q(f2),
    };
  });
  ok('con una fuga sola l\'orizzonte e\' orizzontale', lettura.orizzontale, lettura);
  ok('con due si inclina, invece di restare dritto', lettura.inclinato, lettura);
  ok('e la sua altezza si legge al centro, non su un bordo',
     lettura.alCentro === 40, lettura.alCentro);
  // LE CINQUE CASSE. Sono quelle che si contano, ed e' il motivo per cui
  // esistono: cinquanta percentuali sciolte non rispondono a "quante volte",
  // cinquanta casse si'.
  ok('l\'orizzonte in cima cade nel terzo alto', lettura.alto === 'terzo alto', lettura);
  ok('a meta\' nel terzo centrale', lettura.centro === 'terzo centrale', lettura);
  ok('in fondo nel terzo basso', lettura.basso === 'terzo basso', lettura);
  // IL CASO DI OTOMO, e la domanda da cui e' nato tutto: quante volte
  // l'orizzonte e' proprio fuori dall'inquadratura.
  ok('e fuori dalla vignetta lo dice, sopra',
     lettura.sopra === 'sopra la vignetta', lettura);
  ok('e sotto', lettura.sotto === 'sotto la vignetta', lettura);
  // NIENTE AGGETTIVI, come il primo giorno: "terzo alto" e' dove cade, non un
  // giudizio su quanto sia ardita l'inquadratura.
  ok('senza aggettivi appiccicati sopra',
     !/altissim|a terra|ardit|estrem/i.test(Object.values(lettura).join(' ')), lettura);
  ok('e sotto le casse il numero grezzo resta, per ricalcolare',
     lettura.numero === 20, lettura.numero);

  sezione('quanti punti di fuga, e qual e\' la verticale');
  // IL CAMPO PRINCIPALE DEL CATALOGO: una vignetta e' a 1, 2 o 3 punti, e non
  // e' un'opinione — e' quante famiglie di parallele convergono.
  //
  // CON TRE FUGHE bisogna sapere quale e' la verticale, perche' l'orizzonte
  // passa per le altre due. Prima si prendevano le prime due TRACCIATE:
  // bastava cominciare dai verticali perche' la riga d'oro unisse una fuga
  // orizzontale e una verticale, cioe' niente. L'ordine in cui uno traccia e'
  // un'abitudine, non un dato.
  const punti = await page.evaluate(()=>{
    const P = window.P;
    // Una tavola a tre punti: due fughe sull'orizzonte, lontanissime ai lati,
    // e la terza — quella dei verticali — molto in alto.
    const tre = [{ x:-3.2, y:0.42 }, { x:4.1, y:0.46 }, { x:0.4, y:-6.5 }];
    // Le stesse tre, ma tracciate cominciando dai verticali: il risultato non
    // puo' cambiare.
    const treAlContrario = [tre[2], tre[0], tre[1]];
    return {
      uno:  P.classifica([{ x:0.5, y:0.3 }]).punti,
      due:  P.classifica([{ x:-1, y:0.4 }, { x:2, y:0.4 }]).punti,
      tre:  P.classifica(tre).punti,
      verticale: P.classifica(tre).verticale,
      verticaleAlContrario: P.classifica(treAlContrario).verticale,
      // E l'orizzonte deve passare per le due laterali, non per la verticale:
      // se ci passasse, l'altezza schizzerebbe fuori da qualunque vignetta.
      altezza: P.altezzaOrizzonte(P.orizzonteDa(tre), { x:0, y:0, w:1, h:1 }),
      altezzaAlContrario: P.altezzaOrizzonte(P.orizzonteDa(treAlContrario), { x:0, y:0, w:1, h:1 }),
      nessuna: P.classifica([]).punti,
      // DUE FAMIGLIE, MA UNA E' QUELLA DEI VERTICALI: succede tracciando gli
      // spigoli in piedi di un palazzo e quelli in profondita', saltando la
      // seconda famiglia orizzontale. Prima l'orizzonte veniva tirato fra le
      // due comunque, e usciva una riga d'oro quasi verticale con
      // "inclinazione 90°" sotto — un dato falso, che in un archivio da
      // contare e' peggio di un dato mancante.
      storta: P.classifica([{ x:0.48, y:0.45 }, { x:0.52, y:-7.0 }]),
      storteIncl: P.inclinazioneDa(P.orizzonteDa([{ x:0.48, y:0.45 }, { x:0.52, y:-7.0 }])),
      storteAltezza: P.altezzaOrizzonte(
        P.orizzonteDa([{ x:0.48, y:0.45 }, { x:0.52, y:-7.0 }]), { x:0, y:0, w:1, h:1 }),
    };
  });
  ok('una famiglia sola: un punto', punti.uno === 1, punti);
  ok('due famiglie: due punti', punti.due === 2, punti);
  ok('tre famiglie: tre punti', punti.tre === 3, punti);
  ok('e la verticale e\' riconosciuta fra le tre',
     punti.verticale && Math.abs(punti.verticale.y + 6.5) < 1e-9, punti.verticale);
  // LA PARTE CHE CONTA: la geometria decide, non l'ordine delle dita.
  ok('anche tracciando i verticali per primi, la verticale resta quella',
     punti.verticaleAlContrario && Math.abs(punti.verticaleAlContrario.y + 6.5) < 1e-9,
     punti.verticaleAlContrario);
  ok('e l\'orizzonte passa per le altre due, in tutti e due i casi',
     punti.altezza === punti.altezzaAlContrario && punti.altezza > 30 && punti.altezza < 60,
     punti);
  ok('senza fughe non ci sono punti', punti.nessuna === 0, punti);
  ok('due famiglie di cui una verticale restano due punti',
     punti.storta.punti === 2, punti.storta);
  ok('ma la verticale non fa da orizzonte',
     punti.storta.verticale && punti.storta.verticale.y === -7
     && punti.storta.orizzontali.length === 1, punti.storta);
  // Il difetto in una riga: l'orizzonte usciva verticale.
  ok('e l\'orizzonte resta in piano invece di rizzarsi a 90°',
     punti.storteIncl === 0, punti.storteIncl);
  ok('con l\'altezza presa dalla fuga laterale, non da quella verticale',
     punti.storteAltezza === 45, punti.storteAltezza);

  sezione('e di quanto e\' storto l\'orizzonte');
  // IL TERZO CAMPO. Una tavola piena di orizzonti storti e' un autore che
  // decide una cosa precisa, e per contarlo serve un numero col segno.
  const storto = await page.evaluate(()=>{
    const P = window.P;
    return {
      unaSola: P.inclinazioneDa(P.orizzonteDa([{ x:0.5, y:0.4 }])),
      piano:   P.inclinazioneDa(P.orizzonteDa([{ x:-1, y:0.4 }, { x:2, y:0.4 }])),
      // Due fughe: una piu' in basso dell'altra di un decimo, a distanza uno.
      giu:     P.inclinazioneDa(P.orizzonteDa([{ x:0, y:0.4 }, { x:1, y:0.5 }])),
      su:      P.inclinazioneDa(P.orizzonteDa([{ x:0, y:0.5 }, { x:1, y:0.4 }])),
      // La riga non ha un verso: le stesse due fughe, nominate al contrario,
      // sono la stessa inclinazione e non il suo supplementare.
      giuAlContrario: P.inclinazioneDa(P.orizzonteDa([{ x:1, y:0.5 }, { x:0, y:0.4 }])),
      niente:  P.inclinazioneDa(null),
    };
  });
  ok('con una fuga sola e\' zero per costruzione', storto.unaSola === 0, storto);
  ok('e due fughe alla stessa altezza danno zero', storto.piano === 0, storto);
  ok('che scende a destra ha segno positivo', storto.giu === 6, storto);
  ok('e che sale a destra, negativo', storto.su === -6, storto);
  ok('nominare le fughe al contrario non cambia l\'inclinazione',
     storto.giuAlContrario === storto.giu, storto);
  ok('e senza orizzonte non si rompe', storto.niente === 0, storto);

  sezione('e la misura e\' sulla VIGNETTA, non sulla pagina');
  // E' la correzione piu' importante dopo la prima prova sul campo. Una pagina
  // di manga sono sei vignette: "orizzonte al 23% della pagina" non risponde
  // alla domanda, che riguarda la singola inquadratura. Stessa fuga, stessa
  // tavola, due vignette diverse: le due letture devono essere diverse, e
  // ognuna vera per la sua.
  const relativo = await page.evaluate(()=>{
    const P = window.P;
    const f = [{ x:0.5, y:0.25 }];            // la fuga sta al 25% della PAGINA
    const o = P.orizzonteDa(f);
    const leggi = riq=> ({ n: P.altezzaOrizzonte(o, riq),
                           cassa: P.cassaOrizzonte(P.altezzaOrizzonte(o, riq)) });
    return {
      pagina: leggi({ x:0, y:0, w:1, h:1 }),
      // Vignetta in cima alla pagina, alta un terzo: quel 25% della pagina,
      // dentro di lei, e' molto piu' in basso.
      alta:   leggi({ x:0, y:0.05, w:1, h:0.30 }),
      // Vignetta a meta' pagina: la stessa fuga le cade SOPRA.
      bassa:  leggi({ x:0, y:0.40, w:1, h:0.30 }),
    };
  });
  ok('sulla pagina intera cade nel terzo alto',
     relativo.pagina.n === 25 && relativo.pagina.cassa === 'terzo alto', relativo);
  ok('ma dentro una vignetta in cima finisce nel terzo basso',
     relativo.alta.n === 67 && relativo.alta.cassa === 'terzo basso', relativo);
  ok('e per una vignetta di meta\' pagina cade proprio fuori, sopra',
     relativo.bassa.cassa === 'sopra la vignetta', relativo);

  sezione('le linee si consumano a coppie: due linee, una fuga');
  const coppie = await page.evaluate(()=>{
    const P = window.P;
    const l = (y1, y2)=> ({ a:{x:0,y:y1}, b:{x:1,y:y2} });
    return {
      una: P.fuochiDa([l(0.3,0.4)]).length,
      due: P.fuochiDa([l(0.3,0.4), l(0.7,0.6)]).length,
      tre: P.fuochiDa([l(0.3,0.4), l(0.7,0.6), l(0.2,0.1)]).length,
      quattro: P.fuochiDa([l(0.3,0.4), l(0.7,0.6), l(0.2,0.1), l(0.9,0.95)]).length,
    };
  });
  ok('una linea sola non fa una fuga', coppie.una === 0, coppie);
  ok('due linee si', coppie.due === 1, coppie);
  // La terza linea aspetta la quarta: e' la regola che permette di studiare
  // una tavola a due fughe senza aggiungere nessun comando.
  ok('la terza aspetta la quarta', coppie.tre === 1, coppie);
  ok('e con quattro le fughe sono due', coppie.quattro === 2, coppie);

  sezione('a schermo, sopra la tavola vera');
  const schermo = await page.evaluate(async ()=>{
    const P = window.P;
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:1 });   // tutta l'immagine
    P.__perLeProveTraccia({ a:{x:0.05,y:0.30}, b:{x:0.95,y:0.38} });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.70}, b:{x:0.95,y:0.62} });
    await new Promise(r=> setTimeout(r, 60));
    const ov = document.getElementById('prospettiva');
    // Il ritaglio si misura sul TAVOLO, non sull'immagine nella pagina: da
    // quando la vignetta viene portata su un tavolo suo, e' quello il posto in
    // cui sta.
    const r = ov.querySelector('.prosp-tavolo').getBoundingClientRect();
    const clip = ov.querySelector('.prosp-clip-rect');
    return {
      aperto: P.prospettivaAperta(),
      lettura: ov.querySelector('.prosp-oriz').textContent,
      campoPunti: ov.querySelector('.prosp-quanti').textContent,
      inclinazione: ov.querySelector('.prosp-incl').textContent,
      targaVisibile: !ov.querySelector('.prosp-targa').hidden,
      raggi: ov.querySelectorAll('.prosp-fascio line').length,
      punti: ov.querySelectorAll('.prosp-punti circle').length,
      orizzonteTagliato: ov.querySelector('.prosp-orizzonte').getAttribute('clip-path'),
      fascioTagliato: ov.querySelector('.prosp-fascio').getAttribute('clip-path'),
      clipSuImmagine: Math.abs(parseFloat(clip.getAttribute('height')) - r.height) < 1.5
                   && Math.abs(parseFloat(clip.getAttribute('y')) - r.top) < 1.5,
      // Ogni tratto e' disegnato due volte: l'ombra scura sotto e il colore
      // sopra. Senza, su una retinatura nera il magenta sparisce.
      trattiDoppi: ov.querySelectorAll('.prosp-tratti line').length,
    };
  });
  ok('lo studio e\' aperto', schermo.aperto, schermo);
  ok('e legge l\'orizzonte a meta\' altezza',
     schermo.lettura === 'terzo centrale', schermo.lettura);
  // I TRE CAMPI CI SONO TUTTI E TRE, sempre: e' la forma fissa a rendere
  // confrontabili due studi presi a un mese di distanza.
  ok('con accanto gli altri due campi, sempre gli stessi',
     schermo.targaVisibile && schermo.campoPunti === '1' && schermo.inclinazione === '0°', schermo);
  ok('il fascio c\'e\'', schermo.raggi === 12, schermo);
  ok('e la fuga e\' segnata con un punto', schermo.punti === 2, schermo);
  // IL FASCIO SI TAGLIA, L'ORIZZONTE NO, e sono due decisioni diverse.
  // Il fascio e' la struttura di QUESTA vignetta: sparso su tutto lo schermo
  // sarebbe rumore. L'orizzonte e' l'altezza dell'occhio, e quando cade fuori
  // dal riquadro e' proprio li' fuori che lo si vuole vedere — tagliandolo,
  // allargare la veduta non mostrava niente di nuovo.
  ok('il fascio sta dentro la vignetta',
     schermo.clipSuImmagine && /prosp-clip/.test(schermo.fascioTagliato || ''), schermo);
  ok('ma l\'orizzonte puo\' uscirne, se e\' li\' che va a finire',
     !schermo.orizzonteTagliato, schermo);
  // Due tratti pieni + due tratteggi verso la fuga, ognuno in doppia copia
  // (ombra + colore): otto linee.
  ok('ogni tratto ha la sua ombra, per vedersi anche sul nero',
     schermo.trattiDoppi === 8, schermo.trattiDoppi);

  sezione('un tocco a vuoto non sporca lo schema');
  const vuoto = await page.evaluate(()=>{
    const P = window.P;
    const svg = document.querySelector('.prosp-svg');
    const prima = P.__perLeProve().linee.length;
    const tocco = (tipo, x, y)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 7, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    tocco('pointerdown', 200, 300); tocco('pointerup', 202, 301);
    return { prima, dopo: P.__perLeProve().linee.length };
  });
  ok('un tocco senza trascinamento non diventa una linea',
     vuoto.dopo === vuoto.prima, vuoto);

  sezione('il riquadro si tira col dito, e viene prima delle linee');
  // LO STESSO TRASCINAMENTO FA DUE COSE, a seconda di dove si e' arrivati:
  // prima tira il rettangolo della vignetta, dopo tira le linee. Un gesto solo
  // da imparare, e l'ordine e' quello giusto — prima si decide su cosa si
  // misura, poi si misura.
  const riquadro = await page.evaluate(async ()=>{
    const P = window.P;
    const svg = document.querySelector('.prosp-svg');
    P.apriProspettiva(window.__img);
    // Il tavolo si prende SUBITO, anche prima di scegliere la vignetta (vedi
    // prendiIlTavolo in apriProspettiva): i tocchi vanno quindi riferiti al
    // rettangolo del tavolo, non a quello che l'<img> del lettore aveva prima
    // di aprire lo strumento — sono due rettangoli diversi, perche' il tavolo
    // si adatta allo spazio libero (schermo meno barra), non allo spazio che
    // occupava l'immagine nel lettore.
    const r = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const tocco = (tipo, u, v)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 9, clientX: r.left + u*r.width, clientY: r.top + v*r.height,
      bubbles:true, cancelable:true }));
    const primaDelRiquadro = P.faseRiquadro();
    const testoPrima = document.querySelector('.prosp-invito').textContent;
    // Un riquadro grande come un francobollo non e' una vignetta.
    tocco('pointerdown', 0.4, 0.4); tocco('pointermove', 0.42, 0.42); tocco('pointerup', 0.42, 0.42);
    const dopoIlFrancobollo = P.faseRiquadro();
    // Questo invece si: la vignetta in alto, un terzo di pagina. Mentre il dito
    // e' ancora giu', intorno la pagina si scurisce — serve a vedere cosa si
    // sta prendendo.
    tocco('pointerdown', 0.1, 0.05); tocco('pointermove', 0.9, 0.35);
    const veloDurante = !!document.querySelector('.prosp-velo').getAttribute('d');
    tocco('pointerup', 0.9, 0.35);
    const riq = P.__perLeProve().riquadro;
    const dopo = P.faseRiquadro();
    const testoDopo = document.querySelector('.prosp-invito').textContent;
    // E adesso lo stesso gesto traccia una linea, non un altro rettangolo.
    tocco('pointerdown', 0.2, 0.2); tocco('pointermove', 0.8, 0.28); tocco('pointerup', 0.8, 0.28);
    const linee = P.__perLeProve().linee.length;
    const velo = document.querySelector('.prosp-velo').getAttribute('d');
    return { primaDelRiquadro, testoPrima, dopoIlFrancobollo, riq, dopo, testoDopo, linee,
             veloDurante, veloDopo: !!velo };
  });
  ok('appena aperto, si aspetta la vignetta', riquadro.primaDelRiquadro, riquadro);
  ok('e lo dice', /riquadra la vignetta/i.test(riquadro.testoPrima), riquadro.testoPrima);
  ok('un rettangolo minuscolo non conta come vignetta', riquadro.dopoIlFrancobollo, riquadro);
  ok('trascinando si riquadra davvero',
     !riquadro.dopo && Math.abs(riquadro.riq.x - 0.1) < 0.02
     && Math.abs(riquadro.riq.h - 0.30) < 0.02, riquadro.riq);
  // Mentre si sceglie, fuori dalla vignetta si scurisce: serve a vedere cosa
  // si sta prendendo. Appena scelta, invece, la pagina sparisce del tutto e il
  // velo non serve piu' — un grigio sopra il nulla sarebbe solo grigio.
  ok('mentre si sceglie, intorno la pagina si scurisce', riquadro.veloDurante, riquadro);
  ok('e a scelta fatta il velo non serve piu\'', !riquadro.veloDopo, riquadro);
  ok('da li\' in poi si chiedono le linee', /due linee/i.test(riquadro.testoDopo), riquadro.testoDopo);
  ok('e lo stesso trascinamento adesso traccia una linea', riquadro.linee === 1, riquadro);

  sezione('e si puo\' pan/zoom PRIMA di scegliere la vignetta');
  // IL CASO SEGNALATO IL 16 SETTEMBRE 2026: si zooma la pagina nel lettore, si
  // apre la prospettiva, e la vignetta che interessa e' finita fuori dallo
  // schermo. Prima non c'era modo di raggiungerla — il pan/zoom a due dita (e
  // la rotella) funzionavano solo DOPO aver riquadrato. Qui si prova che
  // funzionano anche PRIMA, mentre si sceglie.
  const panPrimaDiRiquadrare = await page.evaluate(async ()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    const svg = document.querySelector('.prosp-svg');
    const primaDiScegliere = P.faseRiquadro();
    const tav0 = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    // La rotella, come da browser: deve stringere la veduta anche qui.
    svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, clientX: tav0.left + tav0.width/2,
      clientY: tav0.top + tav0.height/2, bubbles:true, cancelable:true }));
    await new Promise(r=> setTimeout(r, 60));
    const dopoRotella = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    // E il pizzico a due dita: si stringe e ci si sposta, sempre prima di aver
    // scelto niente.
    const c = { x: dopoRotella.left + dopoRotella.width/2, y: dopoRotella.top + dopoRotella.height/2 };
    const dito = (id, tipo, x, y)=>{
      const t = new Touch({ identifier:id, target:svg, clientX:x, clientY:y });
      svg.dispatchEvent(new PointerEvent(tipo === 'pointerdown' ? 'pointerdown'
        : tipo, { pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true }));
    };
    dito(1, 'pointerdown', c.x - 40, c.y);
    dito(2, 'pointerdown', c.x + 40, c.y);
    dito(1, 'pointermove', c.x - 100, c.y - 30);
    dito(2, 'pointermove', c.x + 100, c.y + 30);
    await new Promise(r=> setTimeout(r, 60));
    const dopoPizzico = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    dito(1, 'pointerup', c.x - 100, c.y - 30);
    dito(2, 'pointerup', c.x + 100, c.y + 30);
    // E dopo tutto questo pan/zoom, si riesce ancora a riquadrare una
    // vignetta: il gesto di disegno non si e' rotto.
    const r = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const tocco = (tipo, x, y)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 9, clientX: x, clientY: y, bubbles:true, cancelable:true }));
    tocco('pointerdown', r.left + r.width*0.2, r.top + r.height*0.2);
    tocco('pointermove', r.left + r.width*0.6, r.top + r.height*0.5);
    tocco('pointerup', r.left + r.width*0.6, r.top + r.height*0.5);
    return {
      primaDiScegliere,
      largoIniziale: tav0.width,
      largoDopoRotella: dopoRotella.width,
      largoDopoPizzico: dopoPizzico.width,
      riquadratoDopo: !P.faseRiquadro(),
    };
  });
  ok('si comincia in fase di scelta della vignetta', panPrimaDiRiquadrare.primaDiScegliere, panPrimaDiRiquadrare);
  ok('la rotella stringe la veduta anche prima di riquadrare',
     panPrimaDiRiquadrare.largoDopoRotella > panPrimaDiRiquadrare.largoIniziale * 1.1,
     panPrimaDiRiquadrare);
  ok('e il pizzico a due dita anche',
     panPrimaDiRiquadrare.largoDopoPizzico > panPrimaDiRiquadrare.largoDopoRotella * 1.1,
     panPrimaDiRiquadrare);
  ok('e dopo essersi spostati si riesce ancora a disegnare il riquadro',
     panPrimaDiRiquadrare.riquadratoDopo, panPrimaDiRiquadrare);

  sezione('lo strumento lavora su un tavolo suo, dalla prima inquadratura');
  // I DUE GUAI CHE HA TROVATO GIOVANNI PROVANDOLO. Il 15 settembre 2026:
  // scelta la vignetta, ingrandendo prima di riquadrare non ci si poteva piu'
  // spostare, e la barra dei comandi finiva SOPRA il disegno che si stava
  // misurando. Il 16 settembre, ancora peggio: zoomando la PAGINA nel lettore
  // e poi aprendo la prospettiva, non c'era piu' modo di spostarsi per
  // raggiungere una vignetta finita fuori dallo schermo — lo strumento cattura
  // tutti i tocchi ma sapeva pannare solo DOPO aver gia' scelto la vignetta.
  // Nascevano dalla stessa cosa: lo strumento restava appeso all'immagine
  // com'era nel lettore. Adesso si prende un tavolo suo — pannabile e
  // zoomabile — FIN DALL'APERTURA, prima ancora di scegliere la vignetta: la
  // pagina non c'entra piu' niente.
  const tavolo = await page.evaluate(async ()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    const suPagina = {
      // Dall'apertura, non solo dopo aver riquadrato: e' il punto della
      // segnalazione del 16 settembre.
      tavolo: !document.querySelector('.prosp-tavolo').hidden,
      classe: document.body.classList.contains('prosp-tavolo-aperto'),
    };
    // Una vignetta piccola, in alto a sinistra: sulla pagina sarebbe un
    // francobollo, sul tavolo deve riempire lo schermo.
    P.__perLeProveRiquadro({ x:0.05, y:0.05, w:0.35, h:0.22 });
    await new Promise(r=> setTimeout(r, 80));
    const tav = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const barra = document.querySelector('.prosp-barra').getBoundingClientRect();
    const img = window.__img.getBoundingClientRect();
    return {
      suPagina,
      classe: document.body.classList.contains('prosp-tavolo-aperto'),
      tav: { x:tav.left, y:tav.top, w:tav.width, h:tav.height },
      barraSopra: barra.top,
      schermo: { w: window.innerWidth, h: window.innerHeight },
      // Quanto era grande quella vignetta quando stava nella pagina.
      nellaPagina: { w: img.width * 0.35, h: img.height * 0.22 },
      proporzione: (tav.width / tav.height) /
        ((window.__img.naturalWidth * 0.35) / (window.__img.naturalHeight * 0.22)),
    };
  });
  ok('il tavolo c\'e\' gia\' dall\'apertura, prima di ogni riquadro',
     tavolo.suPagina.tavolo && tavolo.suPagina.classe, tavolo.suPagina);
  ok('e resta acceso dopo aver scelto la vignetta', tavolo.classe, tavolo);
  // PIU' GRANDE DI COM'ERA NELLA PAGINA: e' il senso del tavolo. Una vignetta
  // che occupa un ottavo di pagina, da sola, puo' riempire lo schermo.
  ok('e la vignetta ci arriva ingrandita',
     tavolo.tav.w > tavolo.nellaPagina.w * 1.5, tavolo);
  ok('senza deformarsi', Math.abs(tavolo.proporzione - 1) < 0.02, tavolo.proporzione);
  ok('centrata in orizzontale',
     Math.abs((tavolo.tav.x + tavolo.tav.w/2) - tavolo.schermo.w/2) < 2, tavolo);
  // LA BARRA NON CI FINISCE SOPRA. E' meta' della segnalazione, ed e' il
  // motivo per cui lo spazio libero si calcola togliendo l'altezza della barra
  // invece di centrare sullo schermo intero.
  ok('e la barra dei comandi non la copre',
     tavolo.tav.y + tavolo.tav.h <= tavolo.barraSopra, tavolo);

  // E CON UNA VIGNETTA ALTA, che e' il caso in cui il difetto si vedeva.
  // Una vignetta bassa ci sta comunque sopra la barra anche centrandola sullo
  // schermo intero: e' quella verticale — mezza pagina di manga — che cresce
  // fino a finirci sotto. Senza questa prova, misurare lo spazio libero male
  // sarebbe passato liscio.
  const alta = await page.evaluate(async ()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0.1, y:0.03, w:0.4, h:0.94 });
    await new Promise(r=> setTimeout(r, 80));
    const tav = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const barra = document.querySelector('.prosp-barra').getBoundingClientRect();
    return { basso: tav.top + tav.height, barraSopra: barra.top, alto: tav.top,
             schermo: window.innerHeight };
  });
  ok('anche una vignetta alta resta tutta sopra la barra',
     alta.basso <= alta.barraSopra, alta);
  ok('e non esce dallo schermo dall\'altra parte', alta.alto >= 0, alta);

  sezione('e la veduta si allarga per andare a vedere dove cade la fuga');
  // L'ALTRA META' DELLA SEGNALAZIONE: con la fuga due larghezze fuori dalla
  // vignetta — il caso interessante, quello che allunga le scene — a schermo
  // non c'era modo di vederla, e non si poteva nemmeno rimpicciolire.
  const veduta = await page.evaluate(async ()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0.1, y:0.1, w:0.8, h:0.4 });
    // Due linee che convergono LONTANO a destra, ben fuori dalla vignetta.
    P.__perLeProveTraccia({ a:{x:0.12,y:0.20}, b:{x:0.70,y:0.245} });
    P.__perLeProveTraccia({ a:{x:0.12,y:0.44}, b:{x:0.70,y:0.335} });
    await new Promise(r=> setTimeout(r, 60));
    const dovE = ()=> document.querySelector('.prosp-punti circle').getBoundingClientRect();
    const stretta = { vignetta: document.querySelector('.prosp-tavolo').getBoundingClientRect().width,
                      fuga: dovE().left, schermo: window.innerWidth };
    const bottone = document.querySelector('.prosp-veduta');
    const cEra = !bottone.hidden;
    bottone.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(r=> setTimeout(r, 80));
    const larga = { vignetta: document.querySelector('.prosp-tavolo').getBoundingClientRect().width,
                    fuga: dovE().left, acceso: bottone.classList.contains('acceso') };
    bottone.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(r=> setTimeout(r, 80));
    const tornata = { vignetta: document.querySelector('.prosp-tavolo').getBoundingClientRect().width,
                      acceso: bottone.classList.contains('acceso') };
    return { cEra, stretta, larga, tornata,
             fuoriDaSola: dovE().left > window.innerWidth };
  });
  ok('la fuga cade davvero fuori dalla vignetta', veduta.fuoriDaSola, veduta);
  ok('col tavolo stretto sta fuori dallo schermo',
     veduta.stretta.fuga > veduta.stretta.schermo, veduta.stretta);
  ok('il tasto per allargare c\'e\'', veduta.cEra, veduta);
  ok('premendolo la vignetta si rimpicciolisce',
     veduta.larga.vignetta < veduta.stretta.vignetta * 0.8, veduta);
  // E' il punto: non basta rimpicciolire, la fuga deve entrare nello schermo.
  ok('e la fuga entra finalmente nello schermo',
     veduta.larga.fuga < veduta.stretta.schermo && veduta.larga.fuga > 0, veduta.larga);
  ok('il tasto resta acceso, cosi\' si sa dove si e\'', veduta.larga.acceso, veduta.larga);
  ok('e ripremendolo si torna sulla vignetta',
     !veduta.tornata.acceso
     && Math.abs(veduta.tornata.vignetta - veduta.stretta.vignetta) < 2, veduta);

  sezione('e per un frammento, che una vignetta lo e\' gia\', si salta');
  // Un frammento ritagliato su una vignetta sola riquadrarlo sarebbe un gesto
  // a vuoto: il pulsante c'e' solo finche' serve.
  const salta = await page.evaluate(async ()=>{
    const P = window.P;
    P.apriProspettiva(window.__img);
    const visibilePrima = !document.querySelector('.prosp-tutta').hidden;
    document.querySelector('[data-act="tutta"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 50));
    return { visibilePrima, riq: P.corniceAttiva(), fatto: !P.faseRiquadro(),
             visibileDopo: !document.querySelector('.prosp-tutta').hidden,
             velo: document.querySelector('.prosp-velo').getAttribute('d') };
  });
  ok('"Tutta l\'immagine" c\'e\' finche\' serve', salta.visibilePrima, salta);
  ok('e prende l\'immagine intera come vignetta',
     salta.fatto && salta.riq.w === 1 && salta.riq.h === 1, salta);
  ok('poi sparisce, che non ha piu\' senso', !salta.visibileDopo, salta);
  // Con la vignetta grande quanto l'immagine non c'e' niente da mettere da
  // parte: il velo resterebbe un grigio buttato sopra la tavola e basta.
  ok('e non si scurisce niente, perche\' non c\'e\' un fuori', !salta.velo, salta);

  sezione('si pulisce, si torna indietro, si chiude');
  const comandi = await page.evaluate(async ()=>{
    const P = window.P;
    const ov = document.getElementById('prospettiva');
    const premi = a=> ov.querySelector('[data-act="'+a+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:1 });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.30}, b:{x:0.95,y:0.38} });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.70}, b:{x:0.95,y:0.62} });
    premi('indietro');
    const dopoIndietro = P.__perLeProve().linee.length;
    premi('pulisci');
    const dopoPulisci = P.__perLeProve().linee.length;
    const senzaRiquadro = P.faseRiquadro();
    const invito = ov.querySelector('.prosp-invito').textContent;
    premi('esci');
    await new Promise(r=> setTimeout(r, 50));
    return { dopoIndietro, dopoPulisci, senzaRiquadro, invito, aperto: P.prospettivaAperta(),
             classe: document.body.classList.contains('prosp-aperta') };
  });
  ok('la freccia indietro ne toglie una sola', comandi.dopoIndietro === 1, comandi);
  ok('"Clean" le toglie tutte', comandi.dopoPulisci === 0, comandi);
  // Tornata vuota, la barra torna a dire cosa fare: senza, resterebbe l'ultima
  // lettura sotto uno schema che non c'e' piu'.
  // "Clean" riporta all'inizio di tutto, riquadro compreso: e' l'unico modo di
  // ricominciare da un'altra vignetta senza chiudere e riaprire.
  ok('e "Clean" toglie anche il riquadro', comandi.senzaRiquadro, comandi);
  ok('con la barra che torna a chiedere la vignetta',
     /riquadra/i.test(comandi.invito), comandi.invito);
  ok('"Chiudi" chiude davvero', !comandi.aperto, comandi);
  ok('e restituisce i comandi alle schermate sotto', !comandi.classe, comandi);

  sezione('e dal lettore ci si arriva col pulsante, sulla tavola che si sta guardando');
  // Fin qui lo strumento e' stato aperto a mano. Qui si apre come lo apre
  // Giovanni: un albo vero, il pulsante in barra, e la tavola sotto gli occhi.
  const dalLettore = await page.evaluate(async (url)=>{
    const buf = await (await fetch(url)).arrayBuffer();
    document.querySelectorAll('div[style*="position:fixed"]').forEach(e=>{
      if(!e.id) e.remove();   // via la finta immagine montata per le prove sopra
    });
    await window.albums.openAlbumFromFile(new File([buf], 'Studio.cbz', { type:'application/zip' }));
    await new Promise(r=> setTimeout(r, 900));
    document.querySelector('.ar-prosp').dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(r=> setTimeout(r, 400));
    const P = window.P;
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:1 });
    const centrale = document.querySelectorAll('.ar-cell')[1].querySelector('img');
    const ov = document.getElementById('prospettiva');
    // Si traccia sulla tavola vera e si guarda che la misura sia riferita a
    // QUELLA immagine, non allo schermo.
    P.__perLeProveTraccia({ a:{x:0.1,y:0.2}, b:{x:0.9,y:0.3} });
    P.__perLeProveTraccia({ a:{x:0.1,y:0.8}, b:{x:0.9,y:0.7} });
    await new Promise(r=> setTimeout(r, 60));
    const rImg = ov.querySelector('.prosp-tavolo').getBoundingClientRect();
    const clip = ov.querySelector('.prosp-clip-rect');
    return {
      aperto: P.prospettivaAperta(),
      barra: getComputedStyle(document.querySelector('.ar-bottombar')).display,
      topbar: getComputedStyle(document.querySelector('.ar-topbar')).display,
      suQuellaTavola: Math.abs(parseFloat(clip.getAttribute('width')) - rImg.width) < 1.5,
      lettura: ov.querySelector('.prosp-oriz').textContent,
    };
  }, '/test/fixtures/tavole.cbz');
  ok('il pulsante in barra apre lo studio', dalLettore.aperto, dalLettore);
  // E i comandi del lettore si tolgono di mezzo: mentre si traccia, il
  // trascinamento non deve girare pagina, e la barra sotto coprirebbe proprio
  // la fascia bassa della tavola.
  ok('i comandi del lettore si tolgono di mezzo',
     dalLettore.barra === 'none' && dalLettore.topbar === 'none', dalLettore);
  // La vignetta sul tavolo viene da QUELLA tavola: se un domani lo strumento
  // si agganciasse all'immagine sbagliata, il ritaglio e la vignetta non
  // coinciderebbero piu'.
  ok('e il ritaglio combacia con la vignetta sul tavolo',
     dalLettore.suQuellaTavola, dalLettore);
  ok('con la lettura riferita a quella',
     dalLettore.lettura === 'terzo centrale', dalLettore.lettura);

  sezione('la barra dei comandi vive nel suo spazio, non sopra il disegno');
  // LA STESSA GARANZIA DI PRIMA (vedi "lo strumento lavora su un tavolo suo"
  // qui sopra), ma verificata sulla STRUTTURA e non solo sulla misura: prima
  // .prosp-barra era position:absolute e la non-sovrapposizione dipendeva da
  // un conto in JS (spazioLibero) che indovinava l'altezza della barra.
  // Giovanni l'ha segnalato il 16 settembre 2026: sbagliando quel conto, la
  // barra tornava a sedersi sopra la vignetta. Ora palco e barra sono due
  // righe diverse di una colonna flex: qui si prova che non e' piu'
  // position:absolute, e che il palco finisce esattamente dove comincia la
  // barra — non "quasi", per costruzione del layout.
  const struttura = await page.evaluate(async ()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    await new Promise(r=> setTimeout(r, 60));
    const ov = document.getElementById('prospettiva');
    const palco = ov.querySelector('.prosp-palco');
    const barra = ov.querySelector('.prosp-barra');
    return {
      posizioneBarra: getComputedStyle(barra).position,
      palcoFinisceDoveIniziaLaBarra:
        palco.getBoundingClientRect().bottom <= barra.getBoundingClientRect().top + 0.5,
    };
  });
  ok('la barra non e\' piu\' una scheda che galleggia sopra il tavolo',
     struttura.posizioneBarra !== 'absolute', struttura);
  ok('e il palco del disegno finisce esattamente dove comincia la barra',
     struttura.palcoFinisceDoveIniziaLaBarra, struttura);

  sezione('e tenendo premuto non salta fuori il menu del browser');
  // SEGNALATO DA GIOVANNI IL 17 SETTEMBRE 2026, da telefono: correggendo una
  // linea si tiene premuto e si trascina, e Android ci leggeva sopra il suo
  // gesto di lungo-tocco su un'immagine — compariva "Scarica immagine /
  // Cerca con Lens" in mezzo allo schermo e il tratto si perdeva. Il tavolo
  // e' un <img> vero, ed era lui il bersaglio che il browser trovava sotto al
  // dito: adesso non riceve tocchi (li prende tutti l'SVG, che e' chi sa cosa
  // farne) e il menu e' bloccato comunque, come rete di sicurezza.
  const senzaMenu = await page.evaluate(()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    const ov = document.getElementById('prospettiva');
    const ev = new MouseEvent('contextmenu', { bubbles:true, cancelable:true });
    ov.querySelector('.prosp-svg').dispatchEvent(ev);
    const st = getComputedStyle(ov.querySelector('.prosp-tavolo'));
    return {
      menuBloccato: ev.defaultPrevented,
      tavoloNonToccabile: st.pointerEvents,
      senzaSelezione: getComputedStyle(ov).userSelect || getComputedStyle(ov).webkitUserSelect,
    };
  });
  ok('il menu del tasto destro non si apre sopra lo studio',
     senzaMenu.menuBloccato, senzaMenu);
  // E' la parte che conta davvero sul telefono: se sotto al dito non c'e'
  // nessuna immagine, Android non ha niente da offrire.
  ok('e il tavolo non e\' un bersaglio che il browser possa offrire',
     senzaMenu.tavoloNonToccabile === 'none', senzaMenu);
  ok('ne\' si seleziona niente trascinando', senzaMenu.senzaSelezione === 'none', senzaMenu);

  sezione('le linee gia\' tracciate si correggono, non solo si disfano');
  // PRIMA SI POTEVA SOLO DISFARE E RITRACCIARE DA CAPO. Giovanni l'ha
  // segnalato il 16 settembre 2026: due tratti tirati bene tranne un pelo su
  // un estremo obbligavano a buttare via anche l'altro tratto, giusto, solo
  // per rifare tutto da zero. Ora appoggiandosi vicino a un capo gia'
  // piazzato lo si trascina, invece di aggiungerne uno nuovo.
  const modificaLinea = await page.evaluate(async ()=>{
    const P = window.P;
    const svg = document.querySelector('.prosp-svg');
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:1 });
    // Due linee ORIZZONTALI e parallele: non si incontrano da nessuna parte,
    // nessuna fuga.
    P.__perLeProveTraccia({ a:{x:0.1,y:0.3}, b:{x:0.9,y:0.3} });
    P.__perLeProveTraccia({ a:{x:0.1,y:0.7}, b:{x:0.9,y:0.7} });
    await new Promise(r=> setTimeout(r, 60));
    const primaFuochi = P.__perLeProve().fuochi.length;
    const r = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const tocco = (tipo, u, v)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 11, clientX: r.left + u*r.width, clientY: r.top + v*r.height,
      bubbles:true, cancelable:true }));
    // Si trascina l'estremo destro della prima linea (0.9, 0.3): le due
    // linee non sono piu' parallele, deve comparire una fuga.
    tocco('pointerdown', 0.9, 0.3);
    tocco('pointermove', 0.9, 0.5);
    tocco('pointerup', 0.9, 0.5);
    const dopo = P.__perLeProve();
    return { primaFuochi, dopoLinee: dopo.linee.length, dopoFuochi: dopo.fuochi.length,
             primaLinea: dopo.linee[0] };
  });
  ok('prima le due linee erano parallele: nessuna fuga',
     modificaLinea.primaFuochi === 0, modificaLinea);
  ok('trascinare un estremo lo sposta, non ne aggiunge una terza',
     modificaLinea.dopoLinee === 2, modificaLinea);
  ok('e la fuga si ricalcola da sola',
     modificaLinea.dopoFuochi === 1, modificaLinea);
  ok('l\'estremo trascinato e\' arrivato dove il dito l\'ha lasciato',
     Math.abs(modificaLinea.primaLinea.b.x - 0.9) < 0.02
     && Math.abs(modificaLinea.primaLinea.b.y - 0.5) < 0.02, modificaLinea.primaLinea);

  sezione('anche il riquadro, una volta scelto, si puo\' ritoccare');
  // LA STESSA CORREZIONE VALE PER IL RIQUADRO: prima l'unico modo per
  // stringerlo era "indietro" (che lo disfa del tutto, tornando a riquadrare
  // da zero). Trascinando un angolo lo si aggiusta e basta — utile proprio
  // quando il riquadro tracciato al volo include per sbaglio un filo della
  // vignetta accanto.
  const modificaRiquadro = await page.evaluate(async ()=>{
    const P = window.P;
    const svg = document.querySelector('.prosp-svg');
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0.1, y:0.1, w:0.5, h:0.5 });
    await new Promise(r=> setTimeout(r, 60));
    const r = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const tocco = (tipo, cx, cy)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 12, clientX: cx, clientY: cy, bubbles:true, cancelable:true }));
    // L'angolo in basso a destra del riquadro coincide col bordo del tavolo
    // (il riquadro e' 0.1..0.6 su entrambi gli assi): lo si trascina un po'
    // oltre, per allargarlo.
    tocco('pointerdown', r.left + r.width, r.top + r.height);
    tocco('pointermove', r.left + r.width * 1.3, r.top + r.height * 1.3);
    tocco('pointerup', r.left + r.width * 1.3, r.top + r.height * 1.3);
    await new Promise(res=> setTimeout(res, 60));
    return P.corniceAttiva();
  });
  ok('l\'angolo opposto resta fermo: si allarga, non si ridisegna da zero',
     Math.abs(modificaRiquadro.x - 0.1) < 0.02 && Math.abs(modificaRiquadro.y - 0.1) < 0.02,
     modificaRiquadro);
  ok('e l\'angolo trascinato porta il riquadro dove il dito l\'ha lasciato',
     modificaRiquadro.w > 0.55 && modificaRiquadro.h > 0.55, modificaRiquadro);

  sezione('e un lato solo si stringe senza toccare gli altri tre, gia\' giusti');
  // IL CASO PRECISO SEGNALATO DA GIOVANNI IL 16 SETTEMBRE 2026: un riquadro
  // giusto su tre lati e un filo troppo largo sul quarto (si vedeva ancora un
  // bordo della vignetta accanto). Trascinare un angolo avrebbe spostato
  // anche uno dei lati gia' buoni; qui si trascina il punto di mezzo di un
  // solo lato — quello sinistro — e si controlla che SOLO quel lato si
  // muova.
  const modificaLato = await page.evaluate(async ()=>{
    const P = window.P;
    const svg = document.querySelector('.prosp-svg');
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0.1, y:0.1, w:0.5, h:0.5 });
    await new Promise(r=> setTimeout(r, 60));
    const r = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const tocco = (tipo, cx, cy)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 13, clientX: cx, clientY: cy, bubbles:true, cancelable:true }));
    // Il punto di mezzo del lato sinistro: lo si trascina verso destra, per
    // togliere una fetta che apparteneva alla vignetta accanto.
    tocco('pointerdown', r.left, r.top + r.height/2);
    tocco('pointermove', r.left + r.width * 0.2, r.top + r.height/2);
    tocco('pointerup', r.left + r.width * 0.2, r.top + r.height/2);
    await new Promise(res=> setTimeout(res, 60));
    return P.corniceAttiva();
  });
  ok('il lato destro, quello sopra e quello sotto restano dove erano',
     Math.abs(modificaLato.y - 0.1) < 0.02 && Math.abs(modificaLato.h - 0.5) < 0.02
     && Math.abs((modificaLato.x + modificaLato.w) - 0.6) < 0.02, modificaLato);
  ok('solo il lato sinistro si e\' stretto, verso dove il dito l\'ha portato',
     modificaLato.x > 0.15, modificaLato);

  sezione('e chiudendo l\'albo lo schema non resta appeso sul nulla');
  const chiusura = await page.evaluate(async ()=>{
    window.albums.closeReaderUI();
    await new Promise(r=> setTimeout(r, 300));
    return { aperto: window.P.prospettivaAperta() };
  });
  ok('chiuso il lettore, si chiude anche lo studio', !chiusura.aperto, chiusura);

  sezione('e lo studio si salva: la vignetta sola, con lo schema sopra');
  // NON UNO SCREENSHOT. La vignetta si ridisegna alla sua risoluzione vera e lo
  // schema ci va sopra: uno screenshot porterebbe dentro la barra dei comandi,
  // la pagina intorno scurita e la risoluzione dello schermo — tre cose che non
  // c'entrano con lo studio — e su un telefono darebbe un'immagine piu' piccola
  // dell'originale.
  const salvato = await page.evaluate(async ()=>{
    const P = window.P;
    const preso = [];
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img, { salva: async d=> { preso.push(d); } });
    const btn = ()=> document.querySelector('.prosp-salva');
    // Senza una fuga non c'e' niente da salvare: il pulsante non c'e'.
    const primaDelRiquadro = btn().hidden;
    // La vignetta e' la meta' alta dell'immagine.
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:0.5 });
    const senzaFughe = btn().hidden;
    // Due linee che convergono al CENTRO della vignetta (0.5, 0.25): la fuga
    // resta dentro il riquadro apposta, per provare il caso normale — quello
    // che deve restare pulito, senza margine ne' cornice aggiunti (vedi
    // areaDaSalvare: si allarga SOLO quando una fuga cade fuori).
    P.__perLeProveTraccia({ a:{x:0.05,y:0.05}, b:{x:0.95,y:0.45} });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.45}, b:{x:0.95,y:0.05} });
    const conFuga = btn().hidden;
    btn().dispatchEvent(new MouseEvent('click', { bubbles:true }));
    await new Promise(r=> setTimeout(r, 900));
    const d = preso[0] || null;
    return {
      primaDelRiquadro, senzaFughe, conFuga,
      quanti: preso.length,
      tipo: d && d.blob && d.blob.type, peso: d && d.blob && d.blob.size,
      w: d && d.w, h: d && d.h,
      natW: window.__img.naturalWidth, natH: window.__img.naturalHeight,
      misure: d && d.misure,
      chiuso: !P.prospettivaAperta(),
    };
  });
  ok('senza riquadro il pulsante non c\'e\'', salvato.primaDelRiquadro, salvato);
  ok('e nemmeno senza una fuga: non ci sarebbe niente da salvare',
     salvato.senzaFughe, salvato);
  ok('con la fuga compare', salvato.conFuga === false, salvato);
  ok('e premendolo esce un\'immagine sola', salvato.quanti === 1, salvato);
  // La vignetta, non la pagina: meta' altezza, larghezza intera, alla
  // risoluzione VERA dell'immagine — non a quella dello schermo. Sotto c'e' in
  // piu' la striscia coi numeri, che e' alta un decimo del lato corto.
  ok('grande quanto la vignetta, non quanto la pagina',
     salvato.w === salvato.natW
     && salvato.h > salvato.natH/2 && salvato.h < salvato.natH/2 * 1.2, salvato);
  ok('in webp, che pesa meno a parita\' di tratto',
     /webp/.test(salvato.tipo || ''), salvato.tipo);
  // I NUMERI VIAGGIANO COL DOCUMENTO: senza, per sapere dove cade l'orizzonte
  // di uno studio archiviato bisognerebbe riaprirlo e rimisurarlo, e lo
  // scaffale Prospettiva non potrebbe scrivere la percentuale sotto ognuno.
  ok('con dentro la misura dell\'orizzonte, riferita alla vignetta',
     salvato.misure && salvato.misure.orizzonte === 'terzo centrale'
     && salvato.misure.altezza === 50, salvato.misure);
  ok('e le fughe, anche loro in coordinate di vignetta',
     salvato.misure && salvato.misure.fughe.length === 1, salvato.misure);
  // I TRE CAMPI VIAGGIANO COL DOCUMENTO, ed e' quello che permettera' di
  // contare gli studi senza riaprirli uno per uno.
  ok('coi tre campi del catalogo',
     salvato.misure && salvato.misure.punti === 1
     && typeof salvato.misure.orizzonte === 'string'
     && typeof salvato.misure.inclinazione === 'number', salvato.misure);
  // E SOTTO, LE LINEE TRACCIATE. Costano una manciata di decimali e sono
  // l'unica differenza fra un archivio che fra sei mesi si puo' ancora
  // interrogare in un modo nuovo e uno da rifare studio per studio.
  ok('e con dentro le linee, per poter rimisurare senza rifare gli studi',
     salvato.misure && salvato.misure.linee && salvato.misure.linee.length === 2
     && typeof salvato.misure.linee[0].a.x === 'number', salvato.misure);
  // Chi salva ha finito di studiare QUESTA vignetta: restare davanti a un
  // foglio di linee su una cosa gia' archiviata farebbe del gesto successivo
  // sempre "chiudi".
  ok('e lo studio si chiude da solo', salvato.chiuso, salvato);

  sezione('senza nessuno che sappia dove metterlo, non si salva');
  // Il modulo non sa niente di cartelle: chi lo apre gli passa chi salva. Se
  // un domani lo si aprisse da un posto che non sa dove mettere lo studio, il
  // pulsante non deve comparire invece di fallire al tocco.
  const senzaCasa = await page.evaluate(()=>{
    const P = window.P;
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img);
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:1 });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.30}, b:{x:0.95,y:0.38} });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.70}, b:{x:0.95,y:0.62} });
    return document.querySelector('.prosp-salva').hidden;
  });
  ok('il pulsante Salva non compare', senzaCasa, senzaCasa);

  sezione('e con l\'orizzonte fuori dalla vignetta, il salvataggio si allarga da solo');
  // IL LIMITE TROVATO IL 15 SETTEMBRE 2026: con l'orizzonte fuori dal riquadro,
  // nello studio salvato la riga d'oro non c'era proprio. La prima cura era
  // "si salva quello che si vede a schermo" — bastava allargare la veduta col
  // tasto ⤢ prima di premere Salva.
  //
  // SBAGLIATA ANCHE QUELLA (16 settembre 2026): per tracciare con precisione
  // si zooma stretti, e la stessa mano che ha appena finito il secondo tratto
  // preme Salva — dimenticarsi di rizoomare indietro voleva dire salvare un
  // ritaglio, non lo studio. Adesso il salvataggio NON dipende piu' da come si
  // sta guardando lo schermo: si allarga DA SOLO quando una fuga cade fuori
  // dal riquadro, senza che nessuno debba premere niente prima.
  const fuoriCampo = await page.evaluate(async ()=>{
    const P = window.P;
    const preso = [];
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img, { salva: async d=>{ preso.push(d); } });
    P.__perLeProveRiquadro({ x:0.1, y:0.5, w:0.6, h:0.25 });
    // Due linee che convergono molto in alto a destra: l'orizzonte cade SOPRA
    // la vignetta, fuori dal riquadro.
    P.__perLeProveTraccia({ a:{x:0.12,y:0.72}, b:{x:0.66,y:0.60} });
    P.__perLeProveTraccia({ a:{x:0.12,y:0.60}, b:{x:0.66,y:0.545} });
    await new Promise(r=> setTimeout(r, 60));
    const lettura = document.querySelector('.prosp-oriz').textContent;
    const misure = P.misureStudio();
    // NESSUN tasto ⤢, nessun pizzico: si salva subito, cosi' com'e' appena
    // tracciate le due linee.
    document.querySelector('.prosp-salva').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 900));
    const leggi = async b=> new Promise(res=>{
      const im = new Image(); im.onload = ()=> res(im); im.src = URL.createObjectURL(b);
    });
    const senzaToccareNiente = await leggi(preso[0].blob);
    // Nell'immagine si va a cercare l'oro dell'orizzonte: se c'e', la riga e'
    // finita dentro davvero.
    const cercaOro = (im)=>{
      const cv = document.createElement('canvas');
      cv.width = im.width; cv.height = im.height;
      const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
      const d = cx.getImageData(0, 0, cv.width, Math.round(cv.height * 0.88)).data;
      let n = 0;
      for(let i = 0; i < d.length; i += 4){
        if(d[i] > 200 && d[i+1] > 150 && d[i+1] < 220 && d[i+2] < 90) n++;
      }
      return n;
    };
    return {
      lettura, misure,
      immagine: { w: senzaToccareNiente.width, h: senzaToccareNiente.height, oro: cercaOro(senzaToccareNiente) },
    };
  });
  ok('l\'orizzonte cade davvero sopra la vignetta',
     fuoriCampo.lettura === 'sopra la vignetta', fuoriCampo.lettura);
  // Senza premere ⤢, senza pizzicare, senza girare la rotella: la riga d'oro
  // c'e' comunque.
  ok('e senza toccare ⤢ ne\' zoom di nessun tipo, la riga d\'oro c\'e\' lo stesso',
     fuoriCampo.immagine.oro > 1000, fuoriCampo.immagine);

  sezione('e quel margine allargato resta neutro: non si vede la vignetta accanto');
  // LA FUGA CADE SPESSO DENTRO UN'ALTRA VIGNETTA della stessa tavola — e' la
  // stessa foto di pagina, solo un'altra porzione. Il primo tentativo di
  // "allargare quel poco che serve" (vedi areaDaSalvare, e la prova sopra)
  // ridisegnava l'immagine sorgente su TUTTA l'area allargata: dove quel
  // margine cadeva davvero dentro un'altra vignetta, nello studio esportato
  // compariva LEI, non uno sfondo pulito. Giovanni l'ha trovato il 16
  // settembre 2026 su una fuga molto in alto: si vedeva ancora l'intera
  // tavola, il contrario esatto del motivo per cui il tavolo esiste. Qui si
  // costruisce un'immagine con una fascia di un colore acceso SOPRA la
  // vignetta — la "vignetta accanto" — si manda la fuga a cadere proprio li',
  // e si controlla che quel colore non finisca nello studio salvato.
  const margineNeutro = await page.evaluate(async ()=>{
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
    const x = c.getContext('2d');
    x.fillStyle = '#e81030'; x.fillRect(0, 0, 900, 400);    // "l'altra vignetta", sopra
    x.fillStyle = '#fff';    x.fillRect(0, 400, 900, 800);  // la vignetta che si studia
    const im = new Image();
    im.src = c.toDataURL('image/png');
    await im.decode();
    const P = window.P;
    const preso = [];
    P.chiudiProspettiva();
    P.apriProspettiva(im, { salva: async d=>{ preso.push(d); } });
    // La vignetta e' la meta' bassa, sotto il rosso.
    P.__perLeProveRiquadro({ x:0, y:1/3, w:1, h:2/3 });
    // Due linee che convergono ben SOPRA il riquadro: la fuga cade dentro la
    // fascia rossa, non semplicemente fuori dall'immagine.
    P.__perLeProveTraccia({ a:{x:0.15,y:0.60}, b:{x:0.50,y:0.05} });
    P.__perLeProveTraccia({ a:{x:0.85,y:0.60}, b:{x:0.50,y:0.05} });
    await new Promise(r=> setTimeout(r, 60));
    const lettura = document.querySelector('.prosp-oriz').textContent;
    document.querySelector('.prosp-salva').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 900));
    const risultato = await new Promise(res=>{
      const i = new Image(); i.onload = ()=> res(i); i.src = URL.createObjectURL(preso[0].blob); });
    const cv = document.createElement('canvas');
    cv.width = risultato.width; cv.height = risultato.height;
    const cx = cv.getContext('2d'); cx.drawImage(risultato, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let rosso = 0;
    for(let i = 0; i < d.length; i += 4){
      if(d[i] > 200 && d[i+1] < 60 && d[i+2] < 80) rosso++;
    }
    return { lettura, rosso, w: risultato.width, h: risultato.height };
  });
  ok('la fuga cade davvero sopra il riquadro, dentro la vignetta accanto',
     margineNeutro.lettura === 'sopra la vignetta', margineNeutro.lettura);
  ok('e il colore della vignetta accanto non finisce nel margine dello studio salvato',
     margineNeutro.rosso === 0, margineNeutro);

  sezione('e non dipende da come si sta guardando lo schermo quando si preme Salva');
  // IL CASO PRECISO DI GIOVANNI: si zooma stretti per tracciare con
  // precisione, e la vista resta cosi' finche' non si preme Salva. Il
  // salvataggio deve ignorare quel ritaglio e comporre da solo la vignetta
  // intera con la fuga — esattamente come nella prova sopra, ma qui in piu' si
  // pizzica lo schermo per restringersi su un angolo minuscolo PRIMA di
  // salvare, cosi' se qualcosa tornasse a dipendere dalla vista attuale questa
  // prova lo direbbe.
  const zoomatoAlMomentoDiSalvare = await page.evaluate(async ()=>{
    const P = window.P;
    const preso = [];
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img, { salva: async d=>{ preso.push(d); } });
    P.__perLeProveRiquadro({ x:0.1, y:0.5, w:0.6, h:0.25 });
    P.__perLeProveTraccia({ a:{x:0.12,y:0.72}, b:{x:0.66,y:0.60} });
    P.__perLeProveTraccia({ a:{x:0.12,y:0.60}, b:{x:0.66,y:0.545} });
    await new Promise(r=> setTimeout(r, 60));
    // Ci si stringe forte su un angolo della vignetta soltanto — non sulla
    // fuga, non sull'orizzonte: proprio il caso in cui, se il salvataggio
    // dipendesse ancora dalla vista, l'oro non ci sarebbe.
    const svg = document.querySelector('.prosp-svg');
    const tav = document.querySelector('.prosp-tavolo').getBoundingClientRect();
    const c = { x: tav.left + tav.width * 0.3, y: tav.top + tav.height * 0.7 };
    const dito = (id, tipo, x, y)=> svg.dispatchEvent(new PointerEvent(tipo,
      { pointerId:id, clientX:x, clientY:y, bubbles:true, cancelable:true }));
    dito(1, 'pointerdown', c.x - 15, c.y);
    dito(2, 'pointerdown', c.x + 15, c.y);
    dito(1, 'pointermove', c.x - 90, c.y - 20);
    dito(2, 'pointermove', c.x + 90, c.y + 20);
    dito(1, 'pointerup', c.x - 90, c.y - 20);
    dito(2, 'pointerup', c.x + 90, c.y + 20);
    await new Promise(r=> setTimeout(r, 60));
    const ristretto = document.querySelector('.prosp-tavolo').getBoundingClientRect().width
      > tav.width * 1.3;   // conferma che il pizzico ha davvero stretto la vista
    document.querySelector('.prosp-salva').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 900));
    const im = await new Promise(res=>{
      const i = new Image(); i.onload = ()=> res(i); i.src = URL.createObjectURL(preso[0].blob); });
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, Math.round(cv.height * 0.88)).data;
    let oro = 0;
    for(let i = 0; i < d.length; i += 4){
      if(d[i] > 200 && d[i+1] > 150 && d[i+1] < 220 && d[i+2] < 90) oro++;
    }
    return { ristretto, w: im.width, h: im.height, oro };
  });
  ok('la vista era davvero stata ristretta prima di salvare',
     zoomatoAlMomentoDiSalvare.ristretto, zoomatoAlMomentoDiSalvare);
  ok('ma il salvataggio ignora quella vista e compone la vignetta intera lo stesso',
     zoomatoAlMomentoDiSalvare.oro > 1000, zoomatoAlMomentoDiSalvare);
  // E IN OGNI CASO I NUMERI SONO SCRITTI SOTTO. E' l'unica risposta possibile
  // quando la fuga sta a undici larghezze e nessuna inquadratura la contiene.
  const striscia = await page.evaluate(async ()=>{
    const P = window.P;
    const preso = [];
    P.chiudiProspettiva();
    P.apriProspettiva(window.__img, { salva: async d=>{ preso.push(d); } });
    P.__perLeProveRiquadro({ x:0, y:0, w:1, h:0.5 });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.10}, b:{x:0.95,y:0.18} });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.40}, b:{x:0.95,y:0.32} });
    await new Promise(r=> setTimeout(r, 60));
    document.querySelector('.prosp-salva').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 900));
    const im = await new Promise(res=>{
      const i = new Image(); i.onload = ()=> res(i); i.src = URL.createObjectURL(preso[0].blob); });
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
    // La striscia sta in fondo ed e' scura: si guarda una riga di pixel a
    // pochi punti dal bordo basso.
    // La striscia sta in fondo: si guarda tutta la sua fascia, non una riga
    // sola — il testo non e' garantito che passi esattamente di li'.
    const alta = Math.max(30, Math.round(Math.min(cv.width, cv.height) * 0.09));
    const d = cx.getImageData(0, cv.height - alta, cv.width, alta).data;
    let scuri = 0, oro = 0;
    for(let i = 0; i < d.length; i += 4){
      if(d[i] < 60 && d[i+1] < 60 && d[i+2] < 60) scuri++;
      if(d[i] > 200 && d[i+1] > 150 && d[i+2] < 90) oro++;
    }
    return { larghezza: cv.width, punti: d.length/4, scuri, oro, altezza: cv.height };
  });
  ok('sotto l\'immagine c\'e\' una striscia scura',
     striscia.scuri > striscia.punti * 0.6, striscia);
  ok('e dentro ci sono scritti i numeri, in oro', striscia.oro > 20, striscia);
});