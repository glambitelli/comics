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

  console.log('\n── la forma del doppio tocco: parte subito, non precipita ──');
  // Due requisiti che sembrano opposti e non lo sono: si deve MUOVERE dal
  // primo istante (la prima versione, con la curva predefinita del browser,
  // sembrava molle) ma non deve avere consumato quasi tutta la corsa a meta'
  // tempo (la seconda versione lo faceva, e l'immagine arrivava in faccia).
  // Si misura la FORMA del movimento, non la sua durata.
  const scalaOra = ()=> page.evaluate(()=> new DOMMatrix(getComputedStyle(window.Z.img()).transform).a);
  await page.waitForTimeout(1200);          // oltre la guardia sul dblclick sintetico
  if(await scalaOra() > 1.02){
    await page.evaluate(()=> window.Z.ingrandisci());
    await page.waitForTimeout(1300);
  }
  ok('si riparte da tavola intera', (await scalaOra()) < 1.02, await scalaOra());

  const forma = await page.evaluate(async ()=>{
    const im = window.Z.img();
    const scala = ()=> new DOMMatrix(getComputedStyle(im).transform).a;
    const attendi = ms => new Promise(r=>setTimeout(r,ms));
    const prima = scala();
    window.Z.ingrandisci();
    // I campioni si prendono in FRAZIONE della durata dichiarata, non a
    // millisecondi fissi: qui si misura la FORMA del movimento, e la durata e'
    // una manopola separata che si puo' girare senza rendere false le soglie.
    // I 16ms in piu' sono quelli che passano fra il comando e il primo
    // fotogramma, e vanno tolti dal conto o si misura anche l'attesa.
    const dur = parseFloat((im.style.transition.match(/(\d+(?:\.\d+)?)ms/) || [0, 240])[1]);
    await attendi(16 + dur * 0.12);   const presto = scala();
    await attendi(dur * 0.43);        const meta = scala();   // ~55% della durata
    await attendi(dur * 2);           const fine = scala();
    const corsa = v => (v - prima) / (fine - prima);
    return { durata: dur, prima, fine, presto: corsa(presto), meta: corsa(meta), curva: im.style.transition };
  });
  ok('lo zoom arriva dove deve', forma.fine > 2.4, forma);
  ok('si e\' gia\' mosso al 12% del tempo: nessun tratto morto in partenza',
     forma.presto > 0.06, { presto: +forma.presto.toFixed(2), ...forma });
  // Il numero che sorveglia la bruschezza. La curva di prima, tutta sbilanciata
  // sull'inizio, qui stava intorno al 90%: quasi tutto l'avvicinamento
  // consumato nella prima meta', e la seconda un lungo strascico.
  ok('ma a meta\' strada NON ha gia\' fatto quasi tutto',
     forma.meta < 0.78, { meta: +forma.meta.toFixed(2), ...forma });
  ok('la curva e\' quella dichiarata, non quella del browser',
     /cubic-bezier/.test(forma.curva), forma.curva);
  console.log('   corsa fatta: ' + Math.round(forma.presto*100) + '% al 12% del tempo · '
    + Math.round(forma.meta*100) + '% al 55%   (durata ' + forma.durata + 'ms)');


  console.log('\n── il doppio tocco parte quando il dito ARRIVA, non quando si stacca ──');
  // Il ritardo che si sentiva era il tempo di contatto del secondo tocco: lo
  // zoom scattava al rilascio. Quando il secondo dito si appoggia pero' non
  // c'e' piu' niente da sapere — il primo tocco c'e' stato, meno di 400ms fa e
  // a meno di 50px — quindi aspettare aggiungeva solo attesa.
  await page.waitForTimeout(1200);
  if(await scalaOra() > 1.02){
    await page.evaluate(()=> window.Z.ingrandisci());
    await page.waitForTimeout(1300);
  }
  const quandoParte = await page.evaluate(async ()=>{
    const attendi = ms => new Promise(r=>setTimeout(r,ms));
    const scala = ()=> new DOMMatrix(getComputedStyle(window.Z.img()).transform).a;
    const prima = scala();
    // primo tocco
    window.Z.touch('touchstart', 200, 400); await attendi(30);
    window.Z.touch('touchend',   200, 400); await attendi(120);
    // secondo tocco: si appoggia e RESTA GIU'
    window.Z.touch('touchstart', 200, 400);
    await attendi(90);                       // il dito e' ancora sullo schermo
    const conDitoGiu = scala();
    window.Z.touch('touchend',   200, 400);
    await attendi(500);
    return { prima, conDitoGiu, fine: scala() };
  });
  ok('col dito ancora appoggiato lo zoom si sta gia\' muovendo',
     quandoParte.conDitoGiu > quandoParte.prima + 0.2, quandoParte);
  ok('e arriva a destinazione', quandoParte.fine > 2.4, quandoParte);
  console.log('   scala a dito ancora giu\': ' + quandoParte.conDitoGiu.toFixed(2)
    + ' (partiva da ' + quandoParte.prima.toFixed(2) + ')');

  console.log('\n── ma un tocco solo non ingrandisce niente ──');
  await page.waitForTimeout(1200);
  if(await scalaOra() > 1.02){
    await page.evaluate(()=> window.Z.ingrandisci());
    await page.waitForTimeout(1300);
  }
  const unoSolo = await page.evaluate(async ()=>{
    const attendi = ms => new Promise(r=>setTimeout(r,ms));
    window.Z.touch('touchstart', 200, 400); await attendi(30);
    window.Z.touch('touchend',   200, 400); await attendi(600);
    return new DOMMatrix(getComputedStyle(window.Z.img()).transform).a;
  });
  ok('un tocco isolato lascia la tavola com\'e\'', unoSolo < 1.02, unoSolo);

  console.log('\n── e due tocchi lontani fra loro non sono un doppio tocco ──');
  const lontani = await page.evaluate(async ()=>{
    const attendi = ms => new Promise(r=>setTimeout(r,ms));
    window.Z.touch('touchstart', 120, 300); await attendi(30);
    window.Z.touch('touchend',   120, 300); await attendi(120);
    window.Z.touch('touchstart', 320, 620); await attendi(30);   // ben oltre i 50px
    window.Z.touch('touchend',   320, 620); await attendi(500);
    return new DOMMatrix(getComputedStyle(window.Z.img()).transform).a;
  });
  ok('due tocchi in punti diversi non ingrandiscono', lontani < 1.02, lontani);

});
