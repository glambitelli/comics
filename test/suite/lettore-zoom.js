// Lettore — spostamento e sfoglio da ingranditi
const { suite } = require('../motore.js');

module.exports = () => suite("Lettore — spostamento e sfoglio da ingranditi", {"banco": "/test/banco/lettore.html"}, async ({ page, base, ok }) => {
  await page.evaluate(()=>{
    localStorage.clear();
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    window.Z = {
      stage: ()=> document.querySelector('.ar-stage'),
      cella: ()=> document.querySelectorAll('.ar-cell')[1],
      img: ()=> document.querySelectorAll('.ar-cell')[1].querySelector('.ar-img'),
      track: ()=> document.querySelector('.ar-track'),
      pan(){
        const m = this.img().style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([\d.]+)\)/);
        return m ? { x:+m[1], y:+m[2], s:+m[3] } : null;
      },
      xform(){ return this.track().style.transform; },
      contatore(){ return document.querySelector('.ar-counter').textContent; },
      touch(type,x,y){
        const s=this.stage();
        const t=new Touch({identifier:1,target:s,clientX:x,clientY:y});
        const vuoto = type==='touchend'||type==='touchcancel';
        s.dispatchEvent(new TouchEvent(type,{touches:vuoto?[]:[t],targetTouches:vuoto?[]:[t],changedTouches:[t],bubbles:true,cancelable:true}));
      },
      ingrandisci(){
        const im=this.img(), r=im.getBoundingClientRect();
        im.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));
      },
      async trascina(da, a, passi=6, ms=25, rilascia=true){
        this.touch('touchstart', da, 450);
        for(let i=1;i<=passi;i++){ await sleep(ms); this.touch('touchmove', da+(a-da)*i/passi, 450); }
        if(rilascia){ await sleep(ms); this.touch('touchend', a, 450); }
      },
      apri: async (u)=>{ const b=await (await fetch(u)).arrayBuffer();
        await window.albums.openAlbumFromFile(new File([b],'Naruto 1.cbz',{type:'application/zip'})); },
    };
  });
  await page.evaluate(u=>window.Z.apri(u), base+'/test/fixtures/alta.cbz');
  await page.waitForTimeout(1000);

  // Ogni scenario riparte da una tavola ingrandita e centrata. Il lettore
  // ignora un dblclick entro un secondo da un tocco (i browser mobile ne
  // generano uno sintetico dopo il doppio tap), quindi si aspetta.
  const ingrandita = async ()=>{
    await page.waitForTimeout(1150);
    // Se e' gia' ingrandita la si azzera e la si ringrandisce: cosi' riparte
    // CENTRATA e non dove l'aveva lasciata lo scenario precedente — una tavola
    // gia' a fine corsa cambierebbe il significato del gesto che segue.
    if((await page.evaluate(()=>window.Z.pan())).s >= 2){
      await page.evaluate(()=> window.Z.ingrandisci());
      await page.waitForTimeout(330);
    }
    await page.evaluate(()=> window.Z.ingrandisci());
    await page.waitForTimeout(340);
    const z = await page.evaluate(()=>window.Z.pan());
    if(z.s < 2 || Math.abs(z.x) > 2) throw new Error('serviva ingrandita e centrata: ' + JSON.stringify(z));
  };
  // Porta la tavola a fine corsa a destra con un gesto suo, e stacca il dito.
  const aFineCorsa = async ()=>{
    await page.evaluate(async ()=>{
      window.Z.touch('touchstart', 400, 450);
      for(let x = 380; x >= 20; x -= 20){ window.Z.touch('touchmove', x, 450); await new Promise(r=>setTimeout(r,14)); }
      window.Z.touch('touchend', 20, 450);
    });
    await page.waitForTimeout(400);
  };

  console.log('\n── quanto la tavola segue il dito ──');
  await ingrandita();
  let z = await page.evaluate(()=>window.Z.pan());
  ok('il doppio tocco ingrandisce', z && z.s > 2, z);
  const partenza = z.x;
  await page.evaluate(()=> window.Z.trascina(300, 260, 4, 25, false));   // 40px di dito
  z = await page.evaluate(()=>window.Z.pan());
  const corsa = Math.abs(z.x - partenza);
  ok('40px di dito spostano la tavola di piu\' di 40px', corsa > 55, { corsa, z });
  ok('ma senza farla scappare (sotto il tetto di 2,2x)', corsa < 40*2.3, { corsa });
  ok('il nastro non si e\' mosso: si sta spostando la TAVOLA', (await page.evaluate(()=>window.Z.xform())) === 'translate3d(-100%, 0px, 0px)');
  await page.evaluate(()=> window.Z.touch('touchend', 260, 450));
  await page.waitForTimeout(300);

  console.log('\n── da fine corsa, un colpetto NON deve girare pagina ──');
  await ingrandita();
  await aFineCorsa();
  const pagA = await page.evaluate(()=>window.Z.contatore());
  await page.evaluate(async ()=>{ await window.Z.trascina(300, 240, 2, 12, true); });
  await page.waitForTimeout(700);
  ok('un colpetto al bordo lascia la pagina dov\'e\'',
     (await page.evaluate(()=>window.Z.contatore())) === pagA, { prima:pagA, dopo:await page.evaluate(()=>window.Z.contatore()) });
  ok('e il nastro torna a riposo', (await page.evaluate(()=>window.Z.xform())) === 'translate3d(-100%, 0px, 0px)');

  console.log('\n── da fine corsa: la molla cede sempre meno ──');
  await ingrandita();
  await aFineCorsa();
  // UN gesto solo, campionato mentre prosegue: spezzarlo in piu' trascinamenti
  // ne farebbe altrettanti gesti distinti, e la molla ripartirebbe da zero.
  const molla = await page.evaluate(async ()=>{
    const leggi = ()=>{ const m = window.Z.xform().match(/([-\d.]+)px/); return m ? Math.abs(+m[1]) : 0; };
    const sleep = ms => new Promise(r=>setTimeout(r,ms));
    window.Z.touch('touchstart', 400, 450);   // la tavola e' gia' a fine corsa
    for(let x = 390; x >= 240; x -= 25){ window.Z.touch('touchmove', x, 450); await sleep(18); }
    const a = leggi();                                    // fin qui: bordo + primo tratto
    for(let x = 225; x >= 125; x -= 25){ window.Z.touch('touchmove', x, 450); await sleep(18); }
    const b = leggi();                                    // altri 100px di dito
    for(let x = 110; x >= 10; x -= 25){ window.Z.touch('touchmove', x, 450); await sleep(18); }
    const c = leggi();                                    // altri 100px ancora
    window.Z.touch('touchend', 10, 450);
    return { a, b, c };
  });
  await page.waitForTimeout(700);
  ok('il nastro cede molto meno di quanto corre il dito', molla.b - molla.a < 100, molla);
  ok('e ogni tratto successivo cede meno del precedente',
     (molla.c - molla.b) > 0 && (molla.c - molla.b) < (molla.b - molla.a), molla);

  console.log('\n── muovendosi DENTRO la tavola non si gira mai pagina ──');
  await ingrandita();
  // È il caso che confondeva: il bordo orizzontale di una tavola ingrandita è
  // vicinissimo, quindi esplorando ci si sbatte contro di continuo. Per quanto
  // si insista, un gesto partito dentro la tavola non deve mai sfogliare.
  const pagB = await page.evaluate(()=>window.Z.contatore());
  await page.evaluate(async ()=>{
    // Si riparte dal centro della tavola e si trascina fino a fondo schermo.
    window.Z.touch('touchstart', 400, 450);
    for(let x = 380; x >= 10; x -= 20){ window.Z.touch('touchmove', x, 450); await new Promise(r=>setTimeout(r,16)); }
    window.Z.touch('touchend', 10, 450);
  });
  await page.waitForTimeout(700);
  ok('per quanto si trascini, la pagina resta quella',
     (await page.evaluate(()=>window.Z.contatore())) === pagB,
     { prima:pagB, dopo: await page.evaluate(()=>window.Z.contatore()) });
  ok('e il nastro non si e\' mai mosso', (await page.evaluate(()=>window.Z.xform())) === 'translate3d(-100%, 0px, 0px)');
  ok('ma la tavola sì: si e\' arrivati a fine corsa',
     Math.abs((await page.evaluate(()=>window.Z.pan())).x) > 100, await page.evaluate(()=>window.Z.pan()));

  console.log('\n── un gesto NUOVO partito da fine corsa gira pagina ──');
  const pag0 = await page.evaluate(()=>window.Z.contatore());
  await page.waitForTimeout(200);
  await page.evaluate(async ()=>{
    // Dito staccato e riappoggiato: adesso la tavola e' gia' a fine corsa.
    window.Z.touch('touchstart', 400, 450);
    for(let x = 380; x >= 10; x -= 20){ window.Z.touch('touchmove', x, 450); await new Promise(r=>setTimeout(r,16)); }
  });
  const durante = await page.evaluate(()=>window.Z.xform());
  ok('il nastro entra in gioco', /calc\(-100%/.test(durante), durante);
  await page.evaluate(()=> window.Z.touch('touchend', 10, 450));
  await page.waitForTimeout(700);
  const pag1 = await page.evaluate(()=>window.Z.contatore());
  ok('la pagina gira', pag1 !== pag0, { prima:pag0, dopo:pag1 });
  z = await page.evaluate(()=>window.Z.pan());
  ok('e la pagina nuova si apre a dimensione naturale', z && z.s === 1, z);

  console.log('\n── un trascinamento breve non gira pagina ──');
  await ingrandita();
  const pag2 = await page.evaluate(()=>window.Z.contatore());
  await page.evaluate(async ()=> { await window.Z.trascina(260, 210, 4, 25, true); });
  await page.waitForTimeout(600);
  ok('e\' ancora ingrandita', (await page.evaluate(()=>window.Z.pan())).s > 2);
  ok('resta sulla stessa pagina', (await page.evaluate(()=>window.Z.contatore())) === pag2);
  ok('e il nastro e\' fermo', (await page.evaluate(()=>window.Z.xform())) === 'translate3d(-100%, 0px, 0px)');

  console.log('\n── in verticale si scorre la tavola, mai la pagina ──');
  await ingrandita();
  const pag3 = await page.evaluate(()=>window.Z.contatore());
  const primaY = (await page.evaluate(()=>window.Z.pan())).y;
  await page.evaluate(async ()=>{
    window.Z.touch('touchstart', 200, 700);
    for(const y of [600, 480, 340, 200]){ window.Z.touch('touchmove', 200, y); await new Promise(r=>setTimeout(r,25)); }
    window.Z.touch('touchend', 200, 200);
  });
  await page.waitForTimeout(500);
  const dopoY = (await page.evaluate(()=>window.Z.pan())).y;
  ok('la tavola scorre in verticale', Math.abs(dopoY - primaY) > 300, { primaY, dopoY });
  ok('e la pagina non cambia', (await page.evaluate(()=>window.Z.contatore())) === pag3);

  console.log('\n── il doppio tocco deve partire SUBITO ──');
  // Non si misura quanto dura lo zoom, ma quanta strada ha fatto nei primi
  // fotogrammi: e' li' che una cosa si giudica "reattiva". Con la curva
  // predefinita del browser (`ease`, che parte piano) dopo 35ms l'immagine
  // aveva percorso meno di un quinto del tragitto, e il doppio tocco sembrava
  // lento pur durando poco.
  // Si riparte a scala 1 passando dal comando vero: forzare il transform a
  // mano lascerebbe il lettore convinto di essere ancora ingrandito, e il
  // doppio tocco successivo rimpicciolirebbe invece di ingrandire.
  const scalaOra = ()=> page.evaluate(()=> new DOMMatrix(getComputedStyle(window.Z.img()).transform).a);
  await page.waitForTimeout(1200);          // oltre la guardia sul dblclick sintetico
  if(await scalaOra() > 1.02){
    await page.evaluate(()=> window.Z.ingrandisci());
    await page.waitForTimeout(1300);
  }
  ok('si riparte da tavola intera', (await scalaOra()) < 1.02, await scalaOra());
  const avvioZoom = await page.evaluate(async ()=>{
    const im = window.Z.img();
    const scala = ()=> new DOMMatrix(getComputedStyle(im).transform).a;
    const prima = scala();
    window.Z.ingrandisci();
    await new Promise(r=>setTimeout(r,35));
    const a35 = scala();
    await new Promise(r=>setTimeout(r,400));
    const fine = scala();
    return { prima, a35, fine, curva: im.style.transition };
  });
  const quota = (avvioZoom.a35 - avvioZoom.prima) / (avvioZoom.fine - avvioZoom.prima);
  ok('lo zoom arriva dove deve', avvioZoom.fine > 2.4, avvioZoom);
  // La soglia viene dalla misura, non da un desiderio: con la curva in uscita
  // il browser fa il 23% del tragitto nei primi 35ms (dentro ci sono anche i
  // ~16ms che passano fra il comando e il primo fotogramma). Con la
  // predefinita `ease` sarebbero circa il 6%. 0.15 sta comodamente in mezzo:
  // passa oggi, e fallisce se qualcuno rimette la curva del browser.
  ok('e dopo 35ms ha gia\' fatto un pezzo di strada, non due pixel',
     quota > 0.15, { quota: +quota.toFixed(2), ...avvioZoom });
  ok('la curva e\' quella in uscita dichiarata, non quella del browser',
     /cubic-bezier/.test(avvioZoom.curva), avvioZoom.curva);
  console.log('   dopo 35ms: ' + Math.round(quota*100) + '% del tragitto');

});
