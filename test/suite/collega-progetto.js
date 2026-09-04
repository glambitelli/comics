// Aggiungere riferimenti a un progetto — il viaggio che si interrompeva a metà
//
// Dentro un progetto c'è il pannello "Riferimenti visivi" con una tessera
// "Aggiungi". Premendola si finiva nell'archivio — e basta: il progetto da cui
// si veniva era dimenticato, e da lì non c'era nessun modo di dire "questo va
// su Kara". L'unica strada era sapere che si apre il menu dei tre puntini di
// UNA singola miniatura e che dentro c'è "Collega a progetto": due livelli, una
// immagine per volta, e nessuna scritta che lo dica. Il viaggio cominciava e si
// interrompeva a metà.
//
// Adesso il progetto viaggia con te: una striscia in cima dice per chi stai
// scegliendo, le miniature già collegate hanno la spunta, e un tocco collega o
// scollega invece di aprire.
const { suite } = require('../motore.js');

module.exports = () => suite("Riferimenti — aggiungerli a un progetto senza perdersi", {
  banco: '/test/banco/tavole.html',
}, async ({ page, ok, sezione }) => {

  const apriGriglia = async ()=>{
    await page.evaluate(()=>{
      window.semina(4, 0);
      window.__projects.length = 0;
      window.__projects.push({ id:'p1', title:'Il Sentiero', color:'#4ab8d8' });
      window.__projects.push({ id:'p2', title:'Ossidiana', color:'#e0605a' });
      window.refs.openAllGrid();
    });
    await page.waitForTimeout(300);
  };

  sezione('senza progetto, l\'archivio è l\'archivio di sempre');
  await apriGriglia();
  const normale = await page.evaluate(()=>({
    striscia: document.getElementById('refs-per-progetto').hidden,
    progetto: window.refs.progettoInCorso(),
  }));
  ok('la striscia non c\'è', normale.striscia === true, normale);
  ok('e nessun progetto in corso', normale.progetto === null, normale);

  sezione('arrivando da un progetto, la striscia dice per chi stai scegliendo');
  await page.evaluate(()=> window.refs.scegliPerProgetto('p1'));
  await page.waitForTimeout(250);
  const inCorso = await page.evaluate(()=>{
    const r = document.getElementById('refs-per-progetto');
    return {
      visibile: !r.hidden,
      testo: r.textContent.replace(/\s+/g,' ').trim(),
      progetto: window.refs.progettoInCorso(),
      // Le spunte si vedono senza dover tenere premuto: qui scegliere è il
      // motivo per cui si è arrivati, non un gesto da scoprire.
      spunteVisibili: document.querySelector('.refs-grid').classList.contains('scegliendo'),
    };
  });
  ok('la striscia compare', inCorso.visibile, inCorso);
  // IL NOME DEL PROGETTO, non un generico "un progetto": chi ha due lavori
  // aperti deve sapere su quale sta lavorando prima di toccare.
  ok('e dice il nome del progetto', /Il Sentiero/.test(inCorso.testo), inCorso);
  ok('lo dice come un\'aggiunta, non come un comando', /aggiungi/i.test(inCorso.testo), inCorso);
  ok('il progetto è quello', inCorso.progetto === 'p1', inCorso);
  ok('e le spunte si vedono subito', inCorso.spunteVisibili, inCorso);

  sezione('un tocco collega, un altro scollega');
  // Prima un tocco apriva l'immagine a schermo intero: giusto quando si sta
  // guardando l'archivio, sbagliato quando si è venuti apposta per collegare.
  const collegato = await page.evaluate(()=>{
    const t = document.querySelector('.refs-thumb');
    const id = t.dataset.id;
    t.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    const dopo = window.refs.getRefs().find(r=> r.id === id);
    return {
      id,
      collegati: dopo.projectIds || [],
      // E non si è aperta la vista a schermo intero.
      lightbox: document.getElementById('refs-lightbox').classList.contains('open'),
    };
  });
  ok('l\'immagine finisce sul progetto', collegato.collegati.includes('p1'), collegato);
  ok('e non si apre a schermo intero', !collegato.lightbox, collegato);

  await page.waitForTimeout(250);
  const spuntata = await page.evaluate(()=>{
    const t = document.querySelector('.refs-thumb');
    return { spunta: t.querySelector('.refs-spunta').classList.contains('on'),
             conto: document.getElementById('refs-pp-conto').textContent };
  });
  ok('la spunta lo dice a colpo d\'occhio', spuntata.spunta, spuntata);
  ok('e la striscia conta quanti ne hai collegati', /1/.test(spuntata.conto), spuntata);

  const scollegato = await page.evaluate(()=>{
    const t = document.querySelector('.refs-thumb');
    const id = t.dataset.id;
    t.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    return (window.refs.getRefs().find(r=> r.id === id).projectIds) || [];
  });
  ok('toccandola di nuovo si scollega', !scollegato.includes('p1'), scollegato);

  sezione('gli altri progetti non si toccano');
  // Un ritaglio può servire a più lavori: collegarlo a uno non deve staccarlo
  // dagli altri.
  const altri = await page.evaluate(()=>{
    const t = document.querySelector('.refs-thumb');
    const id = t.dataset.id;
    window.refs.getRefs().find(r=> r.id === id).projectIds = ['p2'];
    t.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    return (window.refs.getRefs().find(r=> r.id === id).projectIds) || [];
  });
  ok('quello di prima resta', altri.includes('p2'), altri);
  ok('e si aggiunge il nuovo', altri.includes('p1'), altri);

  sezione('finito, l\'archivio torna quello di sempre');
  await page.evaluate(()=> window.refs.scegliPerProgetto(null));
  await page.waitForTimeout(250);
  const finito = await page.evaluate(()=>({
    striscia: document.getElementById('refs-per-progetto').hidden,
    progetto: window.refs.progettoInCorso(),
  }));
  ok('la striscia sparisce', finito.striscia === true, finito);
  ok('e nessun progetto resta in corso', finito.progetto === null, finito);
  // ENTRARE DALLA BARRA SPEGNE LA MODALITA': se restasse accesa da un viaggio
  // di mezz'ora prima, i tocchi collegherebbero immagini a un progetto a cui
  // non stavi piu' pensando.
  const dallaBarra = await page.evaluate(()=>{
    window.refs.scegliPerProgetto('p1');
    window.refs.scegliPerProgetto(null);   // com'e' chiamata da openRefsScreen()
    return window.refs.progettoInCorso();
  });
  ok('e entrando dalla barra la modalità è spenta', dallaBarra === null, dallaBarra);

});
