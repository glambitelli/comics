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
  ok('e dice la sua altezza in percentuale', /al 20%/.test(lettura.unaSola), lettura.unaSola);
  // Non basta il numero: "20%" da solo non dice se e' tanto o poco. La parola
  // accanto e' quella che si porta via studiando dieci tavole di fila.
  ok('con una parola che lo qualifica', /alto/.test(lettura.unaSola), lettura.unaSola);
  ok('un orizzonte quasi a terra lo dice', /a terra/.test(lettura.terra), lettura.terra);
  // IL CASO DI OTOMO: l'orizzonte fuori dalla vignetta. Un numero negativo
  // buttato li' non vorrebbe dire niente.
  ok('e uno fuori dalla vignetta lo dice a parole',
     /SOPRA la vignetta/.test(lettura.sopra), lettura.sopra);
  ok('con due fughe l\'orizzonte si inclina, invece di restare dritto',
     lettura.inclinato, lettura);
  // E L'ALTEZZA SI MISURA AL CENTRO DELLA VIGNETTA. Con l'orizzonte inclinato
  // "l'altezza" non e' un numero solo: misurata su un bordo direbbe una cosa,
  // sull'altro un'altra, e nessuna delle due e' quella di cui si parla
  // guardando una tavola. Le due fughe qui stanno al 30% e al 50%, a distanza
  // uguale dal centro: al centro fanno 40%.
  ok('e la sua altezza si legge al centro, non su un bordo',
     /al 40%/.test(lettura.due), lettura.due);
  ok('la fuga dentro la tavola si riconosce', /dentro la tavola/.test(lettura.dentro), lettura.dentro);
  // Quante larghezze: e' la misura di quanto e' "lunga" la scena, ed e' la
  // ragione per cui la fuga fuori campo interessa.
  ok('e quella fuori dice da che parte e di quanto',
     /fuori a destra, 1\.4 larghezze/.test(lettura.destra), lettura.destra);
  ok('anche a sinistra', /fuori a sinistra, 1\.2 larghezze/.test(lettura.sinistra), lettura.sinistra);

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
  ok('e legge l\'orizzonte a meta\' altezza', /al 50%/.test(schermo.lettura), schermo.lettura);
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

  sezione('si pulisce, si torna indietro, si chiude');
  const comandi = await page.evaluate(async ()=>{
    const P = window.P;
    const ov = document.getElementById('prospettiva');
    const premi = a=> ov.querySelector('[data-act="'+a+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    premi('indietro');
    const dopoIndietro = P.__perLeProve().linee.length;
    premi('pulisci');
    const dopoPulisci = P.__perLeProve().linee.length;
    const invito = ov.querySelector('.prosp-oriz').textContent;
    premi('esci');
    await new Promise(r=> setTimeout(r, 50));
    return { dopoIndietro, dopoPulisci, invito, aperto: P.prospettivaAperta(),
             classe: document.body.classList.contains('prosp-aperta') };
  });
  ok('"Togli l\'ultima" ne toglie una sola', comandi.dopoIndietro === 1, comandi);
  ok('"Pulisci" le toglie tutte', comandi.dopoPulisci === 0, comandi);
  // Tornata vuota, la barra torna a dire cosa fare: senza, resterebbe l'ultima
  // lettura sotto uno schema che non c'e' piu'.
  ok('e la barra torna a spiegare come si comincia',
     /due linee/i.test(comandi.invito), comandi.invito);
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
  ok('con la lettura riferita a quella', /al 50%/.test(dalLettore.lettura), dalLettore.lettura);

  sezione('e chiudendo l\'albo lo schema non resta appeso sul nulla');
  const chiusura = await page.evaluate(async ()=>{
    window.albums.closeReaderUI();
    await new Promise(r=> setTimeout(r, 300));
    return { aperto: window.P.prospettivaAperta() };
  });
  ok('chiuso il lettore, si chiude anche lo studio', !chiusura.aperto, chiusura);
});