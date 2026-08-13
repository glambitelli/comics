// Suoni — un tocco, un suono
const { suite } = require('../motore.js');

module.exports = () => suite("Suoni — un tocco, un suono", {"banco": "/test/banco/suoni.html", "args": ["--autoplay-policy=no-user-gesture-required"]}, async ({ page, base, ok }) => {

  await page.evaluate(()=>{
    window.tocca = async (sel, intento, ms=0)=>{
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      window['click'+(sel==='#b1'?1:2)] = intento ? ()=>window.playSfx(intento) : null;
      el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
      await new Promise(r=>setTimeout(r,ms));
      el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x+2,clientY:y+1,bubbles:true}));
      el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
    };
    window.trascina = async (sel)=>{
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const x = r.left + r.width/2, y = r.top + r.height/2;
      el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
      el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x+60,clientY:y+4,bubbles:true}));
    };
    window.azzera = ()=>{ window.__suoni = []; };
  });
  // primo suono: aspetta il precarico
  await page.evaluate(()=> window.playSfx('tap'));
  await page.waitForTimeout(700);
  const durate = await page.evaluate(()=> window.__suoni);
  ok('i file dei suoni si caricano e suonano', durate.length >= 1, durate);
  const dNav = durate[0];

  const conta = async ()=>{ await page.waitForTimeout(320); return page.evaluate(()=>window.__suoni); };

  console.log('\n── un tocco su un bottone che chiama anche haptic(\'tap\') ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#b1','tap',30));
  let s = await conta();
  ok('suona UNA volta sola (prima erano due)', s.length === 1, s);

  console.log('\n── un tocco su un bottone che conferma: haptic(\'done\') ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#b1','done',30));
  s = await conta();
  ok('suona una volta sola', s.length === 1, s);
  ok('ed è la CONFERMA, non il tick generico', s[0] !== dNav, { suonato:s[0], nav:dNav });

  console.log('\n── azione che suona in ritardo (dopo una scrittura, un menu) ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=>{
    // Come una voce di menu che salva e POI fa il suo haptic('tap'):
    // fra il rilascio del dito e il suono passano piu' dei vecchi 70ms.
    window.click1 = ()=> setTimeout(()=> window.playSfx('tap'), 150);
    const el = document.querySelector('#b1'), r = el.getBoundingClientRect();
    const x = r.left+r.width/2, y = r.top+r.height/2;
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(500);
  s = await page.evaluate(()=>window.__suoni);
  ok('resta un suono solo anche se l\'azione arriva tardi', s.length === 1, s);
  await page.evaluate(()=>{ window.click1 = null; });

  console.log('\n── due tocchi distinti ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(async ()=>{ await window.tocca('#b1',null,20); });
  await page.waitForTimeout(220);
  await page.evaluate(async ()=>{ await window.tocca('#b2',null,20); });
  s = await conta();
  ok('due tocchi = due suoni', s.length === 2, s);

  console.log('\n── tocchi ravvicinati su un contatore (tap ripetuti veloci) ──');
  await page.evaluate(()=>window.azzera());
  for(let i=0;i<3;i++){
    await page.evaluate(async ()=>{ await window.tocca('#b1',null,10); });
    await page.waitForTimeout(120);
  }
  s = await conta();
  ok('ogni tocco vero resta udibile', s.length === 3, s);

  console.log('\n── trascinamento (scorrere una lista) ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.trascina('#b1'));
  s = await conta();
  ok('scorrere non fa suono', s.length === 0, s);

  console.log('\n── elementi non interattivi e campi di testo ──');
  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#d1',null,10));
  await page.evaluate(()=> window.tocca('#i1',null,10));
  s = await conta();
  ok('un div qualunque e un campo di testo restano muti', s.length === 0, s);

  console.log('\n── da tastiera, fuori da qualunque gesto ──');
  await page.evaluate(()=>window.azzera());
  await page.waitForTimeout(1100);   // oltre la finestra del gesto
  await page.evaluate(()=> window.playSfx('tap'));
  await page.waitForTimeout(150);
  await page.evaluate(()=> window.playSfx('tap'));
  s = await conta();
  ok('due comandi da tastiera restano due suoni', s.length === 2, s);

  console.log('\n── con l\'interruttore spento non deve suonare NIENTE ──');
  // Il buco che c'era: il tick diffuso dei tocchi non passava dal controllo
  // dell'interruttore, quindi spegnendo i suoni si zittivano le conferme —
  // quelle che passano da playSfx — e restava acceso il ticchettio di ogni
  // tocco, che e' proprio quello che si sente di piu'. Da fuori sembrava un
  // interruttore rotto.
  await page.evaluate(()=>{ window.setSoundEnabled(false); window.azzera(); });
  await page.evaluate(()=> window.tocca('#b1','tap',30));
  s = await conta();
  ok('un tocco su un bottone non ticchetta', s.length === 0, s);

  await page.evaluate(()=>window.azzera());
  await page.evaluate(()=> window.tocca('#b2','done',30));
  s = await conta();
  ok('e nemmeno una conferma', s.length === 0, s);

  await page.evaluate(()=>window.azzera());
  await page.waitForTimeout(1100);
  await page.evaluate(()=> window.playSfx('reward'));
  await page.waitForTimeout(150);
  s = await conta();
  ok('nemmeno una ricompensa chiamata a mano', s.length === 0, s);

  console.log('\n── e riaccendendolo si torna a sentire ──');
  await page.evaluate(()=>{ window.setSoundEnabled(true); window.azzera(); });
  await page.evaluate(()=> window.tocca('#b1','tap',30));
  s = await conta();
  ok('il tocco ticchetta di nuovo', s.length === 1, s);
});
