// References — i due scaffali di una cartella: Ritagli e Tavole
const { suite } = require('../motore.js');

module.exports = () => suite("References — Ritagli e Tavole dentro una cartella", {"banco": "/test/banco/tavole.html"}, async ({ page, base, ok, sezione }) => {

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
      cerca: (document.getElementById('refs-grid-search-input')||{}).placeholder,
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
  ok('e la ricerca cambia etichetta', /tavole/i.test(s.cerca||''), s);

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

  sezione('la ricerca non si porta dietro il filtro dell\'altro scaffale');
  await page.evaluate(()=> window.refs.refsGridSearch('pagina 1'));
  await page.waitForTimeout(250);
  const filtrate = await stato();
  await tocca('ritagli');
  s = await stato();
  ok('cambiando tab il campo di ricerca si svuota',
     !(await page.evaluate(()=>document.getElementById('refs-grid-search-input').value)), s);
  ok('e si rivedono tutti i ritagli', s.inGriglia.length === 3, { s, filtrate });

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
  const vociRitaglio = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.body, 'r1');
    return Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent);
  });
  await page.evaluate(()=> document.body.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(150);
  const vociTavola = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.body, 't0');
    return Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent);
  });
  ok('su un ritaglio propone di spostarlo fra le tavole',
     vociRitaglio.some(v=>/fra le tavole/i.test(v)), vociRitaglio);
  ok('su una tavola propone il contrario',
     vociTavola.some(v=>/fra i ritagli/i.test(v)), vociTavola);

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

});
