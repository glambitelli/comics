// References — i due scaffali di una cartella: Frammenti e Tavole
const { suite } = require('../motore.js');

module.exports = () => suite("References — Frammenti e Tavole dentro una cartella", {"banco": "/test/banco/tavole.html"}, async ({ page, base, ok, sezione }) => {

  const apri = async (ritagli, tavole)=>{
    await page.evaluate(([r,t])=>{ window.semina(r,t); window.refs.openFolder('F1'); }, [ritagli, tavole]);
    await page.waitForTimeout(300);
  };
  const stato = ()=> page.evaluate(()=>{
    const n = id => (document.getElementById(id)||{}).textContent;
    const attivo = ['albi','ritagli','tavole'].find(t=>
      (document.getElementById('refs-tab-'+t)||{classList:{contains:()=>false}}).classList.contains('active'));
    return {
      albiN: n('refs-tab-albi-n'), ritagliN: n('refs-tab-ritagli-n'), tavoleN: n('refs-tab-tavole-n'),
      attivo,
      tabVisibili: document.getElementById('refs-tabs').classList.contains('show'),
      inGriglia: Array.from(document.querySelectorAll('.refs-thumb')).map(e=>e.dataset.id),
      vuotoVisibile: getComputedStyle(document.getElementById('refs-empty')).display !== 'none',
      vuotoTitolo: (document.querySelector('#refs-empty div:not(.refs-empty-sub)')||{}).textContent,
    };
  });
  const tocca = async tab=>{
    await page.evaluate(t=> document.getElementById('refs-tab-'+t)
      .dispatchEvent(new MouseEvent('click',{bubbles:true})), tab);
    await page.waitForTimeout(300);
  };

  sezione('una cartella con tre ritagli e tre tavole');
  await apri(3, 3);
  let s = await stato();
  ok('i tab si vedono dentro una cartella', s.tabVisibili, s);
  ok('c\'è un tab Tavole col suo numero', s.tavoleN === '3', s);
  ok('e i ritagli sono contati a parte, senza le tavole', s.ritagliN === '3', s);
  ok('si apre sui ritagli', s.attivo === 'ritagli', s);
  ok('e in griglia ci sono solo quelli', s.inGriglia.every(id=>id[0]==='r') && s.inGriglia.length === 3, s);

  sezione('passando a Tavole');
  await tocca('tavole');
  s = await stato();
  ok('il tab diventa attivo', s.attivo === 'tavole', s);
  ok('in griglia ci sono solo le tavole', s.inGriglia.every(id=>id[0]==='t') && s.inGriglia.length === 3, s);

  sezione('la miniatura di una tavola mostra la pagina INTERA');
  // La misura vera: il rapporto fra i lati dell'immagine a schermo deve essere
  // quello dell'originale. Se la griglia la ritagliasse (object-fit:cover) il
  // rapporto diventerebbe quello della tessera, e la prima e l'ultima striscia
  // di vignette sparirebbero.
  const forma = await page.evaluate(()=>{
    const el = document.querySelector('.refs-thumb');
    const im = el.querySelector('img');
    const rt = el.getBoundingClientRect(), ri = im.getBoundingClientRect();
    return {
      classe: document.getElementById('refs-grid').classList.contains('tavole'),
      tessera: +(rt.width / rt.height).toFixed(3),
      immagine: +(ri.width / ri.height).toFixed(3),
      naturale: +(im.naturalWidth / im.naturalHeight).toFixed(3),
      dentro: ri.width <= rt.width + 1 && ri.height <= rt.height + 1,
      larga: Math.round(rt.width),
      // Quanto è stata chiesta larga la sorgente (vedi test/finti/cloudinary.js).
      sorgente: (window.__larghezze || new Map()).get(im.getAttribute('src')),
    };
  });
  ok('la griglia passa in modalità tavole', forma.classe, forma);
  ok('la tessera è verticale, non quadrata', forma.tessera < 0.85, forma);
  ok('l\'immagine conserva le sue proporzioni: niente è tagliato via',
     Math.abs(forma.immagine - forma.naturale) < 0.02, forma);
  ok('e sta tutta dentro la tessera', forma.dentro, forma);
  ok('la tessera è abbastanza grande da leggerci una pagina', forma.larga >= 96, forma);

  sezione('e non le resta attorno nessun filo di fondo');
  // Tre tavole di forma diversa (manga, albo, doppia orizzontale): ognuna deve
  // riempire la SUA tessera esattamente. Se la tessera avesse una forma fissa,
  // due delle tre lascerebbero scoperte due strisce di sfondo — il "bordino"
  // che si vedeva sul telefono.
  const bordi = await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-thumb')).map(el=>{
    const im = el.querySelector('img');
    const rt = el.getBoundingClientRect(), ri = im.getBoundingClientRect();
    const st = getComputedStyle(el);
    // Il bordo bianco della tessera è voluto e non c'entra: si confronta col
    // riquadro interno, quello che l'immagine deve riempire tutto.
    const b = parseFloat(st.borderLeftWidth) || 0;
    return {
      naturale: +(im.naturalWidth / im.naturalHeight).toFixed(3),
      scoperto: Math.round(Math.max((rt.width - 2*b) - ri.width, (rt.height - 2*b) - ri.height)),
    };
  }));
  const forme = [...new Set(bordi.map(b=>b.naturale))];
  ok('le tavole di prova hanno forme diverse fra loro', forme.length >= 3, forme);
  ok('nessuna lascia scoperto un filo di sfondo',
     bordi.every(b=> b.scoperto <= 1), bordi);

  sezione('e la chiede a Cloudinary più grande di un quadratino');
  ok('la sorgente della tavola è a 420px', forma.sorgente === 420, forma);
  await tocca('ritagli');
  const formaR = await page.evaluate(()=>{
    const el = document.querySelector('.refs-thumb');
    const im = el.querySelector('img');
    const rt = el.getBoundingClientRect();
    return {
      classe: document.getElementById('refs-grid').classList.contains('tavole'),
      tessera: +(rt.width / rt.height).toFixed(3),
      sorgente: (window.__larghezze || new Map()).get(im.getAttribute('src')),
    };
  });
  ok('tornando fra i ritagli la tessera ridiventa quadrata',
     !formaR.classe && Math.abs(formaR.tessera - 1) < 0.02, formaR);
  ok('e la sorgente torna quella piccola', formaR.sorgente === 300, formaR);
  await tocca('tavole');

  sezione('sopra le immagini non c\'e\' piu\' niente da scavalcare');
  // Si entra in una cartella per vedere le IMMAGINI, e prima fra il nome e la
  // prima miniatura c'erano una riga col solo pulsante "Ordina" e un riquadro
  // che spiega come trascinare un file e incollare con ⌘V — due gesti che sul
  // telefono non esistono nemmeno. Ordina e' salito nella riga del nome,
  // l'avviso resta solo su schermo grande.
  const barra = await page.evaluate(()=>{
    document.body.classList.add('is-touch');
    const griglia = document.getElementById('refs-grid').getBoundingClientRect();
    const tabs = document.getElementById('refs-tabs').getBoundingClientRect();
    const ordina = document.getElementById('refs-crumb-sort');
    return {
      campo: !!document.getElementById('refs-grid-search-input'),
      barraSopra: !!document.querySelector('#refs-images-pane .refs-toolbar'),
      avviso: getComputedStyle(document.querySelector('.refs-drop-hint')).display,
      ordinaNelNome: !!(ordina && !ordina.hidden &&
                        ordina.closest('#refs-breadcrumb')),
      // Le miniature cominciano subito sotto i tab: niente in mezzo.
      distanza: Math.round(griglia.top - tabs.bottom),
    };
  });
  ok('il campo di ricerca non c\'e\' (un ritaglio non ha un nome da ricordare)',
     !barra.campo, barra);
  ok('e nemmeno la riga con il solo "Ordina"', !barra.barraSopra, barra);
  ok('l\'avviso "trascina qui" sul telefono non compare',
     barra.avviso === 'none', barra);
  ok('"Ordina" e\' nella riga del nome cartella', barra.ordinaNelNome, barra);
  ok('e le immagini cominciano subito sotto i tab',
     barra.distanza >= 0 && barra.distanza < 30, barra);

  sezione('ma sullo scaffale degli albi quel pulsante si toglie di mezzo');
  // Li' la griglia non e' a schermo, e lo scaffale ha il suo ordinamento
  // accanto alla ricerca: due "Ordina" nella stessa schermata direbbero di
  // ordinare due cose diverse senza dire quale.
  await tocca('albi');
  const suGliAlbi = await page.evaluate(()=>({
    nascosto: document.getElementById('refs-crumb-sort').hidden,
    quelloDegliAlbi: !!document.querySelector('#refs-albums-pane .refs-sort-btn'),
  }));
  ok('nella riga del nome sparisce', suGliAlbi.nascosto, suGliAlbi);
  ok('e resta solo quello degli albi', suGliAlbi.quelloDegliAlbi, suGliAlbi);
  await tocca('tavole');
  await tocca('ritagli');
  s = await stato();
  ok('e si vedono tutti i ritagli', s.inGriglia.length === 3, s);

  sezione('una cartella senza tavole');
  await apri(2, 0);
  await tocca('tavole');
  s = await stato();
  ok('il tab c\'è lo stesso, a zero', s.tavoleN === '0', s);
  ok('e il vuoto spiega DA DOVE arrivano le tavole',
     s.vuotoVisibile && /nessuna tavola/i.test(s.vuotoTitolo||''), s);

  sezione('una cartella di sole tavole si apre già sulle tavole');
  await apri(0, 3);
  s = await stato();
  ok('non sbatte in faccia un tab vuoto', s.attivo === 'tavole', s);
  ok('e le mostra tutte', s.inGriglia.length === 3, s);

  sezione('spostare a mano un\'immagine fra i due scaffali');
  await apri(2, 1);
  const scritta = await page.evaluate(()=>{
    window.__scritture = [];
    window.refs.setRefTavola('r0', true);
    return window.__scritture[0];
  });
  ok('si scrive il campo giusto sul documento giusto',
     scritta && scritta.col === 'refs' && scritta.id === 'r0' && scritta.data.tavola === true, scritta);
  // Nell'app l'eco arriva dal listener di Firestore; qui la si applica a mano.
  await page.evaluate(()=>{
    window.refs.getRefs().find(r=>r.id==='r0').tavola = true;
    window.refs.renderRefsScreen();
  });
  await page.waitForTimeout(250);
  const dopo = await page.evaluate(()=>({
    ritagliN: document.getElementById('refs-tab-ritagli-n').textContent,
    tavoleN: document.getElementById('refs-tab-tavole-n').textContent,
    inGriglia: Array.from(document.querySelectorAll('.refs-thumb')).map(e=>e.dataset.id),
  }));
  ok('il ritaglio promosso sparisce dai ritagli', !dopo.inGriglia.includes('r0'), dopo);
  ok('e i due numeri si aggiornano insieme',
     dopo.ritagliN === '1' && dopo.tavoleN === '2', dopo);

  sezione('il menu del tocco prolungato offre il verso giusto');
  // Ogni menu si ancora alla SUA miniatura, come farebbe un dito: due menu di
  // fila sullo stesso identico punto di partenza, a mezzo secondo di distanza,
  // ora vengono riconosciuti come una doppia apertura e il secondo ignorato
  // (vedi actionMenu in dialogs.js — e' la cura al lampeggio su Android).
  const vociRitaglio = await page.evaluate(async ()=>{
    const el = document.querySelector('.refs-thumb[data-id="r1"]') || document.body;
    await window.refsImageMenu(el, 'r1');
    return Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent);
  });
  await page.evaluate(()=> document.body.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(150);
  const vociTavola = await page.evaluate(async ()=>{
    const el = document.querySelector('.refs-thumb[data-id="t0"]') || document.body;
    await window.refsImageMenu(el, 't0');
    return Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent);
  });
  ok('su un frammento propone di segnarlo come tavola',
     vociRitaglio.some(v=>/come tavola/i.test(v)), vociRitaglio);
  ok('su una tavola propone il contrario',
     vociTavola.some(v=>/come frammento/i.test(v)), vociTavola);
  // E le due voci che sembravano la stessa cosa adesso dicono dove portano:
  // una cambia cartella, l'altra cambia scaffale.
  ok('e l\'altra voce dice chiaro che cambia CARTELLA, non scaffale',
     vociTavola.some(v=>/cambia cartella/i.test(v)) &&
     !vociTavola.some(v=>/^sposta$/i.test(v.trim())), vociTavola);

  // A schermo intero la catenella per collegare a un progetto sta gia' nella
  // pastiglia in basso: ripeterla nel menu accanto faceva sembrare due cose
  // diverse. Sulla griglia invece la catenella non c'e' e la voce deve restare.
  await page.evaluate(()=> document.body.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(150);
  const vociLightbox = await page.evaluate(async ()=>{
    window.refs.openRefLightbox('r1');
    await new Promise(r=>setTimeout(r,300));
    const piu = document.querySelector('#refs-lightbox .refs-lightbox-more');
    await window.refsImageMenu(piu);
    return { voci: Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent),
             catenella: !!document.getElementById('refs-lightbox-link'),
             forbici: !!document.getElementById('refs-lightbox-crop') };
  });
  ok('a schermo intero la catenella c\'e\'', vociLightbox.catenella, vociLightbox);
  ok('e il menu non la ripete',
     !vociLightbox.voci.some(v=>/collega a progetto/i.test(v)), vociLightbox.voci);
  ok('mentre tutto il resto resta raggiungibile',
     vociLightbox.voci.some(v=>/tag/i.test(v)) &&
     vociLightbox.voci.some(v=>/cambia cartella/i.test(v)) &&
     vociLightbox.voci.some(v=>/elimina/i.test(v)), vociLightbox.voci);
  ok('e dalla griglia invece la voce c\'e\', perche\' li\' la catenella non esiste',
     vociTavola.some(v=>/collega a progetto/i.test(v)), vociTavola);
  // Stessa storia per il ritaglio: a schermo intero e' un pulsante in barra
  // (come nel lettore degli albi), quindi nel menu accanto non si ripete.
  ok('il ritaglio e\' un pulsante in barra, non una voce da cercare',
     vociLightbox.forbici, vociLightbox);
  ok('e infatti il menu accanto non lo ripete',
     !vociLightbox.voci.some(v=>/ritaglia/i.test(v)), vociLightbox.voci);
  ok('mentre dalla griglia, dove il pulsante non c\'e\', la voce resta',
     vociTavola.some(v=>/ritaglia/i.test(v)), vociTavola);
  await page.evaluate(()=> window.refs.closeRefLightbox());
  await page.waitForTimeout(300);

  sezione('una tavola si collega a un progetto come un ritaglio qualunque');
  // Nulla di dedicato: ritagli e tavole passano dalla STESSA lightbox e dallo
  // stesso menu. La prova serve a impedire che una divisione fatta per come si
  // GUARDANO diventi per sbaglio una divisione di cosa si può FARCI.
  await apri(2, 2);
  await tocca('tavole');
  await page.evaluate(()=> window.openRefLightbox('t0'));
  await page.waitForTimeout(400);
  const inLightbox = await page.evaluate(()=>({
    id: document.getElementById('refs-lightbox').dataset.id,
    aperta: document.getElementById('refs-lightbox').classList.contains('open'),
    tastoCollega: !!document.getElementById('refs-lightbox-link'),
  }));
  ok('una tavola si apre a schermo intero', inLightbox.aperta && inLightbox.id === 't0', inLightbox);
  ok('e ha il pulsante per collegarla', inLightbox.tastoCollega, inLightbox);

  const vociTav = await page.evaluate(async ()=>{
    window.__scritture = [];
    await window.promptLinkProjectFromLightbox(document.getElementById('refs-lightbox-link'));
    return window.vociMenu();
  });
  ok('il menu elenca i progetti anche per una tavola',
     vociTav.some(v=>/Il Sentiero/.test(v)), vociTav);

  const legame = await page.evaluate(async ()=>{
    Array.from(document.querySelectorAll('.ink-action-menu button'))
      .find(b=>/Il Sentiero/.test(b.textContent))
      .dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return (window.__scritture||[]).find(s=>s.id === 't0');
  });
  ok('il collegamento si scrive sulla tavola',
     legame && legame.data && (legame.data.projectIds||[]).includes('p1'), legame);

  // Eco del listener, come sopra: qui interessa che il pannello del progetto
  // la mostri, non che Firestore risponda.
  const nelPannello = await page.evaluate(()=>{
    const t = window.refs.getRefs().find(r=>r.id==='t0');
    t.projectIds = ['p1']; t.projectId = 'p1';
    window.refs.renderProjectRefPanel('p1');
    window.refs.renderRefsScreen();
    return {
      miniature: document.querySelectorAll('#ref-panel-grid .ref-panel-thumb').length,
      conteggio: (document.getElementById('ref-panel-count')||{}).textContent,
      puntino: !!document.querySelector('.refs-thumb[data-id="t0"] .refs-thumb-linkdot'),
    };
  });
  ok('la tavola compare fra i riferimenti del progetto',
     nelPannello.miniature === 1 && nelPannello.conteggio === '1', nelPannello);
  ok('e in griglia porta il puntino del progetto come i ritagli',
     nelPannello.puntino, nelPannello);

  sezione('fuori da una cartella i tab non ci sono e si vede tutto');
  await page.evaluate(()=>{ window.semina(3,2); window.refs.openAllGrid(); });
  await page.waitForTimeout(300);
  s = await stato();
  ok('niente tab in "All"', !s.tabVisibili, s);
  ok('e ci sono ritagli e tavole insieme',
     s.inGriglia.length === 5 && s.inGriglia.some(i=>i[0]==='t') && s.inGriglia.some(i=>i[0]==='r'), s);

  sezione('i tre tab stanno in riga senza accavallarsi');
  await apri(3, 2);
  const righe = await page.evaluate(()=>{
    const b = ['albi','ritagli','tavole'].map(t=> document.getElementById('refs-tab-'+t).getBoundingClientRect());
    return {
      unaRiga: Math.abs(b[0].top - b[2].top) < 1,
      dentro: b[2].right <= window.innerWidth,
      separati: b[1].left >= b[0].right && b[2].left >= b[1].right,
      destra: Math.round(b[2].right), largo: window.innerWidth,
    };
  });
  ok('sono tutti e tre sulla stessa riga', righe.unaRiga, righe);
  ok('non escono dallo schermo', righe.dentro, righe);
  ok('e non si sovrappongono', righe.separati, righe);

  sezione('i tre scaffali sono lo stesso interruttore dei due assi');
  // Prima erano tre parole con una lineetta corallo sotto quella scelta: il
  // linguaggio dei titoli, mentre qui si sceglie uno scaffale fra tre. Adesso
  // e' il cursore bianco che scorre, identico a Artists/References.
  const leggiScaffali = ()=> page.evaluate(()=>{
    const vascaEl = document.getElementById('refs-tabs-vasca');
    const curEl = vascaEl.querySelector('.seg-cursore');
    const v = vascaEl.getBoundingClientRect(), c = curEl.getBoundingClientRect();
    const s = getComputedStyle(curEl);
    return {
      fondoVasca: getComputedStyle(vascaEl).backgroundColor,
      fondoCursore: s.backgroundColor, ombra: s.boxShadow,
      largoVasca: v.width, largoCursore: c.width, scarto: c.left - v.left,
      lineette: ['albi','ritagli','tavole'].map(t=>
        getComputedStyle(document.getElementById('refs-tab-'+t)).borderBottomWidth),
    };
  });
  await tocca('albi');
  const scaffali = await leggiScaffali();
  ok('nessuna lineetta sotto le parole',
     scaffali.lineette.every(l=> parseFloat(l) === 0), scaffali.lineette);
  ok('il cursore e\' bianco e appoggiato sopra',
     /254, 252, 248/.test(scaffali.fondoCursore) && !/inset/.test(scaffali.ombra), scaffali);
  ok('e largo un terzo di vaschetta, perche\' le voci sono tre',
     Math.abs(scaffali.largoCursore - (scaffali.largoVasca - 4)/3) < 1.5, scaffali);
  ok('sugli Albi sta tutto a sinistra', scaffali.scarto < 4, scaffali);
  await tocca('tavole');
  await page.waitForTimeout(400);
  const inFondo = await leggiScaffali();
  ok('e su Tavole arriva in fondo a destra',
     Math.abs(inFondo.scarto - (inFondo.largoVasca - 4) * 2/3) < 2, inFondo);

  sezione('e si passa da uno scaffale all\'altro anche col dito');
  // Lo stesso gesto dei due assi. Agli estremi ci si ferma: da Tavole uno
  // swipe in avanti non deve riportare agli Albi facendo sembrare di aver
  // sbagliato la direzione.
  const swipe = async (dx, dy=0)=> {
    await page.evaluate(([dx,dy])=>{
      const el = document.getElementById('refs-gallery-view');
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      const t = (cx,cy)=> [new Touch({identifier:1, target:el, clientX:cx, clientY:cy})];
      el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true, touches:t(x,y), changedTouches:t(x,y)}));
      el.dispatchEvent(new TouchEvent('touchend',{bubbles:true, touches:[], changedTouches:t(x+dx,y+dy)}));
    }, [dx,dy]);
    await page.waitForTimeout(300);
  };
  await tocca('albi');
  await swipe(-120);
  ok('uno swipe a sinistra porta ai Ritagli', (await stato()).attivo === 'ritagli', await stato());
  await swipe(-120);
  ok('un altro porta alle Tavole', (await stato()).attivo === 'tavole', await stato());
  await swipe(-120);
  ok('e da li\' in avanti non si va da nessuna parte', (await stato()).attivo === 'tavole', await stato());
  await swipe(120);
  ok('indietro si torna ai Ritagli', (await stato()).attivo === 'ritagli', await stato());
  // Scorrere l'elenco col pollice non fa mai linee dritte: un movimento
  // storto deve restare uno scorrimento, non diventare un cambio di scaffale.
  await swipe(-70, 60);
  ok('ma uno scorrimento in diagonale non cambia scaffale',
     (await stato()).attivo === 'ritagli', await stato());

  sezione('e sul telefono la X per chiudere non c\'e\'');
  // Stessa ragione del lettore: Indietro chiude la vista da sempre ed e' sotto
  // il pollice, mentre la X sta nell'angolo in alto e ruba un pezzo
  // dell'immagine che si e' aperta apposta per guardarla.
  const xLightbox = await page.evaluate(async ()=>{
    window.refs.openRefLightbox('r1');
    await new Promise(r=>setTimeout(r,300));
    const x = document.querySelector('.refs-lightbox-close');
    document.body.classList.add('is-touch');
    const conDito = getComputedStyle(x).display;
    document.body.classList.remove('is-touch');
    const colMouse = getComputedStyle(x).display;
    window.refs.closeRefLightbox();
    return { conDito, colMouse };
  });
  ok('col dito la X sparisce', xLightbox.conDito === 'none', xLightbox);
  ok('col mouse resta', xLightbox.colMouse !== 'none', xLightbox);

});
