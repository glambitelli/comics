// Projects — i progetti come fascicoli sulla scrivania
//
// Gira sull'APP VERA, come home-ricerca.js: la scrivania la disegna
// js/fascicoli.js a partire dai progetti di state.js, e la accende
// mostraScaffale in main.js. Un banco che rimontasse i pezzi a mano
// proverebbe una schermata che non esiste.
//
// Cosa deve restare vero (il perche' sta in cima a js/fascicoli.js):
//  - lo scaffale Progetti si apre sui fascicoli, Scene e Jobs no;
//  - un fascicolo per progetto, piu' il posto vuoto per uno nuovo;
//  - otto fascicoli di fila sono otto copertine diverse;
//  - quello al centro sta intero nel telefono, e dei vicini si vede il bordo;
//  - col dito si passa al successivo;
//  - sotto la fila non c'e' niente (contatore e linguette tolti: "disturbante");
//  - un tocco sul fascicolo al centro apre il progetto;
//  - l'elenco di prima resta nel codice, e la scelta resta.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');

module.exports = () => suite("Projects — i progetti come fascicoli sulla scrivania", {
  banco: '/index.html',
  // Il telefono di Giovanni: 360 di larghezza e' il caso piu' stretto.
  viewport: { width: 360, height: 740 },
  pronto: ()=> !!document.querySelector('#screen-home'),
  prima: async (page)=>{
    // Entrati, come Giovanni: senza utente, a volte a meta' prova compariva
    // la schermata d'accesso sopra la scrivania e si prendeva lo swipe.
    await page.addInitScript(()=>{ window.__utente = { uid:'U', email:'g@e.com', displayName:'G' }; });
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
}, async ({ page, ok, sezione }) => {

  await page.waitForTimeout(1800);          // i moduli finiscono di montarsi
  const TITOLI = ['Kara','Il Sentiero','Ruggine','Nebbia','Ossa','Marea','Il Faro','Lupo','Corvo'];
  await page.evaluate(async titoli=>{
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    st.setProjects(titoli.map((t,i)=>{ const p = home.newProjectObj(t, 10 + i); p.id = 'p' + i; return p; }));
    window.openProjects();
  }, TITOLI);
  await page.waitForTimeout(700);

  const stato = ()=> page.evaluate(()=>{
    const scr = document.getElementById('screen-projects');
    const box = document.getElementById('fascicoli');
    const centro = document.querySelector('.fasc.al-centro');
    const r = centro && centro.getBoundingClientRect();
    return {
      acceso: scr.classList.contains('vista-fascicoli'),
      scrivania: getComputedStyle(box).display !== 'none' && box.getBoundingClientRect().height > 200,
      schedeVisibili: Array.from(document.querySelectorAll('.project-card'))
        .filter(c=> c.getBoundingClientRect().height > 0).length,
      fascicoli: document.querySelectorAll('.fasc:not(.fasc-nuovo)').length,
      nuovo: document.querySelectorAll('.fasc-nuovo').length,
      sotto: !!document.querySelector('.fasc-indice, #fasc-conta, #fasc-vista'),
      centro: centro ? {
        i: +centro.dataset.i,
        tit: (centro.querySelector('.fasc-tit b') || {}).textContent || '',
        etich: (centro.querySelector('.fasc-etich') || {}).textContent || '',
        sx: Math.round(r.left), dx: Math.round(r.right), alto: Math.round(r.height),
      } : null,
    };
  });

  sezione('lo scaffale Progetti si apre sulla scrivania');
  let s = await stato();
  ok('la scrivania e\' accesa', s.acceso && s.scrivania, s);
  ok('le schede dell\'elenco non si vedono', s.schedeVisibili === 0, s);
  ok('un fascicolo per progetto', s.fascicoli === TITOLI.length, s);
  ok('piu\' il posto per uno nuovo, in fondo', s.nuovo === 1, s);
  ok('e sotto la fila nient\'altro', !s.sotto, s);
  ok('al centro c\'e\' il primo, col suo titolo', s.centro && s.centro.i === 0 && /kara/i.test(s.centro.tit), s.centro);
  ok('e il numero sull\'etichetta e\' quello della linguetta', s.centro && s.centro.etich.trim() === 'P-0001', s.centro);

  sezione('otto fascicoli di fila sono otto copertine diverse');
  // "voglio che siano uno diverso dall'altro": da due foto, specchiate e
  // tinte. Si confronta quello che si vede davvero: foto, verso e tono.
  const facce = await page.evaluate(()=> Array.from(document.querySelectorAll('.fasc:not(.fasc-nuovo)'))
    .slice(0, 8).map(f=>{ const im = f.querySelector('.fasc-foto');
      return im.getAttribute('src') + '|' + im.style.transform + '|' + im.style.filter; }));
  ok('nessuna uguale a un\'altra', new Set(facce).size === 8, facce);
  const sigilli = await page.evaluate(()=> Array.from(document.querySelectorAll('.fasc:not(.fasc-nuovo)'))
    .every(f=> !!f.querySelector('.fasc-sigillo')));
  ok('e ognuna ha il sigillo blu', sigilli);

  sezione('sul telefono il fascicolo al centro sta intero');
  ok('dentro lo schermo, con un margine per parte', s.centro && s.centro.sx >= 12 && s.centro.dx <= 360 - 12, s.centro);
  ok('e alto abbastanza da leggerlo', s.centro && s.centro.alto >= 300, s.centro);
  const vicino = await page.evaluate(()=>{
    const f = document.querySelector('.fasc[data-i="1"]').getBoundingClientRect();
    return { sx: Math.round(f.left) };
  });
  ok('del successivo si vede il bordo', vicino.sx < 360 && vicino.sx > 360 - 80, vicino);

  sezione('col dito si passa al successivo');
  const swipe = async (da, a)=>{
    await page.mouse.move(da, 380); await page.mouse.down();
    await page.mouse.move(a, 380, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(500);
  };
  await swipe(280, 100);
  s = await stato();
  ok('verso sinistra: il secondo', s.centro && s.centro.i === 1, s.centro);
  await swipe(100, 280);
  s = await stato();
  ok('verso destra: si torna al primo', s.centro && s.centro.i === 0, s.centro);
  await swipe(180, 160);
  s = await stato();
  ok('uno spostamento piccolo non cambia fascicolo', s.centro && s.centro.i === 0, s.centro);

  sezione('in fondo alla fila, il posto per un fascicolo nuovo');
  await page.evaluate(n=> window.__fascicoli.vai(n), TITOLI.length);
  await page.waitForTimeout(500);
  s = await stato();
  ok('si arriva al posto vuoto', s.centro && s.centro.i === TITOLI.length, s.centro);
  await page.mouse.click(180, 380);
  await page.waitForTimeout(400);
  const modale = await page.evaluate(()=> document.getElementById('modal').classList.contains('open'));
  ok('e toccandolo si apre la scheda del progetto nuovo', modale);
  await page.evaluate(()=> document.getElementById('modal').classList.remove('open'));

  sezione('un tocco sul fascicolo al centro apre il progetto');
  await page.evaluate(()=> window.__fascicoli.vai(2));
  await page.waitForTimeout(500);
  await page.mouse.click(180, 380);
  await page.waitForTimeout(500);
  const aperto = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    return { attivo: document.getElementById('screen-project').classList.contains('active'), id: st.currentId };
  });
  ok('si apre Ruggine', aperto.attivo && aperto.id === 'p2', aperto);

  sezione('Scene e Jobs restano come sono');
  await page.evaluate(()=> window.openProjects());
  await page.waitForTimeout(500);
  await page.evaluate(()=> window.setScaffaleProgetti('scene'));
  await page.waitForTimeout(400);
  s = await stato();
  ok('sulle Scene la scrivania si spegne', !s.acceso, s);
  await page.evaluate(()=> window.setScaffaleProgetti('progetti'));
  await page.waitForTimeout(400);
  s = await stato();
  ok('e torna sui Progetti', s.acceso && s.scrivania, s);

  sezione('l\'elenco di prima resta, e la scelta si ricorda');
  await page.evaluate(()=> window.__fascicoli.scegliVista('elenco'));
  await page.waitForTimeout(300);
  s = await stato();
  ok('con la vista a elenco la scrivania si spegne', !s.acceso && s.schedeVisibili === TITOLI.length, s);
  const salvata = await page.evaluate(()=> localStorage.getItem('inkflow-progetti-vista'));
  ok('e la scelta resta per la volta dopo', salvata === 'elenco', salvata);
  await page.click('#fasc-torna');
  await page.waitForTimeout(300);
  s = await stato();
  ok('"Vedi come fascicoli" la riaccende', s.acceso && s.scrivania && s.schedeVisibili === 0, s);
});
