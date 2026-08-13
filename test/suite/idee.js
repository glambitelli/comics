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

  console.log('\n── si riapre un\'idea e la si allunga ──');
  await page.evaluate(()=> document.querySelectorAll('.idee-card')[1].click());
  await page.waitForTimeout(350);
  let ed = await page.evaluate(()=> ({
    aperto: document.getElementById('idea-editor').classList.contains('open'),
    testo: document.getElementById('idea-editor-testo').value,
    azione: document.getElementById('idea-editor-promuovi').textContent,
  }));
  ok('l\'editor si apre sul testo giusto', ed.aperto && ed.testo === 'Il ladro di ombre', ed);
  ok('e propone di farne un progetto', /Diventa progetto/.test(ed.azione), ed);

  await page.evaluate(()=>{
    document.getElementById('idea-editor-testo').value = 'Il ladro di ombre\nRuba le ombre, non gli oggetti.';
    document.getElementById('idea-editor-chiudi').click();
  });
  await page.waitForTimeout(260);
  s = await stato();
  ok('chiudendo si salva quello che si e\' scritto', /Ruba le ombre/.test(s.resti[0] || ''), s);
  ok('e l\'idea appena toccata risale in cima', s.titoli[0] === 'Il ladro di ombre', s);
  ok('senza creare un doppione', s.n === 2, s);

  console.log('\n── da idea a progetto ──');
  await page.evaluate(()=>{ window.__salvati = []; window.__aperti = []; window.openProject = id=>window.__aperti.push(id); });
  await page.evaluate(()=> document.querySelectorAll('.idee-card')[0].click());
  await page.waitForTimeout(350);
  await page.evaluate(()=> document.getElementById('idea-editor-promuovi').click());
  await page.waitForTimeout(400);
  const nato = await page.evaluate(()=> ({
    quanti: window.__salvati.length,
    titolo: window.__salvati[0] && window.__salvati[0].title,
    scriptment: window.__salvati[0] && window.__salvati[0].scriptment.text,
    aperti: window.__aperti,
    editorChiuso: !document.getElementById('idea-editor').classList.contains('open'),
  }));
  ok('nasce un progetto solo', nato.quanti === 1, nato);
  ok('col titolo preso dalla prima riga', nato.titolo === 'Il ladro di ombre', nato);
  ok('e TUTTO il testo dentro lo scriptment, non solo il titolo',
     /Ruba le ombre/.test(nato.scriptment || ''), nato);
  ok('l\'editor si chiude e si atterra sul progetto nuovo',
     nato.editorChiuso && nato.aperti.length === 1, nato);

  s = await stato();
  ok('l\'idea resta in elenco', s.n === 2, s);
  ok('con la targa di dov\'e\' finita', /Il ladro di ombre/.test(s.targhe[0] || ''), s);

  console.log('\n── promuovere due volte creerebbe due progetti: non si puo\' ──');
  await page.evaluate(()=> document.querySelectorAll('.idee-card')[0].click());
  await page.waitForTimeout(350);
  ed = await page.evaluate(()=> document.getElementById('idea-editor-promuovi').textContent);
  ok('l\'azione diventa "apri il progetto"', /^Apri /.test(ed), ed);
  await page.evaluate(()=> document.getElementById('idea-editor-promuovi').click());
  await page.waitForTimeout(400);
  const dopo = await page.evaluate(()=> ({ quanti: window.__salvati.length, aperti: window.__aperti.length }));
  ok('nessun secondo progetto', dopo.quanti === 1, dopo);
  ok('ma il progetto si apre lo stesso', dopo.aperti === 2, dopo);

  console.log('\n── buttare via un\'idea ──');
  await page.evaluate(()=>{ window.__conferma = false; document.querySelectorAll('.idee-card')[1].click(); });
  await page.waitForTimeout(350);
  await page.evaluate(()=> document.getElementById('idea-editor-elimina').click());
  await page.waitForTimeout(300);
  s = await stato();
  ok('dicendo di no non si butta niente', s.n === 2, s);

  await page.evaluate(()=>{ window.__conferma = true; document.getElementById('idea-editor-elimina').click(); });
  await page.waitForTimeout(350);
  s = await stato();
  const chiuso = await page.evaluate(()=> !document.getElementById('idea-editor').classList.contains('open'));
  ok('dicendo di si\' l\'idea sparisce', s.n === 1 && s.titoli[0] === 'Il ladro di ombre', s);
  ok('e l\'editor si chiude da solo', chiuso, chiuso);

  console.log('\n── svuotare un\'idea equivale a buttarla ──');
  await page.evaluate(()=> document.querySelectorAll('.idee-card')[0].click());
  await page.waitForTimeout(350);
  await page.evaluate(()=>{
    document.getElementById('idea-editor-testo').value = '   ';
    document.getElementById('idea-editor-chiudi').click();
  });
  await page.waitForTimeout(300);
  s = await stato();
  ok('il taccuino torna vuoto senza chiedere conferma per un foglio bianco',
     s.n === 0 && s.vuoto, s);
});
