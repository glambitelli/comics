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

  sezione('l\'orizzonte, e il numero per cui si e\' aperto lo strumento');
  const lettura = await page.evaluate(()=>{
    const P = window.P;
    // Una fuga sola: l'orizzonte e' la retta ORIZZONTALE che ci passa. Qui la
    // fuga sta al 20% dell'altezza.
    const f1 = [{ x:0.5, y:0.2 }];
    const o1 = P.orizzonteDa(f1);
    // Due fughe a altezze diverse: l'orizzonte le unisce ed e' inclinato.
    const f2 = [{ x:-0.5, y:0.3 }, { x:1.5, y:0.5 }];
    const o2 = P.orizzonteDa(f2);
    return {
      unaSola: P.letturaOrizzonte(o1, f1),
      orizzontale: Math.abs(o1.a.y - o1.b.y) < 1e-9,
      due: P.letturaOrizzonte(o2, f2),
      inclinato: Math.abs(o2.a.y - o2.b.y) > 0.01,
      sopra: P.letturaOrizzonte(P.orizzonteDa([{x:0.5,y:-0.3}]), [{x:0.5,y:-0.3}]),
      terra: P.letturaOrizzonte(P.orizzonteDa([{x:0.5,y:0.94}]), [{x:0.5,y:0.94}]),
      dentro: P.letturaFuoco({ x:0.4, y:0.3 }, 1),
      destra: P.letturaFuoco({ x:2.4, y:0.3 }, 1),
      sinistra: P.letturaFuoco({ x:-1.2, y:0.3 }, 2),
    };
  });
  ok('con una fuga sola l\'orizzonte e\' orizzontale', lettura.orizzontale, lettura);
  ok('e dice la sua altezza in percentuale', /^HL 20%$/.test(lettura.unaSola), lettura.unaSola);
  // NIENTE AGGETTIVI. La prima versione appiccicava al numero una parola —
  // "altissimo", "a terra", "a meta' altezza" — e Giovanni le ha trovate
  // sciocche, giustamente: davanti a una tavola di Otomo "20%" e' un dato,
  // "altissimo" e' un giudizio che uno si fa da solo. Qui si misura e basta.
  ok('senza aggettivi appiccicati sopra',
     !/altissim|a terra|a metà|basso/i.test(lettura.unaSola + lettura.terra), lettura);
  // IL CASO DI OTOMO: l'orizzonte fuori dalla vignetta. Il numero da solo
  // (negativo, o sopra cento) lascerebbe il dubbio che sia un errore.
  ok('e uno fuori dalla vignetta lo dice, col segno e da che parte',
     /^HL -30% \(sopra\)$/.test(lettura.sopra), lettura.sopra);
  ok('con due fughe l\'orizzonte si inclina, invece di restare dritto',
     lettura.inclinato, lettura);
  // E L'ALTEZZA SI MISURA AL CENTRO DELLA VIGNETTA. Con l'orizzonte inclinato
  // "l'altezza" non e' un numero solo: misurata su un bordo direbbe una cosa,
  // sull'altro un'altra, e nessuna delle due e' quella di cui si parla
  // guardando una tavola. Le due fughe qui stanno al 30% e al 50%, a distanza
  // uguale dal centro: al centro fanno 40%.
  ok('e la sua altezza si legge al centro, non su un bordo',
     /^HL 40%$/.test(lettura.due), lettura.due);
  ok('la fuga dentro la vignetta si riconosce', /^VP1$/.test(lettura.dentro), lettura.dentro);
  // Quante larghezze: e' la misura di quanto e' "lunga" la scena, ed e' la
  // ragione per cui la fuga fuori campo interessa.
  ok('e quella fuori dice da che parte e di quanto',
     /VP1 destra 1\.4w/.test(lettura.destra), lettura.destra);
  ok('anche a sinistra', /VP2 sinistra 1\.2w/.test(lettura.sinistra), lettura.sinistra);

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
    return {
      pagina:  P.letturaOrizzonte(o, f, { x:0, y:0, w:1, h:1 }),
      // Vignetta in cima alla pagina, alta un terzo: quel 25% della pagina,
      // dentro di lei, e' molto piu' in basso.
      alta:    P.letturaOrizzonte(o, f, { x:0, y:0.05, w:1, h:0.30 }),
      // Vignetta a meta' pagina: la stessa fuga le cade SOPRA.
      bassa:   P.letturaOrizzonte(o, f, { x:0, y:0.40, w:1, h:0.30 }),
      // E le larghezze di distanza della fuga si contano sulla vignetta: in una
      // vignetta stretta la stessa fuga e' molto piu' lontana.
      largaTutta:  P.letturaFuoco({ x:1.5, y:0.3 }, 1, { x:0, y:0, w:1, h:1 }),
      largaMezza:  P.letturaFuoco({ x:1.5, y:0.3 }, 1, { x:0, y:0, w:0.5, h:1 }),
    };
  });
  ok('sulla pagina intera legge il 25%', /^HL 25%$/.test(relativo.pagina), relativo.pagina);
  ok('ma dentro una vignetta in cima e\' molto piu\' in basso',
     /^HL 67%$/.test(relativo.alta), relativo.alta);
  ok('e per una vignetta di meta\' pagina cade sopra di lei',
     /^HL -50% \(sopra\)$/.test(relativo.bassa), relativo.bassa);
  ok('le larghezze di distanza si contano sulla vignetta, non sulla tavola',
     /VP1 destra 0\.5w/.test(relativo.largaTutta) && /VP1 destra 2w/.test(relativo.largaMezza), relativo);

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
      fughe: ov.querySelector('.prosp-fughe').textContent,
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
  ok('e legge l\'orizzonte a meta\' altezza', /^HL 50%$/.test(schermo.lettura), schermo.lettura);
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
    const testoPrima = document.querySelector('.prosp-oriz').textContent;
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
    const testoDopo = document.querySelector('.prosp-oriz').textContent;
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
    return { cEra, stretta, larga, tornata, lettura: document.querySelector('.prosp-fughe').textContent };
  });
  ok('la fuga cade davvero fuori dalla vignetta',
     /destra/.test(veduta.lettura), veduta.lettura);
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
    const invito = ov.querySelector('.prosp-oriz').textContent;
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
  ok('con la lettura riferita a quella', /^HL 50%$/.test(dalLettore.lettura), dalLettore.lettura);

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
    P.__perLeProveTraccia({ a:{x:0.05,y:0.10}, b:{x:0.95,y:0.18} });
    P.__perLeProveTraccia({ a:{x:0.05,y:0.40}, b:{x:0.95,y:0.32} });
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
     salvato.misure && salvato.misure.orizzonte === 50, salvato.misure);
  ok('e le fughe, anche loro in coordinate di vignetta',
     salvato.misure && salvato.misure.fughe.length === 1, salvato.misure);
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

  sezione('e con l\'orizzonte fuori dalla vignetta, lo studio lo dice lo stesso');
  // IL LIMITE TROVATO SUL CAMPO (15 settembre 2026): con l'orizzonte fuori dal
  // riquadro, nello studio salvato la riga d'oro non c'era proprio — restava
  // una vignetta con due linee azzurre e nessuna risposta. E per i casi
  // estremi (orizzonte a meno millecinquecento per cento, fuga a undici
  // larghezze) NESSUNA inquadratura potrebbe contenerla: li' il dato e' il
  // numero. Quindi due cure: si salva quello che si vede — allargando la
  // veduta entra anche la fuga — e sotto l'immagine si scrivono i numeri.
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
    // Prima si salva la vignetta sola, com'e' il caso normale.
    document.querySelector('.prosp-salva').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 900));
    // Poi la stessa cosa con la veduta allargata.
    P.apriProspettiva(window.__img, { salva: async d=>{ preso.push(d); } });
    P.__perLeProveRiquadro({ x:0.1, y:0.5, w:0.6, h:0.25 });
    P.__perLeProveTraccia({ a:{x:0.12,y:0.72}, b:{x:0.66,y:0.60} });
    P.__perLeProveTraccia({ a:{x:0.12,y:0.60}, b:{x:0.66,y:0.545} });
    P.adattaVeduta(true);
    await new Promise(r=> setTimeout(r, 60));
    document.querySelector('.prosp-salva').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 900));
    const leggi = async b=> new Promise(res=>{
      const im = new Image(); im.onload = ()=> res(im); im.src = URL.createObjectURL(b);
    });
    const stretta = await leggi(preso[0].blob), larga = await leggi(preso[1].blob);
    // Nell'immagine larga si va a cercare l'oro dell'orizzonte: se c'e', la
    // riga e' finita dentro davvero.
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
      stretta: { w: stretta.width, h: stretta.height, oro: cercaOro(stretta) },
      larga: { w: larga.width, h: larga.height, oro: cercaOro(larga) },
    };
  });
  ok('l\'orizzonte cade davvero sopra la vignetta',
     /\(sopra\)/.test(fuoriCampo.lettura), fuoriCampo.lettura);
  // Salvando la vignetta sola la riga d'oro non c'e': e' fuori, ed e' giusto
  // cosi' — quello che si vedeva a schermo era quello.
  ok('salvando la vignetta sola, la riga d\'oro non ci sta',
     fuoriCampo.stretta.oro < 200, fuoriCampo.stretta);
  // Allargando la veduta prima di salvare, invece, ci entra.
  ok('ma allargando la veduta prima di salvare, ci entra',
     fuoriCampo.larga.oro > 1000, fuoriCampo.larga);
  ok('e l\'immagine larga e\' piu\' alta di quella stretta',
     fuoriCampo.larga.h > fuoriCampo.stretta.h * 1.5, fuoriCampo);
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