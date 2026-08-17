// References — l'anagrafica degli artisti e i menu contestuali
const { suite } = require('../motore.js');

module.exports = () => suite("References — artisti e menu contestuali", {"banco": "/test/banco/tavole.html"}, async ({ page, ok, sezione }) => {

  const CARTELLE = [
    { id:'a1', category:'Artists', cognome:'Otomo', nome:'Katsuhiro', name:'Otomo Katsuhiro' },
    { id:'a2', category:'Artists', cognome:'Kon',   nome:'Satoshi',   name:'Kon Satoshi' },
    // Una cartella vecchia, nata prima dei due campi: deve continuare a
    // comparire com'era, senza inventarle un cognome.
    { id:'a3', category:'Artists', name:'MOEBIUS' },
    { id:'s1', category:'Study',   name:'Hands' },
  ];
  const apri = async ()=>{
    await page.evaluate(c=>{ window.seminaCartelle(c); window.setArchivio('artists'); }, CARTELLE);
    await page.waitForTimeout(300);
  };
  // Le cartelle di Study vivono nella scheda References (vedi tag.js): per
  // guardarle bisogna passare di la'.
  const vaiA = async asse=>{
    await page.evaluate(a=>{ window.setArchivio(a); }, asse);
    await page.waitForTimeout(250);
  };
  const righeVisibili = ()=> page.evaluate(()=> Array.from(document.querySelectorAll('.refs-folder-row')).map(r=>{
    const m = r.querySelector('.refs-mono');
    return { testo: r.querySelector('.refs-folder-name').textContent.trim(),
             sigla: m ? m.textContent : null,
             semplice: !!r.querySelector('.rf-semplice'),
             sfondo: m ? getComputedStyle(m).backgroundColor : null };
  }));

  sezione('un artista si scrive COGNOME + nome');
  await apri();
  const righe = await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-folder-row')).map(r=>{
    const riga = r.querySelector('.refs-folder-name');
    const cg = r.querySelector('.rf-cognome'), nm = r.querySelector('.rf-nome');
    const st = cg ? getComputedStyle(cg) : null;
    const stn = nm ? getComputedStyle(nm) : null;
    const base = getComputedStyle(riga);
    return {
      testo: riga.textContent.trim(),
      cognome: cg ? cg.textContent : null,
      nome: nm ? nm.textContent : null,
      maiuscolo: st ? st.textTransform : null,
      // Il nome non deve avere NIENTE di suo: stesso carattere, stesso corpo,
      // stesso peso, stesso colore della riga. La prima versione lo metteva in
      // un serif corsivo, e in un elenco di cartelle era un corpo estraneo.
      stessaFamiglia: stn ? stn.fontFamily === base.fontFamily : null,
      stessoColore:   stn ? stn.color === base.color : null,
      corpoCognome: st ? st.fontSize : null,
      corpoNome:    stn ? stn.fontSize : null,
      pesoCognome:  st ? st.fontWeight : null,
      pesoNome:     stn ? stn.fontWeight : null,
      // Due blocchi impilati: il nome comincia sotto la fine del cognome.
      aCapo: !!(st && stn && st.display === 'block' && stn.display === 'block'),
      cognomeSotto: cg ? Math.round(cg.getBoundingClientRect().bottom) : null,
      nomeSotto:    nm ? Math.round(nm.getBoundingClientRect().bottom) : null,
      cognomeUnaRiga: cg ? cg.getBoundingClientRect().height < 26 : null,
      nomeUnaRiga:    nm ? nm.getBoundingClientRect().height < 22 : null,
      corsivo: stn ? stn.fontStyle : null,
      trasformaNome: stn ? stn.textTransform : null,
      semplice: !!r.querySelector('.rf-semplice'),
    };
  }));
  // Si cerca per contenuto e non per posizione: l'elenco e' ordinato
  // alfabeticamente, quindi l'ordine in cui si seminano non e' quello in cui
  // escono.
  const otomo   = righe.find(r=> r.cognome === 'Otomo');
  const vecchia = righe.find(r=> r.testo === 'MOEBIUS');

  ok('il cognome e il nome sono due pezzi distinti',
     otomo && otomo.nome === 'Katsuhiro', otomo);
  ok('solo il cognome e\' in maiuscolo', otomo && otomo.maiuscolo === 'uppercase', otomo);
  ok('il nome si scrive com\'e\' stato scritto',
     otomo && otomo.trasformaNome === 'none' && otomo.corsivo === 'normal', otomo);
  // SU DUE RIGHE, e non piu' affiancati. Con lo stesso corpo e lo stesso peso
  // facevano una parola sola lunga: adesso i cognomi si incolonnano e scendere
  // l'elenco vuol dire leggere solo quelli.
  ok('stanno su due righe, uno sotto l\'altro',
     otomo && otomo.aCapo && otomo.nomeSotto > otomo.cognomeSotto - 1, otomo);
  ok('il cognome pesa di piu\' del nome',
     otomo && parseFloat(otomo.pesoCognome) > parseFloat(otomo.pesoNome), otomo);
  ok('e il nome e\' piu\' piccolo e piu\' chiaro',
     otomo && parseFloat(otomo.corpoNome) < parseFloat(otomo.corpoCognome)
     && otomo.stessoColore === false, otomo);
  ok('nessuna delle due righe va a capo per conto suo',
     otomo && otomo.nomeUnaRiga && otomo.cognomeUnaRiga, otomo);
  ok('e con lo stesso carattere di tutte le altre righe',
     otomo && otomo.stessaFamiglia, otomo);
  ok('una cartella vecchia resta una riga sola',
     vecchia && vecchia.semplice && vecchia.cognome === null, vecchia);
  await vaiA('references');
  const soggetto = (await righeVisibili()).find(r=> r.testo === 'Hands');
  ok('e cosi\' anche quelle che non sono persone',
     soggetto && soggetto.semplice, soggetto);
  await vaiA('artists');

  sezione('la rubrica: un disco con le iniziali per ogni cartella');
  const dischi = await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-folder-row')).map(r=>{
    const m = r.querySelector('.refs-mono');
    const st = m ? getComputedStyle(m) : null;
    return {
      nome: r.querySelector('.refs-folder-name').textContent.trim(),
      sigla: m ? m.textContent : null,
      tondo: st ? st.borderRadius : null,
      sfondo: st ? st.backgroundColor : null,
      // Niente piu' schede: le righe si separano con un capello, non con un
      // bordo tutto attorno.
      bordi: getComputedStyle(r).borderTopWidth + '/' + getComputedStyle(r).borderBottomWidth,
    };
  }));
  ok('ogni riga ha il suo disco', dischi.every(d=> !!d.sigla), dischi);
  ok('con DUE lettere, prese dal cognome',
     dischi.find(d=>/otomo/i.test(d.nome)).sigla === 'OT', dischi);
  await vaiA('references');
  const hands = (await righeVisibili()).find(d=>/hands/i.test(d.testo));
  await vaiA('artists');
  ok('e da chi un cognome non ce l\'ha, dal nome', hands && hands.sigla === 'HA', hands);
  // Un oro solo, quello del task di stasera: il colore per cartella non diceva
  // niente che le due lettere non dicessero gia' meglio, e un elenco a scalare
  // di marroni sembrava un degrade'.
  ok('i dischi sono tutti dello stesso oro',
     new Set(dischi.map(d=>d.sfondo)).size === 1, dischi.map(d=>d.sfondo));
  ok('ed e\' quello del task di stasera',
     dischi[0].sfondo === 'rgb(226, 182, 44)', dischi[0]);
  ok('e sulle righe non ci sono numeri',
     !(await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-folder-row'))
        .some(r=> /\d/.test(r.textContent)))), null);
  ok('le righe non sono piu\' schede col bordo',
     dischi.every(d=> d.bordi.startsWith('0px')), dischi.map(d=>d.bordi));

  sezione('Artists e References sono un interruttore, non due pulsanti');
  // Quinta versione, e la piu' silenziosa. Le altre, in ordine: due parole con
  // un trattino sotto (dicevano "titolo", non "scelta"); due linguette di
  // schedario (metafora carina e ingombrante); una pastiglia d'oro dentro una
  // vaschetta incassata (troppo colore sopra un elenco gia' pieno di dischi
  // d'oro); una lastra di pietra incisa. Adesso e' il segmentato di sistema
  // coi colori di casa: fondo di sabbia scurita e un cursore bianco che scorre.
  const leggiInterruttore = ()=> page.evaluate(()=>{
    const leggi = el=>{
      const s = getComputedStyle(el);
      return { fondo:s.backgroundColor, sfumatura:s.backgroundImage,
               tondo:parseFloat(s.borderRadius), colore:s.color, peso:s.fontWeight,
               ombra:s.boxShadow };
    };
    const vascaEl = document.querySelector('.refs-axis-vasca');
    const curEl = document.querySelector('.refs-axis-cursore');
    const v = vascaEl.getBoundingClientRect(), c = curEl.getBoundingClientRect();
    return {
      attiva: leggi(document.getElementById('refs-axis-artists')),
      spenta: leggi(document.getElementById('refs-axis-references')),
      vasca: { ...leggi(vascaEl), largo: v.width },
      cursore: { ...leggi(curEl), largo: c.width, scarto: c.left - v.left },
    };
  });
  const interruttore = await leggiInterruttore();
  ok('nessuna delle due parole ha un fondo suo',
     [interruttore.attiva, interruttore.spenta].every(p =>
       /rgba\(0, 0, 0, 0\)/.test(p.fondo) && p.sfumatura === 'none'), interruttore);
  ok('la scelta e\' un cursore bianco appoggiato sopra, non una meta\' colorata',
     /254, 252, 248/.test(interruttore.cursore.fondo) &&
     !/inset/.test(interruttore.cursore.ombra), interruttore.cursore);
  ok('e copre esattamente meta\' vaschetta',
     Math.abs(interruttore.cursore.largo - (interruttore.vasca.largo/2 - 2)) < 1.5,
     interruttore.cursore);
  ok('la vaschetta non e\' un colore nuovo, e\' la sabbia scurita',
     /rgba\(120, 96, 50/.test(interruttore.vasca.fondo), interruttore.vasca);
  ok('gli angoli sono appena smussati, non tondi',
     interruttore.vasca.tondo >= 7 && interruttore.vasca.tondo <= 12, interruttore.vasca);
  ok('la parola scelta e\' inchiostro e piu\' nera dell\'altra',
     interruttore.attiva.colore !== interruttore.spenta.colore &&
     parseInt(interruttore.attiva.peso) > parseInt(interruttore.spenta.peso), interruttore);
  // Il cursore SCORRE: e' il segno che dice "spostabile" invece che "acceso".
  // 400ms di attesa perche' la transizione dura 220ms.
  await vaiA('references');
  await page.waitForTimeout(400);
  const dopo = await leggiInterruttore();
  ok('e scivola sotto References quando si cambia asse',
     dopo.cursore.scarto > dopo.vasca.largo/2 - 4, dopo.cursore);
  await vaiA('artists');
  await page.waitForTimeout(400);
  const tornato = await leggiInterruttore();
  ok('e torna indietro tornando su Artists',
     tornato.cursore.scarto < 4, tornato.cursore);

  sezione('e il dito cambia scheda da qualunque punto della pagina');
  // Il gesto era appeso all'elenco, che e' alto quanto le righe che contiene:
  // sotto l'ultimo artista c'e' mezzo schermo di sabbia vuota, ed e' proprio
  // li' che il pollice si appoggia. Sembrava che lo swipe funzionasse "a
  // volte" — cioe' solo partendo per caso da sopra una riga.
  const swipeDa = async (sel, dx)=>{
    await page.evaluate(([sel,dx])=>{
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      // Il punto piu' basso dell'elemento: sotto le righe, sulla sabbia.
      const x = r.left + r.width/2, y = r.bottom - 6;
      const t = (cx,cy)=> [new Touch({identifier:1, target:el, clientX:cx, clientY:cy})];
      el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true, touches:t(x,y), changedTouches:t(x,y)}));
      el.dispatchEvent(new TouchEvent('touchend',{bubbles:true, touches:[], changedTouches:t(x+dx,y)}));
    }, [sel,dx]);
    await page.waitForTimeout(300);
  };
  const asse = ()=> page.evaluate(()=> window.refs.asseAttivo());
  await swipeDa('.refs-scroll', -140);
  ok('partendo dalla sabbia sotto l\'ultimo artista si passa a References',
     await asse() === 'references', await asse());
  await swipeDa('.refs-scroll', 140);
  ok('e si torna indietro allo stesso modo', await asse() === 'artists', await asse());
  await swipeDa('#refs-axis', -140);
  ok('vale anche partendo dall\'interruttore stesso', await asse() === 'references', await asse());
  await vaiA('artists');
  await page.waitForTimeout(300);

  sezione('niente piu\' "Senza cartella"');
  // Tolta su richiesta: tutto finisce sempre in una cartella o sotto un tag, e
  // una riga che nella pratica non compare mai e' solo un'altra cosa da
  // leggere. La rete di sicurezza si e' spostata a monte: un'immagine aggiunta
  // dentro un tag nasce con quel tag (vedi currentUploadTags in refs.js).
  const senza = await page.evaluate(()=>{
    const c = document.createElement('canvas'); c.width = 8; c.height = 8;
    window.refs.getRefs().push({ id:'x1', url:c.toDataURL('image/png'), folderId:null, projectIds:[] });
    window.refs.renderRefsScreen();
    return { riga: !!document.querySelector('.refs-mono.mq'),
             testo: document.getElementById('refs-folder-browser').textContent };
  });
  ok('la riga non compare piu\'', !senza.riga, senza.riga);
  ok('e nemmeno la sua sezione', !/senza cartella/i.test(senza.testo), null);
  await apri();

  sezione('aggiungere una cartella e\' una riga, non un "+" da 30 pixel');
  const aggiungi = await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-add-row')).map(b=>{
    const r = b.getBoundingClientRect();
    return { testo: b.textContent.trim(), largo: Math.round(r.width), alto: Math.round(r.height) };
  }));
  ok('nella scheda Artists c\'e\' la sua riga', aggiungi.length === 1, aggiungi);
  // Niente parole: il "+" in coda a un elenco di artisti non puo' voler dire
  // altro, e l'etichetta ripeteva quello che c'e' scritto sulla scheda sopra.
  ok('e non ci sono scritte', aggiungi[0].testo === '', aggiungi);
  // La ragione della modifica: il bersaglio. 30px erano meta' di quello che un
  // dito chiede.
  ok('il bersaglio e\' alto almeno 48px e largo tutto',
     aggiungi.every(a=> a.alto >= 48 && a.largo > 300), aggiungi);
  ok('e il "+" appeso all\'occhiello non c\'e\' piu\'',
     !(await page.evaluate(()=> !!document.querySelector('.refs-cat-add'))), null);

  const rigaStudy = await page.evaluate(async ()=>{
    window.setArchivio('references');
    await new Promise(r=>setTimeout(r,250));
    return Array.from(document.querySelectorAll('.refs-add-row'))
      .map(b=>({ etichetta: b.getAttribute('aria-label'), alto: Math.round(b.getBoundingClientRect().height) }));
  });
  ok('e dentro References ce n\'e\' una per Study', rigaStudy.length === 1, rigaStudy);
  // Muta a schermo, ma non per chi naviga con lo screen reader.
  ok('che a parole dice cosa aggiunge',
     /cartella/i.test(rigaStudy[0].etichetta||''), rigaStudy);
  ok('ed e\' alta come le altre', rigaStudy[0].alto >= 48, rigaStudy);
  await apri();

  const fondo = await page.evaluate(()=>{
    const barra = document.getElementById('refs-folder-toolbar');
    return {
      rigaInFondo: !!document.querySelector('.refs-new-folder-row'),
      nellaBarra: !!barra.querySelector('button[aria-label="Nuova categoria"]'),
      // Al posto suo, nella barra, c'e' la nuvola di Drive: prima galleggiava
      // sopra l'elenco e toccava il bordo della scheda degli artisti.
      nuvola: !!barra.querySelector('#refs-profile-btn'),
      nuvolaFerma: barra.contains(document.querySelector('.refs-profile')),
      conCategorie: !!document.querySelector('.refs-cat-nuova'),
    };
  });
  ok('sotto l\'ultima cartella non c\'e\' piu\' niente', !fondo.rigaInFondo, fondo);
  ok('e "Nuova categoria" non occupa piu\' la barra', !fondo.nellaBarra, fondo);
  ok('al suo posto c\'e\' la nuvola di Drive', fondo.nuvola && fondo.nuvolaFerma, fondo);
  ok('e con delle categorie gia\' fatte non si propone di crearne',
     !fondo.conCategorie, fondo);

  sezione('ma se una scheda e\' vuota, la categoria si crea da li\'');
  // Tolto il pulsante fisso, resta un solo modo di fare una categoria — ed e'
  // l'unico momento in cui serve. Senza questa via, un archivio nuovo non
  // potrebbe avere nemmeno il suo "Artists".
  const vuota = await page.evaluate(async ()=>{
    window.seminaCartelle([]);
    await new Promise(r=>setTimeout(r,250));
    const b = document.querySelector('.refs-cat-nuova');
    return { c1e: !!b, testo: b ? b.textContent.trim() : null,
             alto: b ? Math.round(b.getBoundingClientRect().height) : 0 };
  });
  ok('a scheda vuota compare "Nuova categoria"', vuota.c1e, vuota);
  ok('e dice cosa fa', /nuova categoria/i.test(vuota.testo || ''), vuota);
  ok('con un bersaglio che il dito prende', vuota.alto >= 44, vuota);
  await apri();

  sezione('il modulo di un artista chiede due campi');
  // Niente `await` sulla promessa che torna: il modale resta aperto in attesa
  // di una risposta, e restituirla a page.evaluate bloccherebbe la prova per
  // sempre — la si e' vista girare a vuoto fino al timeout.
  await page.evaluate(()=>{ window.promptNewFolder('Artists'); });
  await page.waitForTimeout(300);
  const modulo = await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    if(!ov) return null;
    const et = Array.from(ov.querySelectorAll('.field-label')).map(e=>e.textContent.trim());
    const inp = Array.from(ov.querySelectorAll('.field-input'));
    return {
      titolo: ov.querySelector('h3').textContent.trim(),
      etichette: et,
      // Il campo del cognome scrive gia' in maiuscolo mentre si digita.
      cognomeMaiuscolo: getComputedStyle(inp[0]).textTransform,
      ok: ov.querySelector('.btn-create').textContent.trim(),
    };
  });
  ok('si intitola "Nuovo artista"', modulo && /artista/i.test(modulo.titolo), modulo);
  ok('e chiede cognome e nome, in quest\'ordine',
     modulo && modulo.etichette.length === 2
     && /cognome/i.test(modulo.etichette[0]) && /nome/i.test(modulo.etichette[1]), modulo);
  ok('il campo del cognome scrive in maiuscolo',
     modulo && modulo.cognomeMaiuscolo === 'uppercase', modulo);

  sezione('e scrivendoli si crea la cartella giusta');
  const creata = await page.evaluate(async ()=>{
    const ov = document.querySelector('.modal-overlay.open');
    const inp = ov.querySelectorAll('.field-input');
    inp[0].value = 'Toriyama'; inp[1].value = 'Akira';
    window.__scritture = [];
    ov.querySelector('.btn-create').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return (window.__scritture||[]).find(s=>s.col === 'refFolders');
  });
  ok('cognome e nome finiscono in due campi separati',
     creata && creata.data.cognome === 'Toriyama' && creata.data.nome === 'Akira', creata);
  ok('e `name` resta la forma piena, per ricerca e provenienza',
     creata && creata.data.name === 'Toriyama Akira', creata);

  sezione('una categoria che non e\' fatta di persone chiede un campo solo');
  await apri();
  await page.evaluate(()=>{ window.promptNewFolder('Study'); });
  await page.waitForTimeout(300);
  const studio = await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    return ov ? { campi: ov.querySelectorAll('.field-input').length,
                  titolo: ov.querySelector('h3').textContent.trim() } : null;
  });
  ok('un campo solo', studio && studio.campi === 1, studio);
  ok('e il titolo dice dove si sta creando', studio && /study/i.test(studio.titolo), studio);

  sezione('chiedere e confermare sono lo stesso foglio');
  // Erano due forme diverse: classi diverse, imbottiture scritte a mano
  // nell'HTML, uno spaziatore da 18px in fondo solo alle conferme e il titolo
  // rosso su alcune. Da qui in avanti il foglio e' uno: testa, corpo, pulsanti.
  const misura = ()=> page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    const foglio = ov.firstElementChild;
    const s = getComputedStyle(foglio), h3 = getComputedStyle(foglio.querySelector('h3'));
    const azione = foglio.querySelector('.btn-create, .btn-danger');
    const a = getComputedStyle(azione), c = getComputedStyle(foglio.querySelector('.btn-cancel'));
    return {
      classe: foglio.className,
      largo: Math.round(foglio.getBoundingClientRect().width),
      tondo: s.borderRadius, sotto: s.paddingBottom,
      titolo: h3.fontSize + '/' + h3.fontWeight, coloreTitolo: h3.color,
      corpo: !!foglio.querySelector('.modal-body'),
      azione: a.padding + '|' + a.borderRadius + '|' + a.fontSize + '|' + a.fontWeight,
      annulla: c.padding + '|' + c.borderRadius,
      pesi: [c.flexGrow, a.flexGrow].join('-'),
    };
  });
  const chiede = await misura();     // "Nuova cartella in Study", aperto qui sopra
  await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    ov.querySelector('.btn-cancel').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(200);
  await page.evaluate(()=>{ window.dialogs.confirmModal('Eliminare la cartella?', {title:'Elimina cartella', confirmLabel:'Elimina'}); });
  await page.waitForTimeout(300);
  const conferma = await misura();
  ok('stessa classe per tutti e due', chiede.classe === conferma.classe, [chiede.classe, conferma.classe]);
  ok('stessa larghezza e stessi angoli',
     chiede.largo === conferma.largo && chiede.tondo === conferma.tondo, [chiede, conferma]);
  ok('stesso spazio in fondo al foglio', chiede.sotto === conferma.sotto, [chiede.sotto, conferma.sotto]);
  ok('stesso titolo, e in inchiostro anche quando si cancella',
     chiede.titolo === conferma.titolo && chiede.coloreTitolo === conferma.coloreTitolo,
     [chiede, conferma]);
  ok('tutti e due hanno un corpo, non solo la testa', chiede.corpo && conferma.corpo, [chiede, conferma]);
  ok('i pulsanti hanno la stessa forma',
     chiede.azione === conferma.azione && chiede.annulla === conferma.annulla, [chiede, conferma]);
  ok('e l\'azione pesa il doppio di Annulla in tutti e due',
     chiede.pesi === conferma.pesi && chiede.pesi === '1-2', [chiede.pesi, conferma.pesi]);
  await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    ov.querySelector('.btn-cancel').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(200);

  sezione('tenendo premuto si comincia a SCEGLIERE');
  // Prima il tocco prolungato apriva un menu con Rinomina/Elimina, una cartella
  // per volta: per cancellarne cinque servivano cinque gesti e cinque conferme.
  // Adesso sceglie la riga, e le azioni sono una barra sola sopra l'elenco. Il
  // gesto si riproduce INTERO — rilascio e click compresi — perche' il click
  // che il browser manda quando il dito si stacca non deve aprire la cartella.
  await apri();
  const senzaPuntini = await page.evaluate(()=> !document.querySelector('.refs-folder-menu'));
  ok('il bottone dei tre puntini non c\'e\' su nessuna riga', senzaPuntini, senzaPuntini);
  const tenuta = await page.evaluate(async ()=>{
    const el = document.querySelector('.refs-folder-row[data-folder-id]');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const t = ()=> [new Touch({identifier:3, target:el, clientX:x, clientY:y})];
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:3,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:t(),targetTouches:t()}));
    await new Promise(r=>setTimeout(r,600));
    const durante = window.refs.scelti().length;
    // changedTouches serve davvero: la pagina cambia asse con lo swipe (vedi
    // wireSwipeAssi) e quel gestore legge da li' dove il dito si e' staccato.
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],targetTouches:[],changedTouches:t()}));
    el.dispatchEvent(new PointerEvent('pointerup',{pointerId:3,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
    await new Promise(r=>setTimeout(r,200));
    const galleria = document.getElementById('refs-gallery-view');
    return { durante, dopo: window.refs.scelti().length,
             menu: !!document.querySelector('.ink-action-menu'),
             entrata: galleria.style.display !== 'none' };
  });
  ok('tenendo premuto la riga viene scelta', tenuta.durante === 1, tenuta);
  ok('e resta scelta quando il dito si stacca', tenuta.dopo === 1, tenuta);
  ok('nessun menu si apre piu\'', !tenuta.menu, tenuta);
  ok('e non si entra nella cartella sotto', !tenuta.entrata, tenuta);

  // Su Android il tocco prolungato fa scattare il nostro timer e, subito dopo,
  // il "contextmenu" del browser: due gesti per uno solo. Se il secondo
  // ripassasse per la stessa strada la riga verrebbe scelta e deselezionata
  // nello stesso momento — l'equivalente del vecchio menu che lampeggiava.
  const dopoContext = await page.evaluate(async ()=>{
    document.querySelector('.refs-folder-row[data-folder-id]')
      .dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true}));
    await new Promise(r=>setTimeout(r,150));
    return window.refs.scelti().length;
  });
  ok('e il contextmenu di Android non la fa saltare via', dopoContext === 1, dopoContext);

  sezione('la barra delle azioni prende il posto dell\'interruttore');
  const inScelta = await page.evaluate(()=>{
    const barra = document.getElementById('refs-scelta');
    const assi = document.getElementById('refs-axis');
    return {
      barraVisibile: getComputedStyle(barra).display !== 'none',
      assiVisibili: getComputedStyle(assi).display !== 'none',
      conto: document.getElementById('refs-scelta-conto').textContent.trim(),
      rinominaSpento: document.getElementById('refs-scelta-rinomina').disabled,
      spunte: document.querySelectorAll('.refs-spunta').length,
      prese: document.querySelectorAll('.refs-spunta.on').length,
    };
  });
  ok('la barra c\'e\' e l\'interruttore no', inScelta.barraVisibile && !inScelta.assiVisibili, inScelta);
  ok('dice quanti ne hai presi', /1 scelto/.test(inScelta.conto), inScelta);
  ok('con uno solo, Rinomina si puo\' premere', !inScelta.rinominaSpento, inScelta);
  ok('e ogni riga si porta la sua spunta',
     inScelta.spunte === 3 && inScelta.prese === 1, inScelta);

  const inDue = await page.evaluate(async ()=>{
    const righe = document.querySelectorAll('.refs-folder-row[data-folder-id]');
    righe[1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return {
      quanti: window.refs.scelti().length,
      conto: document.getElementById('refs-scelta-conto').textContent.trim(),
      rinominaSpento: document.getElementById('refs-scelta-rinomina').disabled,
      galleria: document.getElementById('refs-gallery-view').style.display !== 'none',
    };
  });
  ok('un tocco normale, mentre si sceglie, aggiunge invece di entrare',
     inDue.quanti === 2 && !inDue.galleria, inDue);
  ok('il conto si aggiorna', /2 scelti/.test(inDue.conto), inDue);
  ok('e con due, Rinomina si spegne (due cartelle non hanno un nome solo)',
     inDue.rinominaSpento, inDue);

  const tolta = await page.evaluate(async ()=>{
    const righe = document.querySelectorAll('.refs-folder-row[data-folder-id]');
    righe[1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return window.refs.scelti().length;
  });
  ok('e ritoccandola la si toglie', tolta === 1, tolta);

  sezione('e da li\' si cancella in un colpo solo');
  const cancellate = await page.evaluate(async ()=>{
    const righe = document.querySelectorAll('.refs-folder-row[data-folder-id]');
    righe[1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    window.__cancellati = [];
    document.getElementById('refs-scelta-elimina').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    const ov = document.querySelector('.modal-overlay.open');
    const domanda = ov ? ov.textContent : '';
    if(ov) ov.querySelector('.btn-danger').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    return { domanda, tolte: (window.__cancellati||[]).filter(c=>c.col === 'refFolders').map(c=>c.id),
             barra: getComputedStyle(document.getElementById('refs-scelta')).display !== 'none' };
  });
  ok('la conferma dice quante cartelle sta per prendere',
     /2 cartelle/.test(cancellate.domanda), cancellate.domanda);
  ok('e le cancella tutte e due davvero', cancellate.tolte.length === 2, cancellate);
  ok('finito, la barra se ne va', !cancellate.barra, cancellate);

  sezione('uscire dalla scelta non cancella niente');
  await apri();
  const uscita = await page.evaluate(async ()=>{
    document.querySelector('.refs-folder-row[data-folder-id]')
      .dispatchEvent(new MouseEvent('contextmenu', {bubbles:true, cancelable:true}));
    await new Promise(r=>setTimeout(r,200));
    const dentro = window.refs.scelti().length;
    window.__cancellati = [];
    document.querySelector('#refs-scelta button[aria-label="Esci dalla scelta"]')
      .dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return { dentro, dopo: window.refs.scelti().length,
             cancellate: (window.__cancellati||[]).length,
             assi: getComputedStyle(document.getElementById('refs-axis')).display !== 'none',
             spunte: document.querySelectorAll('.refs-spunta').length };
  });
  ok('la ✕ svuota la scelta', uscita.dentro === 1 && uscita.dopo === 0, uscita);
  ok('senza toccare niente', uscita.cancellate === 0, uscita);
  ok('e l\'interruttore torna al suo posto', uscita.assi, uscita);
  ok('e le spunte spariscono dalle righe', uscita.spunte === 0, uscita);
  await apri();

  sezione('mentre un tocco normale entra e basta');
  const entrato = await page.evaluate(async ()=>{
    document.querySelector('.refs-folder-row[data-folder-id]')
      .dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return { grid: document.getElementById('refs-gallery-view').style.display !== 'none',
             menu: !!document.querySelector('.ink-action-menu') };
  });
  ok('la cartella si apre', entrato.grid, entrato);
  ok('e nessun menu si mette in mezzo', !entrato.menu, entrato);

  sezione('le righe stanno in una scheda sola, come nella scheda progetto');
  // Terza versione dell'elenco. Righe nude su fondo sabbia: l'occhio che
  // scorreva perdeva il rigo. Righe a tinte alterne: si seguiva il rigo, ma il
  // colore diventava la cosa piu' visibile della pagina. Ora un foglio quasi
  // bianco — gli stessi materiali dei blocchi della scheda progetto — e un
  // capello fra una riga e l'altra.
  await apri();
  const foglio = await page.evaluate(()=>{
    const s = document.querySelectorAll('.refs-scheda');
    const righe = Array.from(document.querySelectorAll('.refs-folder-row[data-folder-id]'));
    const st = s[0] ? getComputedStyle(s[0]) : null;
    return {
      schede: s.length,
      tutteDentro: righe.every(r=> !!r.closest('.refs-scheda')),
      fondoScheda: st ? st.backgroundColor : null,
      bordoScheda: st ? st.borderTopWidth : null,
      angoli: st ? parseFloat(st.borderRadius) : null,
      tinteRighe: Array.from(new Set(righe.map(r=> getComputedStyle(r).backgroundColor))),
      capelli: righe.map(r=> parseFloat(getComputedStyle(r).borderBottomWidth)),
      ultimaSenzaCapello: (()=>{
        const dentro = Array.from(document.querySelectorAll('.refs-scheda'))
          .map(x=> x.lastElementChild);
        return dentro.every(x=> parseFloat(getComputedStyle(x).borderBottomWidth) === 0);
      })(),
    };
  });
  ok('una scheda per categoria, non una per cartella', foglio.schede === 1, foglio);
  ok('e tutte le righe stanno dentro', foglio.tutteDentro, foglio);
  ok('il foglio e\' quasi bianco', foglio.fondoScheda === 'rgb(254, 252, 248)', foglio);
  ok('col suo bordo e i suoi angoli tondi',
     parseFloat(foglio.bordoScheda) > 0 && foglio.angoli >= 12, foglio);
  ok('le righe non hanno piu\' un colore loro',
     foglio.tinteRighe.length === 1 && /rgba\(0, 0, 0, 0\)/.test(foglio.tinteRighe[0]),
     foglio.tinteRighe);
  ok('fra una riga e l\'altra c\'e\' un capello',
     foglio.capelli.slice(0, -1).every(v=> v > 0 && v <= 1.5), foglio.capelli);
  ok('e l\'ultima riga della scheda non lo tira nel vuoto',
     foglio.ultimaSenzaCapello, foglio);

  sezione('con il filo d\'oro in cima, e senza frecce sulle righe');
  // La scheda nuda era giusta di struttura e muta di tono. I due dettagli che
  // le danno voce vengono da roba gia' in casa: il filetto dei modali e la
  // freccia che dice "di qui si entra".
  const tono = await page.evaluate(()=>{
    const s = document.querySelector('.refs-scheda');
    const filo = getComputedStyle(s, '::before');
    const riga = document.querySelector('.refs-folder-row[data-folder-id]');
    const frec = getComputedStyle(riga, '::after');
    const piu = document.querySelector('.refs-add-row');
    return {
      filoAlto: parseFloat(filo.height),
      filoOro: /gradient/.test(filo.backgroundImage) && /226, 182, 44|240, 192, 32/.test(filo.backgroundImage),
      angoli: parseFloat(getComputedStyle(s).borderRadius),
      freccia: (frec.content || '').replace(/["']/g, ''),
      // La riga del "+" non porta da nessuna parte: niente freccia.
      frecciaSulPiu: (getComputedStyle(piu, '::after').content || 'none') !== 'none',
      // (la freccia sulle righe e' stata tolta: vedi il controllo qui sotto)
      // Una sola freccia per riga: la porta dei tag ne aveva una tutta sua.
      doppiaSullaPorta: (()=>{
        window.setArchivio('references');
        return null;   // controllato sotto, dopo il render
      })(),
    };
  });
  ok('il filo in cima e\' alto tre pixel', tono.filoAlto === 3, tono);
  ok('ed e\' d\'oro come quello dei modali', tono.filoOro, tono);
  ok('gli angoli sono piu\' tondi di prima', tono.angoli >= 18, tono);
  // La freccia in coda alle righe e' durata un giorno: in un elenco in cui
  // TUTTE le righe portano da qualche parte non distingueva niente, era solo
  // un segno ripetuto sei volte. Resta sulla porta dei tag, dove dice una cosa
  // che le altre righe non dicono (apre un elenco, non delle immagini).
  ok('le righe non hanno nessuna freccia in coda',
     tono.freccia !== '›', tono);
  ok('e nemmeno quella del "+"', !tono.frecciaSulPiu, tono);

  await page.waitForTimeout(250);
  const porta = await page.evaluate(()=>{
    const p = document.querySelector('.refs-tag-porta');
    if(!p) return null;
    const f = getComputedStyle(p, '::after').content || '';
    return { freccia: f.replace(/["']/g, ''), testo: p.textContent.replace(/\s/g,'') };
  });
  ok('la porta dei tag invece la freccia ce l\'ha',
     porta && porta.freccia === '›', porta);
  ok('e una sola', porta && !/››/.test(porta.testo), porta);
  await vaiA('artists');
  await apri();

  sezione('i menu contestuali: parole corte e un\'icona per voce');
  // Sulle CARTELLE il menu non c'e' piu' (si sceglie e si agisce dalla barra):
  // resta sulle immagini, ed e' li' che si controlla che forma abbia.
  await page.evaluate(()=>{ window.semina(2,1); window.refs.openFolder('F1'); });
  await page.waitForTimeout(300);
  const menuImmagine = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.querySelector('.refs-thumb'), 'r0');
    await new Promise(r=>setTimeout(r,200));
    const m = document.querySelector('.ink-action-menu');
    const st = getComputedStyle(m);
    const bt = Array.from(m.querySelectorAll('button'));
    return {
      icone: window.iconeMenu(),
      largo: Math.round(m.getBoundingClientRect().width),
      // Le voci non si toccano piu' i bordi: il foglio ha la sua imbottitura.
      imbottitura: parseFloat(st.padding),
      // Niente filetti fra voci normali; solo sopra quella distruttiva.
      filetti: bt.filter(b=> parseFloat(getComputedStyle(b).borderTopWidth) > 0).length,
      distruttivaStaccata: bt[bt.length-1].classList.contains('stacca'),
    };
  });
  ok('ogni voce ha la sua icona', menuImmagine.icone.every(Boolean), menuImmagine);
  ok('il menu ha un\'imbottitura sua', menuImmagine.imbottitura > 0, menuImmagine);
  ok('un solo filetto, quello sopra "Elimina"',
     menuImmagine.filetti === 1 && menuImmagine.distruttivaStaccata, menuImmagine);
  ok('e non e\' piu\' largo mezzo schermo', menuImmagine.largo <= 240, menuImmagine);
  await page.evaluate(()=> window.chiudiMenu());
  await page.waitForTimeout(150);

  sezione('il menu di un\'immagine dice le stesse cose con meno parole');
  await page.evaluate(()=> window.chiudiMenu());
  await page.evaluate(()=>{ window.semina(2,1); window.refs.openFolder('F1'); });
  await page.waitForTimeout(300);
  const vociImg = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.querySelector('.refs-thumb'), 'r0');
    await new Promise(r=>setTimeout(r,200));
    return { voci: window.vociMenu(), icone: window.iconeMenu(),
             lunga: Math.max(...window.vociMenu().map(v=>v.length)) };
  });
  ok('nessuna voce con i puntini di sospensione',
     vociImg.voci.every(v=> !v.includes('…')), vociImg.voci);
  ok('la piu\' lunga sta sotto i venti caratteri', vociImg.lunga <= 20, vociImg);
  ok('e ognuna ha la sua icona', vociImg.icone.every(Boolean), vociImg);

  sezione('il menu aperto col tocco prolungato non lampeggia');
  // Il difetto: il menu nasceva mentre il dito era ancora giu' (480ms di
  // pressione), e il click che il browser manda al distacco veniva letto come
  // "toccato fuori" — il gesto che apriva il menu era anche quello che lo
  // chiudeva. Qui si riproduce il gesto INTERO, rilascio compreso.
  await page.evaluate(()=>{ window.semina(2,1); window.refs.openFolder('F1'); });
  await page.waitForTimeout(300);
  const sopravvive = await page.evaluate(async ()=>{
    const el = document.querySelector('.refs-thumb');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const t = ()=> [new Touch({identifier:1, target:el, clientX:x, clientY:y})];
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:t(),targetTouches:t()}));
    await new Promise(r=>setTimeout(r,600));            // il tocco prolungato scatta
    const apertoDurante = !!document.querySelector('.ink-action-menu');
    // Il dito si stacca: touchend, pointerup e il click che ne consegue.
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],targetTouches:[]}));
    el.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:x,clientY:y,bubbles:true}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
    await new Promise(r=>setTimeout(r,200));
    return { apertoDurante, apertoDopo: !!document.querySelector('.ink-action-menu'),
             lightbox: document.getElementById('refs-lightbox').classList.contains('open') };
  });
  ok('il menu compare tenendo premuto', sopravvive.apertoDurante, sopravvive);
  ok('e RESTA aperto quando il dito si stacca', sopravvive.apertoDopo, sopravvive);
  ok('senza aprire anche l\'immagine sotto', !sopravvive.lightbox, sopravvive);

  sezione('ma un tocco vero fuori lo chiude');
  const chiuso = await page.evaluate(async ()=>{
    document.body.dispatchEvent(new PointerEvent('pointerdown',{pointerId:2,clientX:5,clientY:5,bubbles:true}));
    await new Promise(r=>setTimeout(r,150));
    return !document.querySelector('.ink-action-menu');
  });
  ok('toccando altrove il menu se ne va', chiuso, chiuso);

  sezione('e scorrendo il menu si toglie di mezzo');
  // Il menu e' ancorato a un punto fisso dello schermo e non insegue la
  // miniatura da cui e' uscito: restando aperto durante uno scorrimento
  // finirebbe per puntare a un'immagine diversa da quella scelta.
  await page.evaluate(()=>{ window.semina(2,1); window.refs.openFolder('F1'); });
  await page.waitForTimeout(300);
  const dopoScroll = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.querySelector('.refs-thumb'), 'r0');
    await new Promise(r=>setTimeout(r,200));
    const prima = !!document.querySelector('.ink-action-menu');
    document.querySelector('.refs-scroll').dispatchEvent(new Event('scroll', {bubbles:true}));
    await new Promise(r=>setTimeout(r,150));
    return { prima, dopo: !!document.querySelector('.ink-action-menu') };
  });
  ok('aperto prima dello scorrimento', dopoScroll.prima, dopoScroll);
  ok('e chiuso dopo', !dopoScroll.dopo, dopoScroll);

  sezione('e scegliere una voce funziona ancora');
  const scelto = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.querySelector('.refs-thumb'), 'r0');
    await new Promise(r=>setTimeout(r,200));
    const b = Array.from(document.querySelectorAll('.ink-action-menu button'))
      .find(x=>/come tavola/i.test(x.textContent));
    window.__scritture = [];
    // Il dito preme SULLA voce: il pointerdown dentro il menu non deve
    // smontarlo prima che il click arrivi.
    b.dispatchEvent(new PointerEvent('pointerdown',{pointerId:3,bubbles:true}));
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return { chiuso: !document.querySelector('.ink-action-menu'),
             scritto: (window.__scritture||[]).some(s=>s.id === 'r0') };
  });
  ok('la voce si preme e il menu si chiude', scelto.chiuso, scelto);
  ok('e l\'azione parte davvero', scelto.scritto, scelto);

});
