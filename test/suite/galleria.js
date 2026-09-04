// Galleria References — nastro e gesti
const { suite } = require('../motore.js');

// Come il browser normalizza il transform del nastro fermo: una cella
// spostata a sinistra, cioè quella centrale in vista.
const REST = 'translate3d(-100%, 0px, 0px)';

module.exports = () => suite("Galleria References — nastro e gesti", {"banco": "/test/banco/galleria.html"}, async ({ page, base, ok }) => {

  await page.evaluate(async () => {
    const sleep = ms => new Promise(r=>setTimeout(r, ms));
    // Foto finte: canvas → dataURL, larghe (i+1) px.
    const foto = n => Array.from({length:n}, (_,i)=>{
      const c = document.createElement('canvas');
      c.width = i+1; c.height = 8;
      const x = c.getContext('2d'); x.fillStyle = 'rgb('+((i*23)%256)+',80,150)'; x.fillRect(0,0,c.width,c.height);
      return { id:'r'+i, url:c.toDataURL('image/png'), projectId:'P1', folderId:null };
    });
    // getRefs() restituisce l'array VERO del modulo: si semina da lì.
    const arr = window.refs.getRefs();
    arr.length = 0; arr.push(...foto(10));

    window.G = {
      body: () => document.getElementById('refs-lightbox-body'),
      track: () => document.getElementById('refs-lightbox-track'),
      cells: () => Array.from(document.querySelectorAll('.refs-lightbox-cell')),
      tag(){ this.cells().forEach(c=>{ if(!c.dataset.tid) c.dataset.tid='c'+(window.__n=(window.__n||0)+1); }); return this.cells().map(c=>c.dataset.tid); },
      imgs(){ return this.cells().map(c=>{ const i=c.querySelector('img'); return i && i.complete ? i.naturalWidth : 0; }); },
      counter(){ return document.getElementById('refs-lightbox-counter').textContent; },
      xform(){ return this.track().style.transform; },
      offset(){ const m=this.xform().match(/calc\(-100% ([-+]) ([\d.]+)px\)/); return m ? (m[1]==='-'?-1:1)*parseFloat(m[2]) : 0; },
      willChange(){ return this.track().style.willChange; },
      state(){ return { imgs:this.imgs(), counter:this.counter(), xform:this.xform(), tids:this.tag() }; },
      touch(type,x,y){
        const b = this.body();
        const t = new Touch({ identifier:1, target:b, clientX:x, clientY:y });
        const empty = type==='touchend' || type==='touchcancel';
        b.dispatchEvent(new TouchEvent(type,{ touches:empty?[]:[t], targetTouches:empty?[]:[t], changedTouches:[t], bubbles:true, cancelable:true }));
      },
      async drag(from, to, { steps=6, stepMs=60, release=true } = {}){
        this.touch('touchstart', from, 400);
        for(let i=1;i<=steps;i++){ await sleep(stepMs); this.touch('touchmove', from+(to-from)*i/steps, 400); }
        if(release){ await sleep(stepMs); this.touch('touchend', to, 400); }
      },
      open(i){ window.refs.openProjectRefGallery('P1', i); },
    };
  });

  const st = () => page.evaluate(() => G.state());
  const settle = (ms=450) => page.waitForTimeout(ms);
  const goTo = async i => { await page.evaluate(n => G.open(n), i-1); await settle(500); };

  console.log('\n── apertura ──');
  await goTo(3);
  let s = await st();
  ok('il nastro parte a riposo', s.xform === REST, s.xform);
  ok('la cella centrale mostra la foto 3', s.imgs[1] === 3, s.imgs);
  ok('i due vicini sono pronti (2 e 4)', s.imgs[0] === 2 && s.imgs[2] === 4, s.imgs);
  ok('il contatore lo dice', s.counter === '3 / 10', s.counter);
  const tids0 = s.tids.slice().sort().join();

  console.log('\n── il dito muove il nastro ──');
  await page.evaluate(() => G.touch('touchstart', 300, 400));
  ok('il livello di composizione è già pronto al touchstart',
     (await page.evaluate(() => G.willChange())) === 'transform', await page.evaluate(() => G.willChange()));
  await page.evaluate(() => G.touch('touchmove', 240, 400));
  ok('oltre la soglia segue il dito', (await page.evaluate(() => G.offset())) === -60);
  await page.evaluate(() => G.touch('touchend', 240, 400));
  await settle();

  console.log('\n── REGRESSIONE: swipe partito un filo in diagonale ──');
  await goTo(3);
  // Il primo campione è già oltre la soglia in verticale, ma il gesto è
  // orizzontale: prima moriva qui e serviva rifarlo da capo.
  await page.evaluate(async () => {
    G.touch('touchstart', 320, 400);
    G.touch('touchmove', 314, 388);       // ddx -6, ddy -12: ambiguo
    await new Promise(r=>setTimeout(r,50));
    G.touch('touchmove', 240, 380);       // ora è chiaramente orizzontale
    await new Promise(r=>setTimeout(r,50));
    G.touch('touchmove', 120, 378);
    G.touch('touchend', 120, 378);
  });
  await settle(700);
  s = await st();
  ok('lo swipe diagonale gira la foto lo stesso', s.imgs[1] === 4, s.imgs);

  console.log('\n── un gesto davvero verticale resta ignorato ──');
  await goTo(3);
  await page.evaluate(async () => {
    G.touch('touchstart', 300, 400);
    G.touch('touchmove', 303, 370);
    await new Promise(r=>setTimeout(r,40));
    G.touch('touchmove', 306, 300);
  });
  ok('il nastro non si muove', (await page.evaluate(() => G.xform())) === REST, await page.evaluate(() => G.xform()));
  await page.evaluate(() => G.touch('touchend', 306, 300));
  await settle(500);
  ok('e la foto non cambia', (await st()).imgs[1] === 3);

  console.log('\n── REGRESSIONE: secondo swipe mentre il nastro scorre ancora ──');
  await goTo(3);
  await page.evaluate(async () => {
    await G.drag(340, 100, { steps: 6, stepMs: 25 });     // primo swipe: conferma
    await new Promise(r=>setTimeout(r, 60));              // il nastro sta ANCORA scorrendo
    await G.drag(340, 100, { steps: 6, stepMs: 25 });     // secondo swipe, dentro la finestra morta
  });
  await settle(900);
  s = await st();
  ok('due swipe di fila avanzano di due foto (prima il secondo si perdeva)', s.imgs[1] === 5, s.imgs);
  ok('il contatore è coerente', s.counter === '5 / 10', s.counter);
  ok('il nastro è a riposo', s.xform === REST, s.xform);

  console.log('\n── REGRESSIONE: frecce premute di lena ──');
  await goTo(2);
  await page.evaluate(async () => {
    for(let i=0;i<4;i++){ window.refs.nextRefImage(); await new Promise(r=>setTimeout(r,50)); }
  });
  await settle(900);
  s = await st();
  ok('quattro comandi ravvicinati fanno quattro passi', s.imgs[1] === 6, s.imgs);

  console.log('\n── la durata segue la strada che resta ──');
  await goTo(3);
  const durFredda = await page.evaluate(() => { window.refs.nextRefImage(); return G.track().style.transition; });
  await settle(700);
  ok('da ferma la foto scorre per intero (220ms)', /220ms/.test(durFredda), durFredda);
  await goTo(3);
  const durTrascinata = await page.evaluate(async () => {
    await G.drag(360, 60, { steps: 8, stepMs: 25, release: false });
    G.touch('touchend', 60, 400);
    return G.track().style.transition;
  });
  await settle(700);
  const msT = parseInt((durTrascinata.match(/(\d+)ms/) || [])[1], 10);
  ok('dopo un trascinamento lungo il resto si chiude in fretta', msT > 0 && msT < 150, durTrascinata);
  ok('e la foto è comunque girata', (await st()).imgs[1] === 4);

  console.log('\n── molla, estremi, tocco annullato ──');
  await goTo(3);
  await page.evaluate(() => G.drag(300, 250, { steps: 6, stepMs: 70 }));
  await settle(700);
  s = await st();
  ok('un rilascio corto e lento torna indietro', s.imgs[1] === 3 && s.xform === REST, s);
  await goTo(1);
  await page.evaluate(() => G.drag(100, 200, { steps: 5, stepMs: 30, release: false }));
  const off = await page.evaluate(() => G.offset());
  ok('alla prima foto il nastro cede meno del dito', off > 0 && off < 100, off);
  await page.evaluate(() => G.touch('touchend', 200, 400));
  await settle(600);
  ok('e non si esce dalla galleria', (await st()).imgs[1] === 1);
  await goTo(3);
  await page.evaluate(() => G.drag(300, 180, { steps: 4, stepMs: 30, release: false }));
  await page.evaluate(() => G.touch('touchcancel', 180, 400));
  await settle(600);
  s = await st();
  ok('un tocco annullato non lascia il nastro a metà', s.xform === REST, s.xform);
  ok('e la foto non cambia', s.imgs[1] === 3, s.imgs);

  console.log('\n── riciclo delle celle ──');
  s = await st();
  ok('sono sempre le stesse tre celle', s.tids.slice().sort().join() === tids0, s.tids);

  console.log('\n── il fondo e\' sabbia scura dietro un vetro, non nero ──');
  // Il nero pieno di prima non era brutto, era muto. E la trasparenza da sola
  // era gia' stata un difetto — si leggeva la griglia dell'archivio dietro
  // l'immagine — quindi le due cose vanno provate INSIEME: colore trasparente
  // E sfocatura. Chi un giorno togliesse la seconda tenendo la prima
  // rimetterebbe il difetto, e questa prova glielo dice.
  const fondo = await page.evaluate(()=>{
    const st = getComputedStyle(document.getElementById('refs-lightbox'));
    return {
      sfondo: st.backgroundImage,
      tinta: st.backgroundColor,
      vetro: st.backdropFilter || st.webkitBackdropFilter,
    };
  });
  ok('non e\' piu\' una tinta piatta', /gradient/.test(fondo.sfondo), fondo);
  // Sabbia vuol dire rosso > verde > blu: se un giorno diventasse un grigio o
  // un blu, i tre canali si pareggerebbero e questa prova cadrebbe.
  const tinte = (fondo.sfondo.match(/rgba?\([^)]*\)/g) || []).map(t=>
    t.match(/[\d.]+/g).slice(0,3).map(Number));
  ok('e le tinte del gradiente sono sabbia, non grigio',
     tinte.length >= 2 && tinte.every(([r,g,b])=> r > g && g > b), tinte);
  // Il centro e' piu' chiaro dei bordi: e' la vignettatura, ed e' il motivo
  // per cui l'occhio va sulla tavola senza doverlo decidere.
  const luce = t => t ? t.reduce((a,b)=>a+b, 0) : 0;
  ok('il centro e\' piu\' chiaro dei bordi',
     tinte.length >= 2 && luce(tinte[0]) > luce(tinte[tinte.length-1]), tinte);
  ok('e c\'e\' il vetro smerigliato dietro', /blur\(\s*[1-9]/.test(fondo.vetro || ''), fondo);
});
