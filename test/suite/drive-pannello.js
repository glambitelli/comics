// Il pannello Drive — il tocco deve arrivare al pulsante
//
// Il difetto, raccontato tre volte e cercato due volte nel posto sbagliato: si
// premeva "Ricollega Google Drive" e non succedeva niente. Non era il codice
// del collegamento — era il VELO.
//
// Il velo e' il rettangolo trasparente che copre la schermata mentre il
// pannello e' aperto, e serve a una cosa sola: chiudere il pannello se si tocca
// fuori. Stava fuori dal gruppo del bollino, a z-index 230, mentre il bollino e
// il suo pannello vivono a 60: il velo finiva sopra al pannello, e ogni tocco
// dentro al pannello lo prendeva lui. Il pannello si chiudeva e il pulsante non
// veniva nemmeno sfiorato.
//
// Questa suite non guarda i numeri degli strati: guarda CHI c'e' sotto al dito,
// che e' l'unica cosa che decide.
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — il pannello lascia passare il tocco", {"banco": "/test/banco/tavole.html"}, async ({ page, ok, sezione }) => {

  sezione('col pannello aperto, sotto il dito c\'e\' il pulsante');
  await page.evaluate(()=>{
    window.__driveConfigurato = true;   // cosi' il pulsante viene disegnato
    window.__collegaChiesto = 0;
    window.toggleRefsProfile();
  });
  await page.waitForTimeout(400);
  const sotto = await page.evaluate(()=>{
    const b = document.querySelector('#rp-drive .rp-btn');
    const q = b.getBoundingClientRect();
    const el = document.elementFromPoint(q.left + q.width/2, q.top + q.height/2);
    return {
      testo: b.textContent.trim(),
      chi: el ? (el.id || el.className || el.tagName) : null,
      dentroIlPulsante: !!(el && (el === b || b.contains(el))),
      veloAperto: !document.getElementById('refs-profile-backdrop').hidden,
    };
  });
  ok('il pulsante c\'e\' ed e\' quello giusto', /google drive/i.test(sotto.testo), sotto);
  ok('il velo e\' alzato, come dev\'essere', sotto.veloAperto, sotto);
  ok('ma sotto il dito c\'e\' il pulsante, non il velo', sotto.dentroIlPulsante, sotto);

  sezione('e premendolo parte davvero il collegamento');
  // Clic VERO di Playwright: arriva dove arriverebbe un dito, e se qualcosa gli
  // sta davanti finisce li' invece che sul pulsante.
  await page.click('#rp-drive .rp-btn');
  await page.waitForTimeout(300);
  const dopo = await page.evaluate(()=>({
    chiamate: window.__collegaChiesto,
    pannelloAperto: document.getElementById('refs-profile-panel').classList.contains('open'),
  }));
  ok('connectDrive viene chiamata una volta', dopo.chiamate === 1, dopo);
  ok('e il pannello non si e\' limitato a chiudersi', dopo.pannelloAperto, dopo);

  sezione('toccando FUORI, invece, il pannello si chiude');
  // Il velo deve continuare a fare il suo mestiere: e' l'altra meta' della
  // correzione, e senza questa prova si sarebbe potuto "aggiustare" il tocco
  // togliendo il velo di mezzo.
  const fuori = await page.evaluate(async ()=>{
    const el = document.elementFromPoint(12, 300);
    const chi = el ? (el.id || el.className || el.tagName) : null;
    document.getElementById('refs-profile-backdrop')
      .dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    return { chi, aperto: document.getElementById('refs-profile-panel').classList.contains('open') };
  });
  ok('lontano dal pannello sotto il dito c\'e\' il velo',
     /backdrop/.test(fuori.chi || ''), fuori);
  ok('e toccandolo il pannello si chiude', !fuori.aperto, fuori);

  sezione('chiuso il pannello, il velo non intercetta piu\' niente');
  // Restava aperto passando da una schermata all'altra (corretto tempo fa in
  // hideAllScreens): un velo invisibile dimenticato acceso e' una schermata
  // che non risponde piu' ai tocchi, senza che si veda perche'.
  await page.waitForTimeout(300);
  const spento = await page.evaluate(()=> document.getElementById('refs-profile-backdrop').hidden);
  ok('il velo si spegne insieme al pannello', spento, spento);

});
