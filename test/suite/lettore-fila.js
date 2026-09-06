// Lettore — la fila delle tavole, e chi passa avanti
//
// IL GUASTO, come e' arrivato (6 settembre 2026): "i file piu' grandi tipo
// opus (500mb) sono un inferno da navigare, richiedono due o tre swipe prima
// di cambiare pagina davvero". Nelle foto il contatore avanzava — 021, poi 029
// — e lo schermo restava nero col glifo che girava.
//
// Non era lo swipe a non funzionare. Posandosi su una tavola l'app ne chiede
// quattro: quella sotto gli occhi, le due vicine e due di scorta. La sorgente
// pigra pero' ne serve UNA per volta (un .cbr passa da un worker solo), quindi
// quelle quattro fanno la fila — e la fila era in ordine di arrivo. Arrivando
// sulla tavola 22, la richiesta della 22 si metteva DIETRO a quella della 20,
// cioe' la pagina che ti eri appena lasciato alle spalle. Dentro un .cbz da
// disco dura un lampo; dentro mezzo giga di .cbr sono secondi, ogni volta.
//
// Qui la sorgente lenta si costruisce a mano: un .cbz vero, letto attraverso un
// Blob che prende cinquanta millisecondi ad ogni pezzo. Le tavole di
// pagine.cbz sono larghe quanto il loro numero, quindi guardando la larghezza
// di ogni immagine man mano che viene materializzata si legge l'ORDINE in cui
// la fila e' stata servita.
const { suite } = require('../motore.js');

