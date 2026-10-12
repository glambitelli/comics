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
        tit: (centro.querySelector('.fasc-tit') || {}).textContent || '',
        etich: (centro.querySelector('.fasc-etich') || {}).textContent || '',
        righe: (centro.querySelector('.fasc-righe') || {}).textContent || '',
        // l'intestazione inventata ("INKFLOW STUDIO DI NARRATIVA DISEGNATA") non torna
        // (il sigillo, che "INKFLOW STUDIO" ce l'ha nel giro, resta: si guarda fuori)
        ente: (()=>{ const st = centro.querySelector('.fasc-stampa'); if(!st) return false; const c = st.cloneNode(true);
          c.querySelectorAll('svg').forEach(x=> x.remove()); return /narrativa|inkflow/i.test(c.textContent); })(),
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
  ok('il titolo sta tra virgolette', s.centro && /^\u201cKara\u201d$/.test(s.centro.tit.trim()), s.centro);
  ok('il numero nella finestrella', s.centro && s.centro.etich.trim() === 'P-0001', s.centro);
  ok('la fase e le tavole sulle righe', s.centro && /Fase\s*Sviluppo/.test(s.centro.righe) && /Tavole\s*10/.test(s.centro.righe), s.centro);
  ok('e niente intestazione inventata', s.centro && !s.centro.ente, s.centro);

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
  // i rumori chiesti finora (il resto dell'app ne chiede altri all'avvio)
  const rumori = ()=> page.evaluate(async ()=>{ const { __rumoriChiesti } = await import('/js/sound.js'); return __rumoriChiesti.splice(0); });
  await rumori();
  await swipe(280, 100);
  s = await stato();
  ok('verso sinistra: il secondo', s.centro && s.centro.i === 1, s.centro);
  const rScorre = await rumori();
  // lo strisciare del cartone c'e' stato ed e' stato tolto: scorrendo, silenzio
  ok('e scorrendo non fa rumore', !rScorre.some(r => /fascicoli|scorre/.test(r)), rScorre);
  await swipe(100, 280);
  s = await stato();
  ok('verso destra: si torna al primo', s.centro && s.centro.i === 0, s.centro);
  await rumori();
  await swipe(180, 160);
  s = await stato();
  ok('uno spostamento piccolo non cambia fascicolo', s.centro && s.centro.i === 0, s.centro);
  const rFermo = await rumori();
  ok('e allora non fa rumore', !rFermo.includes('scorre.mp3'), rFermo);

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

  sezione('un tocco sul fascicolo al centro lo apre sulla scrivania');
  // Dal 12 ottobre 2026 il fascicolo si apre: dentro la scheda del progetto
  // battuta a macchina, il post-it, la tessera. Il progetto vero si apre
  // toccando il foglio.
  await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    const p = st.projects[2];
    p.microtask = 'chiudere gli sfondi della tav. 7';
    p.steps = { moodboard: 1, soggetto: 1 };
  });
  await page.evaluate(()=> window.__fascicoli.vai(2));
  await page.waitForTimeout(500);
  await rumori();
  await page.mouse.click(180, 380);
  await page.waitForTimeout(500);
  const dentro = await page.evaluate(async ()=>{
    const el = document.querySelector('.fasc-interno');
    const testo = sel => Array.from(el.querySelectorAll(sel)).map(e => e.textContent).join(' | ');
    const sx = el && el.querySelector('.fi-sx').getBoundingClientRect();
    const vista = el && el.querySelector('#fi-vista').getBoundingClientRect();
    return {
      aperto: !!el, progetto: document.getElementById('screen-project').classList.contains('active'),
      scheda: el && el.querySelector('.fi-sx').textContent.replace(/\s+/g, ' '),
      rapporto: el && el.querySelector('.fi-dx').textContent.replace(/\s+/g, ' '),
      spunte: el ? el.querySelectorAll('.fi-sx .fi-spunta').length : 0,
      quadri: el ? el.querySelectorAll('.fi-sq').length : 0,
      note: el ? testo('.fi-sx .fi-mano') : '',
      fascia: el && el.querySelector('.fi-fascia').textContent,
      // la prima riga e' l'intestazione stampata: si guarda la seconda, battuta
      carattere: el && getComputedStyle(el.querySelectorAll('.fi-sx .fi-mac')[1]).fontFamily,
      pagina: sx && vista && { largo: Math.round(sx.width), schermo: Math.round(vista.width), alto: Math.round(sx.height), spazio: Math.round(vista.height) },
    };
  });
  ok('si apre il fascicolo, non ancora il progetto', dentro.aperto && !dentro.progetto, dentro);
  ok('la scheda porta titolo, numero e fase', /Ruggine/.test(dentro.scheda) && /P-0003/.test(dentro.scheda) && /Sviluppo/.test(dentro.scheda), dentro.scheda);
  ok('i passi fatti hanno la spunta a penna', dentro.spunte === 2, dentro);
  ok('un quadratino per tavola (Ruggine ne ha 12)', dentro.quadri === 12, dentro);
  ok('nelle note a mano il prossimo passo', /sfondi della tav\. 7/.test(dentro.note), dentro.note);
  ok('il rapporto dice fase e prossimo passo', /fase di sviluppo/.test(dentro.rapporto) && /Prossimo passo: personaggi/.test(dentro.rapporto), dentro.rapporto);
  ok('sulla fascia della tessera il numero', dentro.fascia === 'P-0003', dentro);
  ok('battuto con la macchina da scrivere', /Macchina/.test(dentro.carattere || ''), dentro);
  ok('una pagina sta nello schermo', dentro.pagina && dentro.pagina.largo <= dentro.pagina.schermo + 1 && dentro.pagina.alto <= dentro.pagina.spazio + 1, dentro.pagina);
  const rApri = await rumori();
  ok('con il rumore della copertina che si alza', rApri.includes('apri.mp3'), rApri);

  sezione('niente scritte intorno al fascicolo aperto');
  const scritte = await page.evaluate(()=> ({
    chiudi: !!document.querySelector('#fi-chiudi'), invito: !!document.querySelector('.fi-invito'),
    immagini: document.querySelectorAll('.fasc-interno img:not(.fi-fondo)').length,
  }));
  ok('ne\' "Chiudi" ne\' istruzioni in basso', !scritte.chiudi && !scritte.invito, scritte);
  ok('e nessuna immagine dei riferimenti dentro', scritte.immagini === 0, scritte);

  sezione('Indietro lo richiude');
  // Il tasto Indietro del telefono e quello del browser fanno la stessa cosa:
  // tolgono un passo dalla cronologia.
  await page.evaluate(()=> history.back());
  await page.waitForTimeout(500);
  const chiuso = await page.evaluate(()=> ({ via: !document.querySelector('.fasc-interno'),
    scrivania: document.getElementById('screen-projects').classList.contains('active') }));
  ok('torna la fila dei fascicoli, sempre sulla scrivania', chiuso.via && chiuso.scrivania, chiuso);
  const rChiudi0 = await rumori();
  ok('con il rumore della copertina che ricade', rChiudi0.includes('chiudi.mp3'), rChiudi0);

  sezione('toccando la scheda si apre il progetto');
  await page.mouse.click(180, 380);
  await page.waitForTimeout(400);
  await page.click('#fi-foglio');
  await page.waitForTimeout(500);
  const aperto = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    return { attivo: document.getElementById('screen-project').classList.contains('active'), id: st.currentId };
  });
  ok('si apre Ruggine', aperto.attivo && aperto.id === 'p2', aperto);
  await page.evaluate(()=> history.back());
  await page.waitForTimeout(900);
  const torna = await page.evaluate(()=> ({ scrivania: document.getElementById('screen-projects').classList.contains('active'),
    cartella: !!document.querySelector('.fasc-interno'), tit: (document.querySelector('.fi-sx') || {}).textContent || '' }));
  ok('e Indietro dal progetto riporta alla cartella aperta', torna.scrivania && torna.cartella && /Ruggine/.test(torna.tit), torna);
  await page.evaluate(()=> history.back());
  await page.waitForTimeout(500);
  await rumori();

  sezione('le Scene non ci sono piu\', i Jobs stanno sulla stessa scrivania');
  await page.evaluate(()=> window.openProjects());
  await page.waitForTimeout(500);
  const testa = await page.evaluate(()=>{
    const h = document.querySelector('#screen-projects .projects-header'), cs = getComputedStyle(h);
    return { marchio: h.querySelector('.section-title').getBoundingClientRect().height, sotto: (h.querySelector('.section-sub') || {}).textContent,
      fondo: cs.backgroundImage + ' ' + cs.backgroundColor, bordo: cs.borderBottomWidth,
      linguette: document.querySelector('#screen-projects .projects-tabs').getBoundingClientRect().height };
  });
  ok('restano "Inkflow" e "projects"', testa.marchio > 20 && /projects/.test(testa.sotto), testa);
  ok('ma senza il riquadro intorno', /none/.test(testa.fondo) && /rgba\(0, 0, 0, 0\)|transparent/.test(testa.fondo) && testa.bordo === '0px', testa);
  ok('e niente linguette', testa.linguette === 0, testa);
  await page.evaluate(()=> window.setScaffaleProgetti('scene'));
  await page.waitForTimeout(400);
  s = await stato();
  ok('chiedere le Scene lascia i progetti', s.acceso && s.fascicoli === TITOLI.length, s);
  // Lo swipe dal basso verso l'alto porta ai Jobs: altre cartelle, colorate
  await page.evaluate(async ()=>{ const j = await import('/js/jobs.js');
    j.__seminaJobs([{ id:'j1', titolo:'Nemesis #3', tavole:22, rif:{} }, { id:'j2', titolo:'Copertina', tavole:1, rif:{} }]); });
  const su = async (da, a)=>{ await page.mouse.move(180, da); await page.mouse.down(); await page.mouse.move(180, a, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(700); };
  await su(470, 250);
  const jobs = await page.evaluate(()=>({ scaffale: window.__fascicoli.scaffale(),
    job: document.querySelectorAll('.fasc-job').length, progetti: document.querySelectorAll('.fasc:not(.fasc-job):not(.fasc-nuovo)').length,
    filtro: (document.querySelector('.fasc-job .fasc-foto') || {}).style ? document.querySelector('.fasc-job .fasc-foto').style.filter : '',
    tit: (document.querySelector('.fasc-job .fasc-tit') || {}).textContent }));
  ok('swipe verso l\'alto: le cartelle dei Jobs', jobs.scaffale === 'jobs' && jobs.job === 2 && jobs.progetti === 0, jobs);
  ok('colorate, diverse da quelle dei progetti', /hue-rotate/.test(jobs.filtro), jobs);
  ok('col titolo del lavoro', /Nemesis #3/.test(jobs.tit || ''), jobs);
  await page.mouse.click(180, 380);
  await page.waitForTimeout(500);
  const apertoJob = await page.evaluate(()=> document.getElementById('screen-job').classList.contains('active'));
  ok('toccando quella al centro si apre il lavoro', apertoJob);
  await page.evaluate(()=> history.back());
  await page.waitForTimeout(700);
  const tornatoJobs = await page.evaluate(()=>({ scrivania: document.getElementById('screen-projects').classList.contains('active'), scaffale: window.__fascicoli.scaffale() }));
  ok('Indietro riporta alla scrivania dei Jobs', tornatoJobs.scrivania && tornatoJobs.scaffale === 'jobs', tornatoJobs);
  await su(250, 470);
  s = await stato();
  ok('swipe verso il basso: di nuovo i progetti', s.acceso && s.fascicoli === TITOLI.length && await page.evaluate(()=> window.__fascicoli.scaffale()) === 'progetti', s);

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
