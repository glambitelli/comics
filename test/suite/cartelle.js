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
      stessoCorpo:    stn ? stn.fontSize === base.fontSize : null,
      stessoPeso:     stn ? stn.fontWeight === base.fontWeight : null,
      stessoColore:   stn ? stn.color === base.color : null,
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
  ok('e con lo stesso carattere di tutte le altre righe',
     otomo && otomo.stessaFamiglia && otomo.stessoCorpo
     && otomo.stessoPeso && otomo.stessoColore, otomo);
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
  // Il colore deve CAMBIARE: e' l'appiglio per riconoscere la riga senza
  // leggerla. Tutti uguali sarebbe decorazione.
  ok('i dischi non sono tutti dello stesso colore',
     new Set(dischi.map(d=>d.sfondo)).size > 1, dischi.map(d=>d.sfondo));
  ok('le righe non sono piu\' schede col bordo',
     dischi.every(d=> d.bordi.startsWith('0px')), dischi.map(d=>d.bordi));

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
  ok('e dice "artista", non "cartella"',
     /aggiungi artista/i.test(aggiungi[0].testo), aggiungi);
  // La ragione della modifica: il bersaglio. 30px erano meta' di quello che un
  // dito chiede.
  ok('il bersaglio e\' alto almeno 48px e largo tutto',
     aggiungi.every(a=> a.alto >= 48 && a.largo > 300), aggiungi);
  ok('e il "+" appeso all\'occhiello non c\'e\' piu\'',
     !(await page.evaluate(()=> !!document.querySelector('.refs-cat-add'))), null);

  const rigaStudy = await page.evaluate(async ()=>{
    window.setArchivio('references');
    await new Promise(r=>setTimeout(r,250));
    return Array.from(document.querySelectorAll('.refs-add-row')).map(b=>b.textContent.trim());
  });
  ok('e dentro References quella di Study dice "cartella"',
     rigaStudy.some(t=>/aggiungi cartella/i.test(t)), rigaStudy);
  await apri();

  const fondo = await page.evaluate(()=>{
    const barra = document.getElementById('refs-folder-toolbar');
    const nuova = barra ? barra.querySelector('button[aria-label="Nuova categoria"]') : null;
    return {
      rigaInFondo: !!document.querySelector('.refs-new-folder-row'),
      nellaBarra: !!nuova,
    };
  });
  ok('sotto l\'ultima cartella non c\'e\' piu\' niente', !fondo.rigaInFondo, fondo);
  ok('"Nuova categoria" e\' salita nella barra della ricerca', fondo.nellaBarra, fondo);

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
  await page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    ov.querySelector('.btn-cancel').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(200);

  sezione('i menu contestuali: parole corte e un\'icona per voce');
  await apri();
  const menuCartella = await page.evaluate(async ()=>{
    document.querySelector('.refs-folder-row .refs-folder-menu')
      .dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const m = document.querySelector('.ink-action-menu');
    const st = getComputedStyle(m);
    const bt = Array.from(m.querySelectorAll('button'));
    return {
      voci: window.vociMenu(),
      icone: window.iconeMenu(),
      largo: Math.round(m.getBoundingClientRect().width),
      // Le voci non si toccano piu' i bordi: il foglio ha la sua imbottitura.
      imbottitura: parseFloat(st.padding),
      // Niente filetti fra voci normali; solo sopra quella distruttiva.
      filetti: bt.filter(b=> parseFloat(getComputedStyle(b).borderTopWidth) > 0).length,
      distruttivaStaccata: bt[bt.length-1].classList.contains('stacca'),
    };
  });
  ok('due voci, entrambe con icona',
     menuCartella.voci.length === 2 && menuCartella.icone.every(Boolean), menuCartella);
  ok('il menu ha un\'imbottitura sua', menuCartella.imbottitura > 0, menuCartella);
  ok('un solo filetto, quello sopra "Elimina"',
     menuCartella.filetti === 1 && menuCartella.distruttivaStaccata, menuCartella);
  ok('e non e\' piu\' largo mezzo schermo', menuCartella.largo <= 240, menuCartella);

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
  // Il menu e' ancorato a un punto fisso dello schermo e non insegue la riga
  // da cui e' uscito: restando aperto durante uno scorrimento finirebbe per
  // puntare a una cartella diversa da quella scelta.
  await apri();
  const dopoScroll = await page.evaluate(async ()=>{
    await window.refsFolderMenu('a1', document.querySelector('.refs-folder-menu'));
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