module.exports = () => suite("Lettore — la fila delle tavole, e chi passa avanti",
  { banco: '/test/banco/lettore.html' }, async ({ page, base, ok, sezione }) => {

  await page.evaluate(async (url)=>{
    const buf = await (await fetch(url)).arrayBuffer();
    // ── LA SORGENTE LENTA, E A CORSIA UNICA ──
    // Blob.slice non legge niente finche' non si chiede il pezzo: basta
    // rallentare quel momento per avere, in piccolo, un albo enorme.
    // LA CORSIA UNICA E' LA META' CHE CONTA. Un Blob su disco risponde a dieci
    // richieste insieme, e con dieci corsie nessuno aspetta il turno di
    // nessuno: una prova cosi' direbbe che va tutto bene anche quando non e'
    // vero. Un .cbr passa da UN worker (libarchive), Drive da UNA richiesta
    // per volta: se non si riproduce quello, non si sta provando il caso di
    // Giovanni. Qui le letture fanno la fila, una per volta, come la'.
    let corsia = Promise.resolve();
    const f = new File([buf], 'Lento.cbz', { type:'application/zip' });
    const slice = f.slice.bind(f);
    f.slice = (...a)=>{
      const b = slice(...a);
      const ab = b.arrayBuffer.bind(b);
      b.arrayBuffer = ()=>{
        const mio = corsia.then(async ()=>{
          await new Promise(r=> setTimeout(r, 50));
          return ab();
        });
        corsia = mio.catch(()=>{});
        return mio;
      };
      return b;
    };
    // ── IL REGISTRO DELL'ORDINE ──
    // Ogni tavola materializzata passa da createObjectURL. La larghezza dice
    // quale e', e la si legge appena l'immagine e' decodificata.
    window.__ordine = [];
    const vero = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (b)=>{
      const u = vero(b);
      if(b && /image/.test(b.type || '')){
        const posto = window.__ordine.length;
        window.__ordine.push(0);
        const im = new Image();
        im.onload = ()=>{ window.__ordine[posto] = im.naturalWidth; };
        im.src = u;
      }
      return u;
    };
    window.__lento = f;
    window.T = {
      seek(i){
        const s = document.querySelector('.ar-seek');
        s.value = String(i); s.dispatchEvent(new Event('change', { bubbles:true }));
      },
      click(sel){ document.querySelector(sel).dispatchEvent(new MouseEvent('click', { bubbles:true })); },
      mostrata(){
        const c = document.querySelector('.ar-cell-mid') || document.querySelectorAll('.ar-cell')[1];
        const im = c && c.querySelector('img');
        return im && im.complete ? im.naturalWidth : 0;
      },
    };
  }, base + '/test/fixtures/pagine.cbz');

  sezione('un albo che si apre lentamente, come uno da mezzo giga');
  await page.evaluate(()=> window.albums.openAlbumFromFile(window.__lento));
  await page.waitForFunction(()=> window.__ordine.filter(Boolean).length >= 1, { timeout: 15000 });
  await page.waitForTimeout(900);
  const apertura = await page.evaluate(()=> ({
    ordine: window.__ordine.slice(), mostrata: T.mostrata(),
  }));
  ok('la prima tavola arriva', apertura.mostrata === 1, apertura);
  // Aperto l'albo, la seconda e' quella che serve: e' l'unica direzione in cui
  // si puo' andare.
  ok('e subito dopo si prepara la seconda',
     apertura.ordine.indexOf(2) > 0, apertura.ordine);

  sezione('e girando pagina, la tavola che chiedi passa davanti a tutte');
  // Ci si porta a meta' albo: da li' la fila ha da servire sia avanti sia
  // indietro, ed e' l'unico punto in cui si vede chi ha la precedenza.
  await page.evaluate(()=>{ T.seek(5); });          // tavola 6
  await page.waitForFunction(()=> T.mostrata() === 6, { timeout: 15000 });
  await page.evaluate(()=>{ window.__ordine.length = 0; });
  // E si gira pagina SUBITO, mentre la fila e' ancora piena di vicine: e'
  // esattamente il momento in cui prima si restava sul nero.
  await page.evaluate(()=>{ T.click('.ar-next'); });
  await page.waitForFunction(()=> window.__ordine.includes(7), { timeout: 15000 });
  const dopoIlGiro = await page.evaluate(()=> window.__ordine.filter(Boolean));
  const posto7 = dopoIlGiro.indexOf(7);
  const posto5 = dopoIlGiro.indexOf(5);
  ok('la tavola chiesta viene servita', posto7 >= 0, dopoIlGiro);
  // IL PUNTO DI TUTTA LA FACCENDA: la 7 e' quella che si sta guardando, la 5
  // e' alle spalle. Se la 5 passa prima, chi legge resta sul nero per il tempo
  // di una tavola che non ha chiesto — e su un .cbr sono secondi.
  ok('e passa davanti a quella che ti sei lasciato alle spalle',
     posto5 === -1 || posto7 < posto5, { dopoIlGiro, posto7, posto5 });
  await page.waitForFunction(()=> T.mostrata() === 7, { timeout: 15000 });
  ok('e la tavola nuova arriva davvero a schermo', true);

  sezione('e una tavola chiesta dopo scavalca quelle rimaste in fila');
  // IL CASO VERO, quello delle foto. Posandosi su una tavola l'app ne mette in
  // fila quattro; se nel frattempo il dito e' andato avanti di due, la tavola
  // sotto gli occhi ADESSO e' l'ultima arrivata in fila — e con una corsia
  // sola, senza precedenze, aspetta che siano finite tutte le altre. Sono i
  // secondi di schermo nero fra uno swipe e l'altro.
  // Prima si va all'inizio: la finestra di tavole tenute in memoria segue chi
  // legge, quindi da li' quelle di meta' albo sono state liberate e vanno
  // estratte di nuovo. Senza questo passaggio la prova misurerebbe una fila
  // che non ha niente da fare, e passerebbe sempre.
  await page.evaluate(()=>{ T.seek(0); });
  await page.waitForFunction(()=> T.mostrata() === 1, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(()=>{ T.seek(5); });                 // di nuovo a tavola 6
  await page.waitForFunction(()=> T.mostrata() === 6, { timeout: 15000 });
  await page.evaluate(()=>{
    window.__ordine.length = 0;
    // Due giri di pagina di fila, senza aspettare: la fila e' ancora piena di
    // vicine di quando si era sulla 6.
    T.click('.ar-next'); T.click('.ar-next');
  });
  await page.waitForFunction(()=> T.mostrata() === 8, { timeout: 20000 });
  const sorpasso = await page.evaluate(()=> window.__ordine.filter(Boolean));
  const posto8 = sorpasso.indexOf(8);
  const spalle = [5, 4].map(n => sorpasso.indexOf(n)).filter(i => i >= 0);
  ok('la tavola su cui sei atterrato arriva', posto8 >= 0, sorpasso);
  ok('e scavalca tutte quelle rimaste in fila alle tue spalle',
     spalle.every(i => posto8 < i), { sorpasso, posto8, spalle });

  sezione('e saltando lontano, il lavoro rimasto per strada si butta');
  // Un salto scavalca la finestra utile: quello che era in fila per le tavole
  // vicine non interessa piu' a nessuno, e farlo estrarre vorrebbe dire far
  // aspettare la tavola su cui si e' atterrati.
  await page.evaluate(()=>{ window.__ordine.length = 0; T.seek(11); });
  await page.waitForFunction(()=> T.mostrata() === 12, { timeout: 15000 });
  await page.waitForTimeout(600);
  const dopoIlSalto = await page.evaluate(()=> window.__ordine.filter(Boolean));
  ok('si estrae solo roba vicina a dove sei atterrato',
     dopoIlSalto.every(n => Math.abs(n - 12) <= 3), dopoIlSalto);
});
