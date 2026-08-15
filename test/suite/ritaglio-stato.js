// Ritaglio — lo stato non sopravvive alla chiusura
const { suite } = require('../motore.js');

module.exports = () => suite("Ritaglio — lo stato non sopravvive alla chiusura", {"banco": "/test/banco/lettore.html"}, async ({ page, base, ok }) => {
  await page.evaluate(()=>{ localStorage.clear(); window.__dests=[{id:'f1',name:'OTOMO',isCurrent:true,category:'Artists'}];
    window.__cats=[{category:'Artists',folders:[{id:'f1',name:'OTOMO'}]}]; window.__folderId='F';
    window.apri = async (u,n)=>{ const b=await (await fetch(u)).arrayBuffer();
      await window.albums.openAlbumFromFile(new File([b],n,{type:'application/zip'})); };
    window.stato = ()=>({
      lettoreAperto: document.querySelector('.album-reader').classList.contains('open'),
      clipAcceso: document.querySelector('.ar-clip').classList.contains('active'),
      livelloVisibile: !document.querySelector('.ar-cliplayer').hidden,
      barraVisibile: !document.querySelector('.ar-clip-hint').hidden,
      istruzioni: !document.querySelector('.ar-clip-hint-instruct').hidden,
      conferma: !document.querySelector('.ar-clip-hint-confirm').hidden,
      riquadro: !document.querySelector('.ar-clipbox').hidden,
      riprova: !document.querySelector('.ar-retry').hidden,
    });
  });

  const disegna = async ()=>{
    const l = await page.evaluate(()=>{ const r=document.querySelector('.ar-cliplayer').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
    await page.mouse.move(l.x+l.w*0.25, l.y+l.h*0.3);
    await page.mouse.down();
    await page.mouse.move(l.x+l.w*0.7, l.y+l.h*0.6, {steps:6});
    await page.mouse.up();
    await page.waitForTimeout(300);
  };

  console.log('\n── si apre l\'albo e si comincia un ritaglio ──');
  await page.evaluate(u=>window.apri(u,'Naruto 11.cbz'), base+'/test/fixtures/pagine.cbz');
  await page.waitForTimeout(800);
  await page.evaluate(()=> document.querySelector('.ar-clip').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(200);
  await disegna();
  let s = await page.evaluate(()=>window.stato());
  ok('il riquadro è disegnato e aspetta conferma', s.clipAcceso && s.riquadro && s.conferma, s);

  console.log('\n── si chiude il lettore col ritaglio ancora in sospeso ──');
  await page.evaluate(()=> document.querySelector('[data-act="close"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(500);
  s = await page.evaluate(()=>window.stato());
  ok('il lettore si chiude', !s.lettoreAperto, s);
  ok('la modalità ritaglio si spegne', !s.clipAcceso, s);

  console.log('\n── si riapre lo stesso albo e si tocca "Ritaglia" ──');
  await page.evaluate(u=>window.apri(u,'Naruto 11.cbz'), base+'/test/fixtures/pagine.cbz');
  await page.waitForTimeout(900);
  s = await page.evaluate(()=>window.stato());
  ok('il lettore è di nuovo aperto', s.lettoreAperto, s);
  ok('e il ritaglio parte spento', !s.clipAcceso && !s.livelloVisibile, s);

  await page.evaluate(()=> document.querySelector('.ar-clip').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(300);
  s = await page.evaluate(()=>window.stato());
  ok('IL PULSANTE RISPONDE: il ritaglio si accende', s.clipAcceso, s);
  ok('e compare il livello su cui disegnare', s.livelloVisibile, s);
  ok('la barra dice "trascina un riquadro", non le destinazioni di prima',
     s.istruzioni && !s.conferma, s);
  ok('nessun riquadro fantasma dalla volta scorsa', !s.riquadro, s);
  ok('e nessun "Riprova" appeso', !s.riprova, s);

  console.log('\n── e si riesce davvero a ritagliare di nuovo ──');
  await disegna();
  s = await page.evaluate(()=>window.stato());
  ok('il nuovo riquadro arriva alla conferma', s.riquadro && s.conferma && s.riprova, s);

  console.log('\n── caso peggiore: si apre un altro albo SENZA chiudere, col ritaglio acceso ──');
  // Nessuna pulizia in uscita: e' la rete di sicurezza in openReaderShell che
  // deve reggere da sola, qualunque strada abbia preso la chiusura precedente.
  // Si esce dal ritaglio ritoccando le forbici: il vecchio "annulla" nella
  // capsula non c'e' piu' — faceva la stessa cosa dello stesso pulsante che ci
  // aveva portati dentro, e stava in mezzo alle destinazioni.
  await page.evaluate(()=> document.querySelector('.ar-clip').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(200);
  await page.evaluate(()=> document.querySelector('.ar-clip').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(200);
  await disegna();
  ok('siamo di nuovo col riquadro in sospeso', (await page.evaluate(()=>window.stato())).conferma);
  await page.evaluate(u=>window.apri(u,'Un Altro Albo.cbz'), base+'/test/fixtures/pagine.cbz');
  await page.waitForTimeout(900);
  s = await page.evaluate(()=>window.stato());
  ok('il nuovo albo si apre col ritaglio spento e pulito',
     !s.clipAcceso && !s.livelloVisibile && !s.conferma && !s.riquadro && !s.riprova, s);
  await page.evaluate(()=> document.querySelector('.ar-clip').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(300);
  s = await page.evaluate(()=>window.stato());
  ok('e "Ritaglia" risponde al PRIMO tocco', s.clipAcceso && s.livelloVisibile && s.istruzioni, s);

});
