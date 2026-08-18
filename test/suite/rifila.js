// Rifilare un frammento — togliere il superfluo da un'immagine già salvata
//
// Serve a una cosa che prima non si poteva fare: uno screenshot preso da un
// social arriva con dentro l'interfaccia del social (il nome, i cuoricini,
// mezzo post sotto), e quando lo salvi non hai un ritaglio da fare — hai solo
// un'immagine che ti è piaciuta. Il superfluo lo vedi dopo.
//
// Qui si prova la parte che può fare danni: il conto che traduce un riquadro
// disegnato col dito in pixel dell'originale, e il fatto che rifilare
// SOSTITUISCA l'immagine senza portarsi via il resto — cartella, tag, progetti
// collegati — e che si possa tornare indietro.
const { suite } = require('../motore.js');

module.exports = () => suite("Rifilare un frammento — via il superfluo, senza perdere il resto", {
  banco: '/test/banco/tavole.html',
}, async ({ page, ok, sezione }) => {

  const apri = async ()=>{
    await page.evaluate(async ()=>{
      window.semina(2, 1);
      // Il frammento di prova si porta dietro tutto quello che NON deve
      // cambiare rifilandolo.
      const r = window.refs.getRefs().find(x=>x.id==='r0');
      r.tags = ['mani']; r.projectIds = ['p1']; r.projectId = 'p1';
      window.refs.openFolder('F1');
      window.__scritture = []; window.__caricamenti = [];
      const m = await import('/js/rifila.js');
      window.rifila = m;
      m.apriRifila('r0');
      await new Promise(r=>setTimeout(r, 400));
    });
  };
  // DOVE STA DAVVERO L'IMMAGINE. L'elemento <img> riempie tutto il foglio, ma
  // il disegno dentro e' rimpicciolito e centrato (object-fit:contain): il
  // riquadro va confrontato con QUELLO, non col rettangolo dell'elemento, se
  // no si misura mezzo schermo nero insieme all'immagine.
  const dipinta = `(()=>{
    const img = document.getElementById('rifila-img');
    const rl = document.getElementById('rifila-layer').getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const s = Math.min(ir.width / img.naturalWidth, ir.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    return { x: (ir.left - rl.left) + (ir.width - w)/2, y: (ir.top - rl.top) + (ir.height - h)/2, w, h, s };
  })()`;
  const geometria = ()=> page.evaluate(`(()=>{
    const layer = document.getElementById('rifila-layer');
    const box = document.getElementById('rifila-box');
    const img = document.getElementById('rifila-img');
    const rl = layer.getBoundingClientRect(), rb = box.getBoundingClientRect();
    const dip = ${dipinta};
    return {
      img: dip,
      box: { x: rb.left - rl.left, y: rb.top - rl.top, w: rb.width, h: rb.height },
      naturale: { w: img.naturalWidth, h: img.naturalHeight },
      aperto: !document.getElementById('rifila').hidden,
    };
  })()`);
  // Trascina una maniglia (o il corpo del riquadro) come farebbe un dito.
  const tira = async (angolo, dx, dy)=> page.evaluate(([a,dx,dy])=>{
    const box = document.getElementById('rifila-box');
    const el = a ? box.querySelector(`[data-angolo="${a}"]`) : box;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const ev = (t, cx, cy)=> new PointerEvent(t, {bubbles:true, cancelable:true, clientX:cx, clientY:cy, pointerId:1});
    el.dispatchEvent(ev('pointerdown', x, y));
    for(let i=1;i<=4;i++) window.dispatchEvent(ev('pointermove', x + dx*i/4, y + dy*i/4));
    window.dispatchEvent(ev('pointerup', x + dx, y + dy));
  }, [angolo, dx, dy]);

  sezione('il foglio si apre sull\'immagine, col riquadro già pronto');
  await apri();
  const g = await geometria();
  ok('il foglio è aperto', g.aperto, g);
  ok('l\'immagine è quella del frammento, a schermo intera', g.naturale.w > 0 && g.img.w > 0, g);
  // Si parte da quasi tutta l'immagine: quasi sempre si toglie una cornice, e
  // così bastano due angoli da tirare invece di ridisegnare tutto.
  ok('il riquadro parte largo quasi quanto l\'immagine',
     g.box.w > g.img.w * 0.8 && g.box.h > g.img.h * 0.8, g);
  ok('e sta tutto dentro l\'immagine, non sul fondo nero',
     g.box.x >= g.img.x - 1 && g.box.y >= g.img.y - 1 &&
     g.box.x + g.box.w <= g.img.x + g.img.w + 1 &&
     g.box.y + g.box.h <= g.img.y + g.img.h + 1, g);

  sezione('gli angoli lo stringono, e non lo lasciano uscire');
  const prima = await geometria();
  await tira('se', -40, -40);
  const stretto = await geometria();
  ok('tirando l\'angolo in basso a destra il riquadro si stringe',
     stretto.box.w < prima.box.w - 20 && stretto.box.h < prima.box.h - 20,
     { prima: prima.box, stretto: stretto.box });
  ok('e l\'angolo opposto resta fermo dov\'era',
     Math.abs(stretto.box.x - prima.box.x) < 2 && Math.abs(stretto.box.y - prima.box.y) < 2,
     { prima: prima.box, stretto: stretto.box });

  // Tirare oltre il bordo non deve far sbordare il riquadro: fuori non c'è
  // niente da ritagliare, e un rettangolo che sborda darebbe un frammento con
  // una fascia vuota su un lato.
  await tira('nw', -600, -600);
  const largo = await geometria();
  ok('spingendo un angolo fuori dall\'immagine il riquadro si ferma al bordo',
     largo.box.x >= largo.img.x - 1 && largo.box.y >= largo.img.y - 1, largo);
  await tira(null, 600, 600);
  const spinto = await geometria();
  ok('e trascinandolo via non esce dall\'altra parte',
     spinto.box.x + spinto.box.w <= spinto.img.x + spinto.img.w + 1 &&
     spinto.box.y + spinto.box.h <= spinto.img.y + spinto.img.h + 1, spinto);

  sezione('e il tasto Indietro del telefono chiude il foglio');
  // Senza, Indietro riporterebbe indietro la schermata SOTTO il foglio, che
  // resterebbe li' con un ritaglio a meta' addosso.
  const indietro = await page.evaluate(async ()=>{
    history.back();
    await new Promise(r=>setTimeout(r, 300));
    return { aperto: !document.getElementById('rifila').hidden,
             griglia: document.getElementById('screen-refs').classList.contains('active') };
  });
  ok('il foglio si chiude', !indietro.aperto, indietro);
  await apri();

  sezione('confermando, il frammento diventa quello ritagliato');
  const dopo = await page.evaluate(async ()=>{
    // Un riquadro netto, un quarto dell'immagine in alto a sinistra: così si
    // può controllare che i pixel ritagliati siano quelli e non altri.
    const box = document.getElementById('rifila-box');
    const dip = window.__dipinta();
    box.style.left = dip.x + 'px';
    box.style.top = dip.y + 'px';
    box.style.width = (dip.w / 2) + 'px';
    box.style.height = (dip.h / 2) + 'px';
    await window.rifila.confermaRifila();
    await new Promise(r=>setTimeout(r, 400));
    return {
      scritture: (window.__scritture||[]).slice(),
      caricamenti: (window.__caricamenti||[]).slice(),
      aperto: !document.getElementById('rifila').hidden,
      annulla: window.__undo ? window.__undo.label : '',
    };
  });
  ok('il foglio si chiude da solo', !dopo.aperto, dopo.aperto);
  ok('l\'immagine ritagliata viene caricata', dopo.caricamenti.length === 1, dopo.caricamenti);
  ok('ed è un\'immagine vera, con un peso', dopo.caricamenti[0].peso > 0, dopo.caricamenti);
  ok('si scrive sul frammento che c\'era, non se ne crea un altro',
     dopo.scritture.length === 1 && dopo.scritture[0].id === 'r0'
     && dopo.scritture[0].col === 'refs', dopo.scritture);
  const campi = dopo.scritture[0] ? Object.keys(dopo.scritture[0].data).sort() : [];
  ok('e si tocca SOLO l\'immagine: cartella, tag e progetti non si sfiorano',
     campi.join(',') === 'bytes,h,url,w', campi);
  ok('l\'indirizzo è nuovo, se no a schermo resterebbe quella vecchia',
     /finto\.cloudinary/.test(dopo.scritture[0].data.url || ''), dopo.scritture[0].data);
  // Metà per metà: il ritaglio deve essere circa un quarto dell'originale.
  const misura = await page.evaluate((d)=>{
    const r = window.refs.getRefs().find(x=>x.id==='r0');
    return { largo: d.w, alto: d.h, originale: { w:r.w, h:r.h } };
  }, dopo.scritture[0].data);
  ok('il ritaglio è grande quanto il riquadro che hai tirato',
     Math.abs(misura.largo - misura.originale.w/2) <= 2 &&
     Math.abs(misura.alto - misura.originale.h/2) <= 2, misura);
  ok('e compare l\'Annulla, perché una rifilatura si può sbagliare',
     /ritagliato/i.test(dopo.annulla), dopo);

  sezione('e annullando torna l\'immagine di prima');
  const tornato = await page.evaluate(async ()=>{
    const r = window.refs.getRefs().find(x=>x.id==='r0');
    const urlVecchia = r.url;
    window.__scritture = [];
    await window.__undo.fn();
    await new Promise(r=>setTimeout(r, 300));
    return { scritture: (window.__scritture||[]).slice(), urlVecchia };
  });
  ok('si riscrive l\'indirizzo di prima sullo stesso frammento',
     tornato.scritture.length === 1 && tornato.scritture[0].id === 'r0' &&
     tornato.scritture[0].data.url === tornato.urlVecchia, tornato);
  ok('e nient\'altro viene toccato nemmeno tornando indietro',
     Object.keys(tornato.scritture[0].data).sort().join(',') === 'bytes,h,url,w',
     Object.keys(tornato.scritture[0].data));

  sezione('un riquadro grande come niente non si ritaglia');
  const minuscolo = await page.evaluate(async ()=>{
    window.rifila.apriRifila('r1');
    await new Promise(r=>setTimeout(r, 400));
    const box = document.getElementById('rifila-box');
    box.style.width = '1px'; box.style.height = '1px';
    window.__scritture = [];
    // NON si aspetta: qui l'app apre un foglio che sta li' finche' non lo
    // tocchi, e aspettarlo vorrebbe dire aspettare per sempre.
    window.rifila.confermaRifila();
    await new Promise(r=>setTimeout(r, 400));
    const modale = (document.querySelector('.modal-overlay.open .modal-nota')||{}).textContent || '';
    const chiudi = document.querySelector('.modal-overlay.open #ink-confirm-ok');
    if(chiudi) chiudi.click();
    await new Promise(r=>setTimeout(r, 200));
    return { scritture: (window.__scritture||[]).length, modale,
             aperto: !document.getElementById('rifila').hidden };
  });
  ok('non si scrive niente', minuscolo.scritture === 0, minuscolo);
  ok('e lo si dice, invece di non fare niente', /troppo piccolo/i.test(minuscolo.modale), minuscolo);
  ok('il foglio resta aperto, così si può rimediare', minuscolo.aperto, minuscolo);

});
