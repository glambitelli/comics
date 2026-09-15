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
  ok('e dice la sua altezza in percentuale', /20% dall'alto/.test(lettura.unaSola), lettura.unaSola);
  // NIENTE AGGETTIVI. La prima versione appiccicava al numero una parola —
  // "altissimo", "a terra", "a meta' altezza" — e Giovanni le ha trovate
  // sciocche, giustamente: davanti a una tavola di Otomo "20%" e' un dato,
  // "altissimo" e' un giudizio che uno si fa da solo. Qui si misura e basta.
  ok('senza aggettivi appiccicati sopra',
     !/altissim|a terra|a metà|basso/i.test(lettura.unaSola + lettura.terra), lettura);
  // IL CASO DI OTOMO: l'orizzonte fuori dalla vignetta. Il numero da solo
  // (negativo, o sopra cento) lascerebbe il dubbio che sia un errore.
  ok('e uno fuori dalla vignetta lo dice, col segno e da che parte',
     /-30%/.test(lettura.sopra) && /sopra la vignetta/.test(lettura.sopra), lettura.sopra);
  ok('con due fughe l\'orizzonte si inclina, invece di restare dritto',
     lettura.inclinato, lettura);
  // E L'ALTEZZA SI MISURA AL CENTRO DELLA VIGNETTA. Con l'orizzonte inclinato
  // "l'altezza" non e' un numero solo: misurata su un bordo direbbe una cosa,
  // sull'altro un'altra, e nessuna delle due e' quella di cui si parla
  // guardando una tavola. Le due fughe qui stanno al 30% e al 50%, a distanza
  // uguale dal centro: al centro fanno 40%.
  ok('e la sua altezza si legge al centro, non su un bordo',
     /40% dall'alto/.test(lettura.due), lettura.due);
  ok('la fuga dentro la vignetta si riconosce', /Fuga 1 dentro/.test(lettura.dentro), lettura.dentro);
  // Quante larghezze: e' la misura di quanto e' "lunga" la scena, ed e' la
  // ragione per cui la fuga fuori campo interessa.
  ok('e quella fuori dice da che parte e di quanto',
     /fuori a destra, 1\.4 larghezze/.test(lettura.destra), lettura.destra);
  ok('anche a sinistra', /fuori a sinistra, 1\.2 larghezze/.test(lettura.sinistra), lettura.sinistra);

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
  ok('sulla pagina intera legge il 25%', /25% dall'alto/.test(relativo.pagina), relativo.pagina);
  ok('ma dentro una vignetta in cima e\' molto piu\' in basso',
     /67% dall'alto/.test(relativo.alta), relativo.alta);
  ok('e per una vignetta di meta\' pagina cade sopra di lei',
     /-50%/.test(relativo.bassa) && /sopra/.test(relativo.bassa), relativo.bassa);
  ok('le larghezze di distanza si contano sulla vignetta, non sulla tavola',
     /0\.5 larghezze/.test(relativo.largaTutta) && /2 larghezze/.test(relativo.largaMezza), relativo);

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
    const r = window.__img.getBoundingClientRect();
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
  ok('e legge l\'orizzonte a meta\' altezza', /50% dall'alto/.test(schermo.lettura), schermo.lettura);
  ok('il fascio c\'e\'', schermo.raggi === 12, schermo);
  ok('e la fuga e\' segnata con un punto', schermo.punti === 2, schermo);
  // Senza il taglio, il ventaglio si stenderebbe su tutta la finestra: col
  // mouse, dove la tavola sta al centro fra due fasce scure, diventerebbe uno
  // scarabocchio rosa intorno all'immagine invece che una prospettiva dentro.
  ok('il fascio e l\'orizzonte stanno dentro la tavola',
     schermo.clipSuImmagine
     && /prosp-clip/.test(schermo.orizzonteTagliato || '')
     && /prosp-clip/.test(schermo.fascioTagliato || ''), schermo);
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
    const r = window.__img.getBoundingClientRect();
    const tocco = (tipo, u, v)=> svg.dispatchEvent(new PointerEvent(tipo, {
      pointerId: 9, clientX: r.left + u*r.width, clientY: r.top + v*r.height,
      bubbles:true, cancelable:true }));
    P.apriProspettiva(window.__img);
    const primaDelRiquadro = P.faseRiquadro();
    const testoPrima = document.querySelector('.prosp-oriz').textContent;
    // Un riquadro grande come un francobollo non e' una vignetta.
    tocco('pointerdown', 0.4, 0.4); tocco('pointermove', 0.42, 0.42); tocco('pointerup', 0.42, 0.42);
    const dopoIlFrancobollo = P.faseRiquadro();
    // Questo invece si: la vignetta in alto, un terzo di pagina.
    tocco('pointerdown', 0.1, 0.05); tocco('pointermove', 0.9, 0.35); tocco('pointerup', 0.9, 0.35);
    const riq = P.__perLeProve().riquadro;
    const dopo = P.faseRiquadro();
    const testoDopo = document.querySelector('.prosp-oriz').textContent;
    // E adesso lo stesso gesto traccia una linea, non un altro rettangolo.
    tocco('pointerdown', 0.2, 0.2); tocco('pointermove', 0.8, 0.28); tocco('pointerup', 0.8, 0.28);
    const linee = P.__perLeProve().linee.length;
    const velo = document.querySelector('.prosp-velo').getAttribute('d');
    return { primaDelRiquadro, testoPrima, dopoIlFrancobollo, riq, dopo, testoDopo, linee,
             veloAcceso: !!velo };
  });
  ok('appena aperto, si aspetta la vignetta', riquadro.primaDelRiquadro, riquadro);
  ok('e lo dice', /riquadra la vignetta/i.test(riquadro.testoPrima), riquadro.testoPrima);
  ok('un rettangolo minuscolo non conta come vignetta', riquadro.dopoIlFrancobollo, riquadro);
  ok('trascinando si riquadra davvero',
     !riquadro.dopo && Math.abs(riquadro.riq.x - 0.1) < 0.02
     && Math.abs(riquadro.riq.h - 0.30) < 0.02, riquadro.riq);
  // Fuori dalla vignetta si scurisce: la pagina resta visibile — serve a
  // capire dove sta l'inquadratura — ma smette di contendere l'attenzione.
  ok('e intorno la pagina si scurisce', riquadro.veloAcceso, riquadro);
  ok('da li\' in poi si chiedono le linee', /due linee/i.test(riquadro.testoDopo), riquadro.testoDopo);
  ok('e lo stesso trascinamento adesso traccia una linea', riquadro.linee === 1, riquadro);

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
    const rImg = centrale.getBoundingClientRect();
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
  ok('e lo studio si aggancia alla tavola che si sta guardando',
     dalLettore.suQuellaTavola, dalLettore);
  ok('con la lettura riferita a quella', /50% dall'alto/.test(dalLettore.lettura), dalLettore.lettura);

  sezione('e chiudendo l\'albo lo schema non resta appeso sul nulla');
  const chiusura = await page.evaluate(async ()=>{
    window.albums.closeReaderUI();
    await new Promise(r=> setTimeout(r, 300));
    return { aperto: window.P.prospettivaAperta() };
  });
  ok('chiuso il lettore, si chiude anche lo studio', !chiusura.aperto, chiusura);
});