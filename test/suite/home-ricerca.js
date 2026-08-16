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

  sezione('le schede sono tutte della stessa altezza');
  // Il difetto: la riga di stato conteneva anche la scadenza, e su un telefono
  // andava a capo appena il progetto ne aveva una. Quella scheda diventava piu'
  // alta delle altre — in un elenco di schede uguali, una piu' alta sembra un
  // errore. Qui si mettono a confronto i tre casi che facevano la differenza:
  // con scadenza, senza, e con un titolo lungo il doppio della riga.
  const altezze = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    const p1 = home.newProjectObj('Kara', 10);
    const p2 = home.newProjectObj('Test', 10);
    const p3 = home.newProjectObj('Un titolo lunghissimo che non ci sta nella riga nemmeno a spingerlo', 120);
    p1.id='p1'; p2.id='p2'; p3.id='p3';
    p1.dateEnd = '2020-01-31';            // scaduta da un pezzo
    p3.dateEnd = '2030-01-31';            // ancora lontana
    delete p2.createdAt;                  // un progetto vecchio, senza data
    st.setProjects([p1,p2,p3]);
    home.renderHome();
    await new Promise(r=>setTimeout(r,250));
    const schede = Array.from(document.querySelectorAll('.project-card'));
    return {
      alte: schede.map(c=> Math.round(c.getBoundingClientRect().height)),
      // Nessuna delle righe deve andare a capo: e' quello che le tiene uguali.
      righe: schede.map(c=>{
        const m = c.querySelector('.card-meta');
        const s = c.querySelector('.card-sub');
        return [Math.round(m.getBoundingClientRect().height),
                Math.round(s.getBoundingClientRect().height)];
      }),
      // La scadenza passata si vede, e si vede che e' passata.
      scaduta: (()=>{
        const el = schede[0].querySelector('.card-scad');
        if(!el) return null;
        const r = el.getBoundingClientRect();
        const riga = schede[0].querySelector('.card-sub').getBoundingClientRect();
        return { testo: el.textContent, acceso: el.classList.contains('oltre'),
                 // A 10px in color rame si leggeva solo sapendo gia' cosa
                 // c'era scritto: ora e' una pastiglia, e deve starci DENTRO
                 // la riga, non finire tagliata dai puntini.
                 corpo: parseFloat(getComputedStyle(el).fontSize),
                 intera: r.right <= riga.right + 1 && r.width > 60 };
      })(),
      // La riga di stato non se la porta piu' dietro.
      statoPulito: !/scaduto/i.test(schede[0].querySelector('.card-meta').textContent),
    };
  });
  ok('tutte e tre alte uguale', new Set(altezze.alte).size === 1, altezze.alte);
  ok('nessuna riga va a capo',
     altezze.righe.every(([m,s])=> m <= 20 && s <= 20), altezze.righe);
  ok('la scadenza sta con le date e si accende quando e\' passata',
     altezze.scaduta && /scaduto/i.test(altezze.scaduta.testo) && altezze.scaduta.acceso,
     altezze.scaduta);
  ok('e si legge: pastiglia intera, non tagliata',
     altezze.scaduta && altezze.scaduta.intera && altezze.scaduta.corpo >= 11,
     altezze.scaduta);
  ok('e non e\' piu\' in mezzo alla riga di stato', altezze.statoPulito, altezze);

});
