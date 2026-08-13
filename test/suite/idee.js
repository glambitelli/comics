// Idee — il taccuino senza padrone
const { suite } = require('../motore.js');

module.exports = () => suite("Idee — taccuino, editor, promozione a progetto",
  { banco: '/test/banco/idee.html' }, async ({ page, base, ok }) => {

  const stato = ()=> page.evaluate(()=>{
    const card = Array.from(document.querySelectorAll('.idee-card'));
    return {
      n: card.length,
      titoli: card.map(c=> c.querySelector('b').textContent),
      resti: card.map(c=>{ const s = c.querySelector('span'); return s ? s.textContent : null; }),
      targhe: card.map(c=>{ const t = c.querySelector('.idee-targa'); return t ? t.textContent : null; }),
      vuoto: !!document.querySelector('.idee-vuoto'),
    };
  });
  const scrivi = async (testo)=>{
    await page.evaluate(t=>{
      const box = document.getElementById('idee-nuovo-testo');
      box.value = t;
      box.dispatchEvent(new Event('input', {bubbles:true}));
    }, testo);
  };
  const salva = async ()=>{
    await page.evaluate(()=> document.getElementById('idee-nuovo-salva').click());
    await page.waitForTimeout(160);
  };

  console.log('\n── a taccuino vuoto ──');
  let s = await stato();
  ok('non ci sono schede', s.n === 0, s);
  ok('e si spiega a cosa serve la schermata', s.vuoto, s);
  const spento = await page.evaluate(()=> document.getElementById('idee-nuovo-salva').classList.contains('pronto'));
  ok('il pulsante Salva e\' spento finche\' non si scrive', spento === false, spento);

  console.log('\n── si butta giu\' un pensiero ──');
  await scrivi('Il ladro di ombre');
  const acceso = await page.evaluate(()=> document.getElementById('idee-nuovo-salva').classList.contains('pronto'));
  ok('scrivendo, il pulsante si accende', acceso === true, acceso);
  await salva();
  s = await stato();
  ok('l\'idea compare subito in elenco', s.n === 1 && s.titoli[0] === 'Il ladro di ombre', s);
  const svuotata = await page.evaluate(()=> document.getElementById('idee-nuovo-testo').value);
  ok('e la casella torna vuota, pronta per la prossima', svuotata === '', svuotata);

  console.log('\n── il titolo e\' la prima riga, non un campo da compilare ──');
  await scrivi('La casa sul molo\nStoria di due fratelli che tornano\ndopo vent\'anni');
  await salva();
  s = await stato();
  ok('la prima riga fa da titolo', s.titoli[0] === 'La casa sul molo', s);
  ok('il resto diventa l\'anteprima', /due fratelli/.test(s.resti[0] || ''), s);
  ok('l\'ultima scritta sta in cima', s.n === 2 && s.titoli[1] === 'Il ladro di ombre', s);

  console.log('\n── una casella vuota non salva niente ──');
  await scrivi('   \n  ');
  await salva();
  s = await stato();
  ok('nessuna scheda fantasma', s.n === 2, s);

  console.log('\n── si riapre un\'idea per rileggerla ──');
  await page.evaluate(()=> document.querySelectorAll('.idee-card')[1].click());
  await page.waitForTimeout(350);
  let ed = await page.evaluate(()=> ({
    aperto: document.getElementById('idea-editor').classList.contains('open'),
    testo: document.getElementById('idea-editor-testo').value,
    // Nell'editor non deve esserci NESSUNA decisione da prendere: si e' venuti
    // qui per scrivere, non per scegliere se buttare l'idea o farne un
    // progetto. Prima c'erano tutte e due, e il cestino apriva una conferma
    // che finiva DIETRO l'editor (z-index 200 contro 210): sembrava morto, e
    // la domanda spuntava dal nulla dopo, a editor chiuso.
    azioni: document.querySelectorAll('.idea-editor-barra button').length,
  }));
  ok('l\'editor si apre sul testo giusto', ed.aperto && ed.testo === 'Il ladro di ombre', ed);
  ok('e non contiene nessuna azione oltre al tornare indietro', ed.azioni === 1, ed);

  await page.evaluate(()=>{
    document.getElementById('idea-editor-testo').value = 'Il ladro di ombre\nRuba le ombre, non gli oggetti.';
    document.getElementById('idea-editor-chiudi').click();
  });
  await page.waitForTimeout(260);
  s = await stato();
  ok('chiudendo si salva quello che si e\' scritto', /Ruba le ombre/.test(s.resti[0] || ''), s);
  ok('e l\'idea appena toccata risale in cima', s.titoli[0] === 'Il ladro di ombre', s);
  ok('senza creare un doppione', s.n === 2, s);

  console.log('\n── i tre puntini: tutte le azioni in un posto solo ──');
  const voci = ()=> page.evaluate(()=> Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent));
  const chiudiMenu = ()=> page.evaluate(()=> document.querySelectorAll('.ink-action-menu').forEach(m=>m.remove()));
  const tocca = async (testo)=>{
    await page.evaluate(t=>{
      const b = Array.from(document.querySelectorAll('.ink-action-menu button')).find(x=>x.textContent.includes(t));
      if(b) b.click();
    }, testo);
    await page.waitForTimeout(420);
  };
  const apriMenu = async (i)=>{
    await page.evaluate(k=> document.querySelectorAll('.idee-card')[k].querySelector('.idee-menu').click(), i);
    await page.waitForTimeout(240);
  };

  await apriMenu(0);
  let v = await voci();
  ok('il menu si apre con tre voci', v.length === 3, v);
  ok('la prima e\' modificare', /Modifica/.test(v[0]||''), v);
  ok('la seconda dice COSA succede, non come si chiama l\'operazione',
     /Crea un progetto da questa idea/.test(v[1]||''), v);
  ok('la terza e\' eliminare', /Elimina/.test(v[2]||''), v);
  const editorChiuso = await page.evaluate(()=> !document.getElementById('idea-editor').classList.contains('open'));
  ok('e aprendo il menu non si e\' aperto anche l\'editor sotto', editorChiuso, editorChiuso);

  console.log('\n── "Modifica" apre il foglio su cui scrivere ──');
  await tocca('Modifica');
  ed = await page.evaluate(()=> ({
    aperto: document.getElementById('idea-editor').classList.contains('open'),
    testo: document.getElementById('idea-editor-testo').value,
  }));
  ok('si apre l\'editor sull\'idea giusta', ed.aperto && /Ruba le ombre/.test(ed.testo), ed);
  await page.evaluate(()=> document.getElementById('idea-editor-chiudi').click());
  await page.waitForTimeout(320);

  console.log('\n── da idea a progetto, dal menu ──');
  await page.evaluate(()=>{ window.__salvati = []; window.__aperti = []; window.openProject = id=>window.__aperti.push(id); });
  await apriMenu(0);
  await tocca('Crea un progetto');
  const nato = await page.evaluate(()=> ({
    quanti: window.__salvati.length,
    titolo: window.__salvati[0] && window.__salvati[0].title,
    scriptment: window.__salvati[0] && window.__salvati[0].scriptment.text,
    aperti: window.__aperti,
  }));
  ok('nasce un progetto solo', nato.quanti === 1, nato);
  ok('col titolo preso dalla prima riga', nato.titolo === 'Il ladro di ombre', nato);
  ok('e TUTTO il testo dentro lo scriptment, non solo il titolo',
     /Ruba le ombre/.test(nato.scriptment || ''), nato);
  ok('e si atterra sul progetto nuovo', nato.aperti.length === 1, nato);

  s = await stato();
  ok('l\'idea resta in elenco', s.n === 2, s);
  ok('con la targa di dov\'e\' finita', /Il ladro di ombre/.test(s.targhe[0] || ''), s);

  console.log('\n── promuovere due volte creerebbe due progetti: non si puo\' ──');
  await apriMenu(0);
  v = await voci();
  ok('la voce diventa "apri il progetto"', /^Apri /.test(v[1]||''), v);
  await tocca('Apri ');
  const dopo = await page.evaluate(()=> ({ quanti: window.__salvati.length, aperti: window.__aperti.length }));
  ok('nessun secondo progetto', dopo.quanti === 1, dopo);
  ok('ma il progetto si apre lo stesso', dopo.aperti === 2, dopo);

  console.log('\n── eliminare: niente "sei sicuro?", ma si puo\' annullare ──');
  await page.evaluate(()=>{ window.__undo = null; });
  await apriMenu(1);
  await tocca('Elimina');
  s = await stato();
  const offerto = await page.evaluate(()=> !!window.__undo);
  ok('l\'idea sparisce subito, senza finestre di conferma', s.n === 1, s);
  ok('e viene offerto di annullare', offerto, offerto);
  await page.evaluate(async ()=>{ await window.__undo.fn(); });
  await page.waitForTimeout(280);
  s = await stato();
  ok('annullando torna dov\'era', s.n === 2 && s.titoli.includes('La casa sul molo'), s);

  console.log('\n── strisciare la scheda verso sinistra apre lo stesso menu ──');
  const striscia = async (indice, dx, dy)=>{
    await page.evaluate(([i,ddx,ddy])=>{
      const card = document.querySelectorAll('.idee-card')[i];
      const r = card.getBoundingClientRect();
      const x = r.left + r.width - 40, y = r.top + r.height/2;
      const t = (cx,cy)=> [new Touch({ identifier:1, target:card, clientX:cx, clientY:cy })];
      card.dispatchEvent(new TouchEvent('touchstart', {bubbles:true, touches:t(x,y), targetTouches:t(x,y)}));
      card.dispatchEvent(new TouchEvent('touchmove', {bubbles:true, touches:t(x+ddx/2,y+ddy/2), targetTouches:t(x+ddx/2,y+ddy/2)}));
      card.dispatchEvent(new TouchEvent('touchmove', {bubbles:true, touches:t(x+ddx,y+ddy), targetTouches:t(x+ddx,y+ddy)}));
      card.dispatchEvent(new TouchEvent('touchend', {bubbles:true, touches:[], targetTouches:[]}));
    }, [indice, dx, dy]);
    await page.waitForTimeout(260);
  };
  await chiudiMenu();
  await striscia(0, -90, 4);
  v = await voci();
  ok('strisciando a sinistra compaiono le stesse tre voci', v.length === 3, v);

  console.log('\n── ma scorrere l\'elenco non deve aprire niente ──');
  await chiudiMenu();
  await striscia(0, -30, -120);            // movimento nettamente verticale
  v = await voci();
  ok('uno scorrimento verticale lascia il menu chiuso', v.length === 0, v);
  await chiudiMenu();
  await striscia(0, 90, 4);                // verso destra
  v = await voci();
  ok('e nemmeno una strisciata verso destra lo apre', v.length === 0, v);

  console.log('\n── svuotare un\'idea equivale a buttarla ──');
  await chiudiMenu();
  await page.evaluate(()=>{ window.__undo = null; document.querySelectorAll('.idee-card')[0].click(); });
  await page.waitForTimeout(360);
  await page.evaluate(()=>{
    document.getElementById('idea-editor-testo').value = '   ';
    document.getElementById('idea-editor-chiudi').click();
  });
  await page.waitForTimeout(340);
  s = await stato();
  const nessunUndo = await page.evaluate(()=> !window.__undo);
  ok('la scheda sparisce', s.n === 1, s);
  ok('e non si propone di annullare: cancellarla era il gesto stesso', nessunUndo, nessunUndo);
});
