// Lettore — nastro, sfoglio, zoom, ritaglio
const { suite } = require('../motore.js');

// Come il browser normalizza il transform del nastro fermo: una cella
// spostata a sinistra, cioè quella centrale in vista.
const REST = 'translate3d(-100%, 0px, 0px)';

module.exports = () => suite("Lettore — nastro, sfoglio, zoom, ritaglio", {"banco": "/test/banco/lettore.html"}, async ({ page, base, ok }) => {

  await page.evaluate(() => {
    const sleep = ms => new Promise(r=>setTimeout(r, ms));
    window.T = {
      stage: () => document.querySelector('.ar-stage'),
      track: () => document.querySelector('.ar-track'),
      cells: () => Array.from(document.querySelectorAll('.ar-cell')),
      // Targhetta stabile alla prima occhiata: serve a verificare che le celle
      // vengano RICICLATE, non ricreate.
      tag(){
        this.cells().forEach(c => { if(!c.dataset.tid) c.dataset.tid = 'c' + (window.__n = (window.__n||0)+1); });
        return this.cells().map(c => c.dataset.tid);
      },
      pages(){ return this.cells().map(c => { const i = c.querySelector('.ar-img'); return i && i.complete ? i.naturalWidth : 0; }); },
      counter(){ return document.querySelector('.ar-counter').textContent; },
      xform(){ return this.track().style.transform; },
      offset(){ const m = this.xform().match(/calc\(-100% ([-+]) ([\d.]+)px\)/); return m ? (m[1]==='-' ? -1 : 1)*parseFloat(m[2]) : 0; },
      pending(){ return this.cells().map(c => c.classList.contains('pending')); },
      state(){ return { pages:this.pages(), counter:this.counter(), xform:this.xform(), pending:this.pending(), tids:this.tag(), n:this.cells().length }; },

      async open(url, name){
        const buf = await (await fetch(url)).arrayBuffer();
        await window.albums.openAlbumFromFile(new File([buf], name, { type:'application/zip' }));
      },
      touch(type, x, y){
        const s = this.stage();
        const t = new Touch({ identifier: 1, target: s, clientX: x, clientY: y });
        const empty = type === 'touchend' || type === 'touchcancel';
        s.dispatchEvent(new TouchEvent(type, {
          touches: empty ? [] : [t], targetTouches: empty ? [] : [t],
          changedTouches: [t], bubbles: true, cancelable: true,
        }));
      },
      // Gesto completo con tempi VERI: la conferma dipende anche dalla
      // velocità, quindi i passi vanno distanziati sul serio.
      async drag(from, to, { steps = 6, stepMs = 60, release = true } = {}){
        this.touch('touchstart', from, 400);
        for(let i = 1; i <= steps; i++){
          await sleep(stepMs);
          this.touch('touchmove', from + (to - from) * i / steps, 400);
        }
        if(release){ await sleep(stepMs); this.touch('touchend', to, 400); }
      },
      key(k){ document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); },
      click(sel){ document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles: true })); },
      // Salto "a freddo" per portarsi su una pagina nota prima di uno scenario.
      seek(i){
        const s = document.querySelector('.ar-seek');
        s.value = String(i);
        s.dispatchEvent(new Event('change', { bubbles: true }));
      },
    };
  });

  const st = () => page.evaluate(() => T.state());
  const settle = (ms=450) => page.waitForTimeout(ms);
  const goTo = async (pagina) => { await page.evaluate(i => T.seek(i), pagina - 1); await settle(600); };

  console.log('\n── apertura ──');
  await page.evaluate(() => localStorage.clear());
  await page.evaluate(u => T.open(u, 'Prova Volume 1.cbz'), base + '/test/fixtures/pagine.cbz');
  await settle(700);
  let s = await st();
  ok('il nastro ha tre celle', s.n === 3, s.n);
  ok('a riposo il nastro è spostato di una cella', s.xform === REST, s.xform);
  ok('la cella centrale mostra la pagina 1', s.pages[1] === 1, s.pages);
  ok('la cella successiva ha già pronta la pagina 2', s.pages[2] === 2, s.pages);
  ok('prima della pagina 1 non c\'è niente da preparare', s.pages[0] === 0, s.pages);
  ok('nessuna cella resta in attesa', s.pending.every(p => !p), s.pending);
  ok('il contatore parte da 01 / 12', s.counter === '01 / 12', s.counter);
  const tids0 = s.tids.slice().sort().join();

  console.log('\n── avanti e indietro da tastiera ──');
  const prima = (await st()).tids;
  await page.evaluate(() => T.key('ArrowRight'));
  await settle();
  s = await st();
  ok('la pagina avanza a 2', s.pages[1] === 2, s.pages);
  ok('il contatore segue', s.counter === '02 / 12', s.counter);
  ok('il nastro è tornato a riposo', s.xform === REST, s.xform);
  ok('ora sono pronti ENTRAMBI i vicini (1 e 3)', s.pages[0] === 1 && s.pages[2] === 3, s.pages);
  ok('le celle sono riciclate, non ricreate', s.tids.slice().sort().join() === tids0, s.tids);
  ok('la cella che era "successiva" è diventata la centrale', s.tids[1] === prima[2], { prima, dopo: s.tids });
  await page.evaluate(() => T.key('ArrowLeft'));
  await settle();
  s = await st();
  ok('e si torna indietro alla pagina 1', s.pages[1] === 1 && s.counter === '01 / 12', s);

  console.log('\n── il dito muove il nastro ──');
  await goTo(5);
  await page.evaluate(() => T.touch('touchstart', 300, 400));
  await page.evaluate(() => T.touch('touchmove', 296, 400));
  ok('sotto la soglia d\'innesco il nastro non si muove di un pixel',
     (await page.evaluate(() => T.xform())) === REST);
  await page.evaluate(() => T.touch('touchmove', 240, 400));
  ok('oltre la soglia segue il dito, pixel per pixel',
     (await page.evaluate(() => T.offset())) === -60, await page.evaluate(() => T.xform()));
  await page.evaluate(() => T.touch('touchmove', 210, 402));
  ok('e continua a seguirlo', (await page.evaluate(() => T.offset())) === -90);
  await page.evaluate(() => T.touch('touchend', 210, 402));
  await settle();

  console.log('\n── gesto verticale: non è il nostro ──');
  await goTo(5);
  await page.evaluate(async () => {
    T.touch('touchstart', 300, 400);
    T.touch('touchmove', 302, 380);
    T.touch('touchmove', 304, 340);
  });
  ok('trascinando in verticale il nastro resta fermo',
     (await page.evaluate(() => T.xform())) === REST, await page.evaluate(() => T.xform()));
  await page.evaluate(() => T.touch('touchend', 304, 340));
  await settle();
  ok('e la pagina non cambia', (await st()).pages[1] === 5);

  console.log('\n── rilascio corto e lento: molla indietro ──');
  await goTo(5);
  await page.evaluate(() => T.drag(300, 240, { steps: 6, stepMs: 70 }));
  await settle(700);
  s = await st();
  ok('la pagina non cambia', s.pages[1] === 5, s.pages);
  ok('il nastro torna a riposo', s.xform === REST, s.xform);

  console.log('\n── trascinamento oltre il 30%: conferma ──');
  await goTo(5);
  await page.evaluate(() => T.drag(340, 100, { steps: 8, stepMs: 60 }));   // 240px su 400
  await settle(700);
  s = await st();
  ok('la pagina avanza', s.pages[1] === 6, s.pages);
  ok('il nastro è di nuovo a riposo', s.xform === REST, s.xform);
  ok('e il contatore lo dice', s.counter === '06 / 12', s.counter);

  console.log('\n── colpetto secco e corto ──');
  await goTo(5);
  await page.evaluate(() => T.drag(300, 255, { steps: 3, stepMs: 16 }));   // 45px, rapidi
  await settle(700);
  s = await st();
  ok('anche un flick corto gira pagina', s.pages[1] === 6, s.pages);

  console.log('\n── trascinamento all\'indietro ──');
  await goTo(5);
  await page.evaluate(() => T.drag(100, 340, { steps: 8, stepMs: 60 }));
  await settle(700);
  s = await st();
  ok('trascinando verso destra si torna indietro', s.pages[1] === 4, s.pages);

  console.log('\n── resistenza ai due estremi ──');
  await goTo(1);
  await page.evaluate(() => T.drag(100, 200, { steps: 5, stepMs: 30, release: false }));
  const offPrima = await page.evaluate(() => T.offset());
  ok('dalla prima pagina il nastro cede meno del dito (100px richiesti)',
     offPrima > 0 && offPrima < 100, offPrima);
  await page.evaluate(() => T.touch('touchend', 200, 400));
  await settle(600);
  s = await st();
  ok('e si resta sulla prima pagina, nastro a riposo', s.pages[1] === 1 && s.xform === REST, s);
  await goTo(12);
  await page.evaluate(() => T.drag(300, 100, { steps: 5, stepMs: 30, release: false }));
  const offDopo = await page.evaluate(() => T.offset());
  ok('dall\'ultima pagina resiste allo stesso modo', offDopo < 0 && offDopo > -200, offDopo);
  await page.evaluate(() => T.touch('touchend', 100, 400));
  await settle(600);
  s = await st();
  ok('e si resta sull\'ultima', s.pages[1] === 12 && s.counter === '12 / 12', s);
  ok('oltre l\'ultima non c\'è nessuna cella da preparare', s.pages[2] === 0, s.pages);

  console.log('\n── tocco annullato dal sistema ──');
  await goTo(5);
  await page.evaluate(() => T.drag(300, 180, { steps: 4, stepMs: 30, release: false }));
  await page.evaluate(() => T.touch('touchcancel', 180, 400));
  await settle(600);
  s = await st();
  ok('il nastro non resta a metà fra due tavole', s.xform === REST, s.xform);
  ok('e la pagina non cambia', s.pages[1] === 5, s.pages);

  console.log('\n── REGRESSIONE: swipe partito un filo in diagonale ──');
  await goTo(5);
  // Il primo campione è già oltre la soglia in verticale ma il gesto è
  // orizzontale: prima moriva qui, e bisognava rifare lo swipe da capo.
  await page.evaluate(async () => {
    T.touch('touchstart', 320, 400);
    T.touch('touchmove', 314, 388);      // ddx -6, ddy -12: ambiguo
    await new Promise(r=>setTimeout(r,50));
    T.touch('touchmove', 240, 380);      // ora è chiaramente orizzontale
    await new Promise(r=>setTimeout(r,50));
    T.touch('touchmove', 120, 378);
    T.touch('touchend', 120, 378);
  });
  await settle(700);
  s = await st();
  ok('lo swipe diagonale gira pagina lo stesso', s.pages[1] === 6, s.pages);

  console.log('\n── REGRESSIONE: secondo swipe mentre il nastro scorre ancora ──');
  await goTo(5);
  await page.evaluate(async () => {
    await T.drag(340, 100, { steps: 6, stepMs: 25 });    // primo swipe: conferma
    await new Promise(r=>setTimeout(r, 60));             // il nastro sta ANCORA scorrendo
    await T.drag(340, 100, { steps: 6, stepMs: 25 });    // secondo swipe, dentro la finestra morta
  });
  await settle(900);
  s = await st();
  ok('due swipe di fila avanzano di due pagine (prima il secondo si perdeva)', s.pages[1] === 7, s.pages);
  ok('il contatore è coerente', s.counter === '07 / 12', s.counter);
  ok('il nastro è a riposo', s.xform === REST, s.xform);

  console.log('\n── REGRESSIONE: frecce premute di lena ──');
  await goTo(2);
  await page.evaluate(async () => {
    for(let i=0;i<4;i++){ T.key('ArrowRight'); await new Promise(r=>setTimeout(r,50)); }
  });
  await settle(900);
  s = await st();
  ok('quattro comandi ravvicinati fanno quattro passi', s.pages[1] === 6, s.pages);
  ok('e il contatore non resta indietro', s.counter === '06 / 12', s.counter);

  console.log('\n── il livello di composizione si prepara al touchstart ──');
  await goTo(5);
  await page.evaluate(() => T.touch('touchstart', 300, 400));
  ok('will-change è già pronto prima del primo movimento',
     (await page.evaluate(() => T.track().style.willChange)) === 'transform');
  await page.evaluate(() => T.touch('touchend', 300, 400));
  await settle(300);
  ok('e si spegne se il gesto era solo un tocco',
     (await page.evaluate(() => T.track().style.willChange)) === '',
     await page.evaluate(() => T.track().style.willChange));

  console.log('\n── la durata segue la strada che resta ──');
  await goTo(5);
  const durFredda = await page.evaluate(() => { T.key('ArrowRight'); return T.track().style.transition; });
  await settle(700);
  ok('da ferma la pagina scorre per intero (220ms)', /220ms/.test(durFredda), durFredda);
  await goTo(5);
  const durTrascinata = await page.evaluate(async () => {
    await T.drag(360, 60, { steps: 8, stepMs: 25, release: false });
    T.touch('touchend', 60, 400);          // rilasciata a ~75% dello schermo
    return T.track().style.transition;
  });
  await settle(700);
  const ms = parseInt((durTrascinata.match(/(\d+)ms/) || [])[1], 10);
  ok('dopo un trascinamento lungo il resto si chiude in fretta', ms > 0 && ms < 150, durTrascinata);
  ok('e la pagina è comunque girata', (await st()).pages[1] === 6);

  console.log('\n── salto lungo col cursore ──');
  await goTo(10);
  s = await st();
  ok('si arriva alla pagina 10', s.pages[1] === 10, s.pages);
  ok('il contatore lo dice', s.counter === '10 / 12', s.counter);
  ok('i vicini si preparano attorno al nuovo punto', s.pages[0] === 9 && s.pages[2] === 11, s.pages);
  ok('nessuna cella resta appesa in attesa', s.pending.every(p => !p), s.pending);
  ok('il nastro resta a riposo dopo un salto', s.xform === REST, s.xform);
  ok('le celle sono ancora quelle tre', s.tids.slice().sort().join() === tids0, s.tids);

  console.log('\n── prima e ultima pagina dai pulsanti ──');
  await page.evaluate(() => T.click('[data-act="last"]'));
  await settle(700);
  ok('il pulsante "ultima" arriva in fondo', (await st()).counter === '12 / 12');
  await page.evaluate(() => T.click('[data-act="first"]'));
  await settle(700);
  s = await st();
  ok('il pulsante "prima" torna in cima', s.counter === '01 / 12' && s.pages[1] === 1, s);

  console.log('\n── zoom ──');
  await goTo(5);
  await page.evaluate(() => {
    const img = T.cells()[1].querySelector('.ar-img');
    const r = img.getBoundingClientRect();
    img.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + r.width/2, clientY: r.top + r.height/2 }));
  });
  await settle(300);
  ok('il doppio clic ingrandisce', await page.evaluate(() => T.stage().classList.contains('zoomed')));
  // Da ingranditi il gesto sposta la TAVOLA. Solo insistendo oltre il bordo
  // passa a girare pagina (vedi il passaggio di consegne in albums.js): un
  // trascinamento breve resta dentro la tavola e il nastro non si muove.
  await page.evaluate(() => T.drag(300, 292, { steps: 3, stepMs: 30, release: false }));
  ok('un trascinamento breve sposta la tavola, non il nastro',
     (await page.evaluate(() => T.xform())) === REST, await page.evaluate(() => T.xform()));
  await page.evaluate(() => T.touch('touchend', 292, 400));
  await settle(600);
  ok('e la pagina non cambia', (await st()).pages[1] === 5);
  await page.evaluate(() => T.drag(340, 60, { steps: 6, stepMs: 30, release: false }));
  ok('insistendo oltre il bordo il nastro entra in gioco',
     /calc\(-100%/.test(await page.evaluate(() => T.xform())), await page.evaluate(() => T.xform()));
  await page.evaluate(() => T.touch('touchend', 60, 400));
  await settle(700);
  ok("e si gira pagina senza dover prima uscire dall'ingrandimento",
     (await st()).pages[1] === 6, (await st()).pages);
  await page.evaluate(() => T.key('ArrowRight'));
  await settle(600);
  const tr = await page.evaluate(() => T.cells().map(c => c.querySelector('.ar-img').style.transform));
  ok('nessuna cella si porta dietro lo zoom della pagina lasciata', tr.every(t => /scale\(1\)/.test(t)), tr);
  ok('lo stage non è più in stato ingrandito', !(await page.evaluate(() => T.stage().classList.contains('zoomed'))));

  console.log('\n── modalità ritaglio ──');
  await goTo(5);
  await page.evaluate(() => T.click('[data-act="clip"]'));
  await settle(250);
  await page.evaluate(() => T.key('ArrowRight'));
  await page.evaluate(() => T.drag(300, 100, { steps: 4, stepMs: 30 }));
  await settle(600);
  s = await st();
  ok('in ritaglio né tastiera né trascinamento cambiano pagina', s.pages[1] === 5, s.pages);
  ok('e il nastro resta a riposo', s.xform === REST, s.xform);
  // Uscire dal ritaglio = ritoccare le forbici (l'"annulla" nella capsula non
  // c'e' piu': era un secondo comando per la stessa cosa).
  await page.evaluate(() => T.click('.ar-clip'));
  await settle(250);
  await page.evaluate(() => T.key('ArrowRight'));
  await settle(600);
  ok('uscendo dal ritaglio si torna a sfogliare', (await st()).pages[1] === 6);

  console.log('\n── "Riprova" sta con le forbici, non fra le destinazioni ──');
  await goTo(5);
  await page.evaluate(() => T.click('[data-act="clip"]'));
  await settle(250);
  ok('a riquadro non ancora disegnato non compare', (await page.evaluate(()=> document.querySelector('.ar-retry').hidden)));
  const l = await page.evaluate(()=>{ const r=document.querySelector('.ar-cliplayer').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
  await page.mouse.move(l.x + l.w*0.25, l.y + l.h*0.3);
  await page.mouse.down();
  await page.mouse.move(l.x + l.w*0.7, l.y + l.h*0.6, { steps: 6 });
  await page.mouse.up();
  await settle(300);
  let r = await page.evaluate(()=>({
    visibile: !document.querySelector('.ar-retry').hidden,
    coiComandi: !!document.querySelector('.ar-top-actions .ar-retry'),
    nellaCapsula: !!document.querySelector('.ar-clip-hint .ar-retry'),
    testo: document.querySelector('.ar-retry').textContent.trim(),
  }));
  ok('disegnato il riquadro compare', r.visibile, r);
  ok('e sta accanto alle forbici, non nella capsula delle destinazioni',
     r.coiComandi && !r.nellaCapsula, r);
  ok('porta la parola, non solo un\'icona', /Riprova/.test(r.testo), r.testo);
  await page.evaluate(() => T.click('[data-act="retryclip"]'));
  await settle(250);
  ok('toccandolo si torna a disegnare e sparisce', (await page.evaluate(()=> document.querySelector('.ar-retry').hidden)));
  await page.evaluate(() => T.click('[data-act="clip"]'));   // esce dal ritaglio
  await settle(250);
  ok('uscendo dal ritaglio resta spento', (await page.evaluate(()=> document.querySelector('.ar-retry').hidden)));

  console.log('\n── memoria: la finestra delle tavole non cresce ──');
  for(let i = 0; i < 6; i++){ await page.evaluate(() => T.key('ArrowRight')); await settle(320); }
  s = await st();
  ok('sfogliando restano sempre e solo tre celle vive', s.n === 3, s.n);
  ok('e sono sempre le stesse tre', s.tids.slice().sort().join() === tids0, s.tids);

  console.log('\n── riapertura dell\'albo ──');
  await goTo(4);
  await page.evaluate(u => T.open(u, 'Prova Volume 1.cbz'), base + '/test/fixtures/pagine.cbz');
  await settle(900);
  s = await st();
  ok('riaprendo lo stesso albo si riprende da dov\'eri (pagina 4)', s.pages[1] === 4, s.pages);
  ok('il nastro è a riposo', s.xform === REST, s.xform);
  ok('nessuna cella resta in attesa', s.pending.every(p => !p), s.pending);
  ok('le tre celle sono le stesse dall\'inizio della sessione', s.tids.slice().sort().join() === tids0, s.tids);
  await page.evaluate(u => T.open(u, 'Altro Volume.cbz'), base + '/test/fixtures/pagine.cbz');
  await settle(900);
  s = await st();
  ok('un albo mai visto riparte dalla prima pagina', s.pages[1] === 1 && s.counter === '01 / 12', s);

  console.log('\n── i comandi stanno dove arriva il pollice ──');
  // Ritaglio e "tutta la tavola" erano in cima allo schermo, cioe' nell'angolo
  // piu' lontano dalla mano che tiene il telefono: per ritagliare una vignetta
  // si cambiava presa. Adesso stanno nella capsula in basso, come nella vista
  // a schermo intero dei frammenti.
  const dove = await page.evaluate(()=>{
    const q = sel => document.querySelector(sel);
    const r = el => el ? el.getBoundingClientRect() : null;
    return {
      inBasso: !!q('.ar-bottombar .ar-clip') && !!q('.ar-bottombar .ar-tutta'),
      inCima: !!q('.ar-topbar .ar-clip') || !!q('.ar-topbar .ar-tutta'),
      forbici: r(q('.ar-clip')),
      alto: window.innerHeight,
    };
  });
  ok('forbici e "tutta la tavola" sono nella barra in basso', dove.inBasso, dove);
  ok('e non piu\' in cima', !dove.inCima, dove);
  ok('stanno nella meta\' bassa dello schermo, sotto il pollice',
     dove.forbici && dove.forbici.top > dove.alto * 0.6, dove);
  // Sopra il cursore, non in fondo a tutto: in fondo erano l'ultima cosa
  // dello schermo, e per arrivarci il pollice doveva scavalcare la barra
  // della navigazione.
  const ordine = await page.evaluate(()=>{
    const r = s => document.querySelector(s).getBoundingClientRect();
    return { comandi: Math.round(r('.ar-top-actions').bottom),
             cursore: Math.round(r('.ar-seek-row').top),
             centrati: Math.abs((r('.ar-top-actions').left + r('.ar-top-actions').right)/2
                                - window.innerWidth/2) < 6 };
  });
  ok('la barretta sta SOPRA il cursore delle pagine',
     ordine.comandi <= ordine.cursore, ordine);
  ok('ed e\' centrata', ordine.centrati, ordine);

  console.log('\n── e sul telefono in cima non resta niente ──');
  // La X per chiudere era l'unica cosa rimasta lassu': il tasto Indietro fa la
  // stessa cosa ed e' sotto il pollice. Tolta lei sparisce anche la striscia
  // che teneva la tavola piu' in basso per non finirle dietro, e la pagina si
  // riprende quello spazio.
  const conDito = await page.evaluate(()=>{
    document.body.classList.add('is-touch');
    const st = getComputedStyle(document.querySelector('.ar-topbar'));
    const track = document.querySelector('.ar-track').getBoundingClientRect();
    const stage = document.querySelector('.ar-stage').getBoundingClientRect();
    return { barra: st.display, dallAlto: Math.round(track.top - stage.top) };
  });
  ok('la barra in cima non c\'e\' proprio', conDito.barra === 'none', conDito);
  ok('e la tavola comincia da subito, senza la striscia vuota',
     conDito.dallAlto === 0, conDito);
  const colMouse = await page.evaluate(()=>{
    document.body.classList.remove('is-touch');
    const st = getComputedStyle(document.querySelector('.ar-topbar'));
    const x = document.querySelector('.ar-close');
    return { barra: st.display, x: !!x && getComputedStyle(x).display !== 'none' };
  });
  ok('col mouse invece la X resta, che li\' un tasto Indietro sotto il dito non c\'e\'',
     colMouse.barra !== 'none' && colMouse.x, colMouse);

  console.log('\n── e in ritaglio i comandi non spariscono ──');
  // Prima entrando in ritaglio si nascondeva TUTTA la capsula: da quando le
  // forbici stanno li' dentro, portarsela via vorrebbe dire togliere di mezzo
  // proprio il comando che serve per uscire.
  await page.evaluate(() => T.click('[data-act="clip"]'));
  await settle(250);
  const inRitaglio = await page.evaluate(()=>{
    const vis = sel => { const el = document.querySelector(sel);
      return !!el && !el.hidden && getComputedStyle(el).display !== 'none'; };
    return { forbici: vis('.ar-clip'), tutta: vis('.ar-tutta'),
             capsula: vis('.ar-controls'), avviso: vis('.ar-clip-hint') };
  });
  ok('le forbici restano a schermo, per poter uscire', inRitaglio.forbici, inRitaglio);
  ok('e "tutta la tavola" anche', inRitaglio.tutta, inRitaglio);
  ok('mentre la capsula della navigazione si toglie di mezzo', !inRitaglio.capsula, inRitaglio);
  ok('e compare l\'avviso del ritaglio', inRitaglio.avviso, inRitaglio);
  await page.evaluate(() => T.click('[data-act="clip"]'));
  await settle(250);
  ok('uscendo, la capsula torna',
     await page.evaluate(()=> !document.querySelector('.ar-controls').hidden));

  console.log('\n── da ingranditi, il dito fuori dal riquadro sposta la tavola ──');
  // Con un riquadro gia\' tirato il dito sul resto della pagina non faceva
  // niente: per inquadrare una vignetta piu\' in la\' bisognava uscire dal
  // ritaglio, spostarsi e rientrare — e il riquadro era da rifare.
  // PRIMA si ingrandisce, POI si entra in ritaglio: e' l'ordine vero — dentro
  // il ritaglio il livello copre la tavola e il doppio tocco non la raggiunge
  // piu' (vedi il guardiano _clipMode nei gesti dello stage).
  await page.evaluate(async ()=>{
    const s = document.querySelector('.ar-stage').getBoundingClientRect();
    const cx = s.left + s.width/2, cy = s.top + s.height/2;
    for(let i=0;i<2;i++){
      T.touch('touchstart', cx, cy); T.touch('touchend', cx, cy);
      await new Promise(r=>setTimeout(r,60));
    }
    await new Promise(r=>setTimeout(r,400));
  });
  await page.evaluate(() => T.click('[data-act="clip"]'));
  await settle(300);
  const zoomOra = await page.evaluate(()=>{
    const im = document.querySelector('.ar-cell:nth-child(2) .ar-img') || document.querySelector('.ar-img');
    return im ? im.style.transform : '';
  });
  ok('la tavola e\' ingrandita anche dentro il ritaglio', /scale\((?!1\))/.test(zoomOra), zoomOra);

  const spostata = await page.evaluate(async ()=>{
    const layer = document.querySelector('.ar-cliplayer');
    const box = document.querySelector('.ar-clipbox');
    const l = layer.getBoundingClientRect();
    const tocca = (tipo, x, y)=>{
      const t = new Touch({identifier:1, target:layer, clientX:x, clientY:y});
      const vuoto = tipo === 'touchend';
      layer.dispatchEvent(new TouchEvent(tipo, {touches: vuoto?[]:[t], targetTouches: vuoto?[]:[t],
        changedTouches:[t], bubbles:true, cancelable:true}));
    };
    // Un riquadro piccolo, in alto a sinistra del livello
    tocca('touchstart', l.left + 30, l.top + 30);
    for(let i=1;i<=5;i++) tocca('touchmove', l.left + 30 + 20*i, l.top + 30 + 16*i);
    tocca('touchend', l.left + 130, l.top + 110);
    await new Promise(r=>setTimeout(r,250));
    const im = ()=> document.querySelector('.ar-cell:nth-child(2) .ar-img') || document.querySelector('.ar-img');
    const primaImg = im().style.transform;
    const primaBox = { l: box.style.left, t: box.style.top, w: box.style.width, h: box.style.height };
    // Adesso il dito parte da FUORI dal riquadro (in basso a destra) e trascina
    const px = l.left + l.width - 40, py = l.top + l.height - 40;
    tocca('touchstart', px, py);
    for(let i=1;i<=6;i++) tocca('touchmove', px - 15*i, py - 10*i);
    tocca('touchend', px - 90, py - 60);
    await new Promise(r=>setTimeout(r,250));
    return { primaImg, dopoImg: im().style.transform,
             primaBox, dopoBox: { l: box.style.left, t: box.style.top, w: box.style.width, h: box.style.height },
             riquadroInAttesa: box.classList.contains('pending') };
  });
  ok('il riquadro resta in attesa di conferma', spostata.riquadroInAttesa, spostata);
  ok('la tavola sotto si e\' spostata', spostata.primaImg !== spostata.dopoImg, spostata);
  ok('e il riquadro non si e\' mosso di un pixel: e\' una finestra, non un adesivo',
     JSON.stringify(spostata.primaBox) === JSON.stringify(spostata.dopoBox), spostata);

  // A pagina intera invece non c'e' niente da spostare: il dito non deve
  // inventarsi movimenti.
  const senzaZoom = await page.evaluate(async ()=>{
    const m = await import('/js/albums.js');
    m.resetZoom(false);
    await new Promise(r=>setTimeout(r,150));
    const layer = document.querySelector('.ar-cliplayer');
    const l = layer.getBoundingClientRect();
    const im = ()=> document.querySelector('.ar-cell:nth-child(2) .ar-img') || document.querySelector('.ar-img');
    const prima = im().style.transform;
    const tocca = (tipo, x, y)=>{
      const t = new Touch({identifier:1, target:layer, clientX:x, clientY:y});
      const vuoto = tipo === 'touchend';
      layer.dispatchEvent(new TouchEvent(tipo, {touches: vuoto?[]:[t], targetTouches: vuoto?[]:[t],
        changedTouches:[t], bubbles:true, cancelable:true}));
    };
    const px = l.left + l.width - 40, py = l.top + l.height - 40;
    tocca('touchstart', px, py);
    for(let i=1;i<=6;i++) tocca('touchmove', px - 15*i, py - 10*i);
    tocca('touchend', px - 90, py - 60);
    await new Promise(r=>setTimeout(r,200));
    return { prima, dopo: im().style.transform };
  });
  ok('a pagina intera invece la tavola resta ferma',
     senzaZoom.prima === senzaZoom.dopo, senzaZoom);
  await page.evaluate(() => T.click('[data-act="clip"]'));
  await settle(250);
});
