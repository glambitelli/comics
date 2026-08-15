// Home — la ricerca progetti compare quando serve, e non prima
//
// Gira sull'APP VERA (come navigazione.js): la soglia dipende da quanti
// progetti ci sono davvero in state.js e da renderHome che li disegna. Un
// banco che rimontasse i due a mano proverebbe una home che non esiste.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');

module.exports = () => suite("Home — la ricerca progetti compare quando serve", {
  banco: '/index.html',
  pronto: ()=> !!document.querySelector('#screen-home'),
  prima: async (page)=>{
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
}, async ({ page, ok, sezione }) => {

  await page.waitForTimeout(1800);          // i moduli finiscono di montarsi

  // I moduli si prendono con un import dinamico DALLA PAGINA: stesso URL,
  // quindi stessa istanza già caricata dall'app — non una copia.
  const conProgetti = async n=>{
    await page.evaluate(async quanti=>{
      const st = await import('/js/state.js');
      const home = await import('/js/home.js');
      st.setProjects(Array.from({length:quanti},(_,i)=> home.newProjectObj('Progetto '+(i+1), 10)));
      // Gli id nascono da Date.now(): creati nello stesso millisecondo
      // sarebbero tutti uguali, e le schede si confonderebbero fra loro.
      st.projects.forEach((p,i)=>{ p.id = 'p'+i; });
      home.renderHome();
    }, n);
    await page.waitForTimeout(200);
  };
  const barra = ()=> page.evaluate(()=>{
    const b = document.getElementById('search-bar');
    const r = b.getBoundingClientRect();
    return {
      visibile: getComputedStyle(b).display !== 'none' && r.height > 0,
      schede: document.querySelectorAll('.project-card').length,
      // Sopra la lista, non in fondo allo schermo: era la richiesta esplicita.
      sopraLaLista: (()=>{
        const c = document.querySelector('.project-card');
        return c ? r.bottom <= c.getBoundingClientRect().top + 1 : null;
      })(),
      lente: !!document.querySelector('.header-search-btn'),
    };
  });

  sezione('con pochi progetti non c\'e\' niente da cercare');
  await conProgetti(3);
  let b = await barra();
  ok('le schede ci sono', b.schede === 3, b);
  ok('il campo di ricerca non compare', !b.visibile, b);
  ok('e la lente nell\'intestazione non esiste piu\'', !b.lente, b);

  sezione('quando la lista si allunga il campo compare da solo');
  await conProgetti(8);
  b = await barra();
  ok('il campo c\'e\'', b.visibile, b);
  ok('e sta sopra la lista, non in fondo allo schermo', b.sopraLaLista === true, b);

  sezione('e filtra davvero');
  await page.evaluate(()=>{
    const i = document.getElementById('search-input');
    i.value = 'Progetto 3';
    i.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.waitForTimeout(150);
  const filtrate = await page.evaluate(()=> Array.from(document.querySelectorAll('.project-card'))
    .filter(c=> getComputedStyle(c).display !== 'none')
    .map(c=> c.querySelector('.card-title').textContent));
  ok('resta solo quello cercato', filtrate.length === 1 && /Progetto 3/.test(filtrate[0]), filtrate);

  sezione('tornando pochi, il filtro non resta acceso di nascosto');
  // Il caso che farebbe piu' danno: si cerca, si cancellano progetti, il campo
  // sparisce con dentro ancora il testo — e la home mostra tre schede su otto
  // senza che si veda piu' il motivo.
  await conProgetti(2);
  const dopo = await page.evaluate(()=>({
    visibile: getComputedStyle(document.getElementById('search-bar')).display !== 'none',
    testo: document.getElementById('search-input').value,
    visibili: Array.from(document.querySelectorAll('.project-card'))
      .filter(c=> getComputedStyle(c).display !== 'none').length,
  }));
  ok('il campo sparisce', !dopo.visibile, dopo);
  ok('il testo si azzera', dopo.testo === '', dopo);
  ok('e si rivedono tutti i progetti', dopo.visibili === 2, dopo);

});
