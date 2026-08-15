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
    await page.evaluate(c=> window.seminaCartelle(c), CARTELLE);
    await page.waitForTimeout(300);
  };

  sezione('un artista si scrive COGNOME + nome');
  await apri();
  const righe = await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-folder-row')).map(r=>{
    const cg = r.querySelector('.rf-cognome'), nm = r.querySelector('.rf-nome');
    const st = cg ? getComputedStyle(cg) : null;
    const stn = nm ? getComputedStyle(nm) : null;
    return {
      testo: r.querySelector('.refs-folder-name').textContent.trim(),
      cognome: cg ? cg.textContent : null,
      nome: nm ? nm.textContent : null,
      maiuscolo: st ? st.textTransform : null,
      pesoCognome: st ? +st.fontWeight : null,
      minuscolo: stn ? stn.textTransform : null,
      corsivo: stn ? stn.fontStyle : null,
      semplice: !!r.querySelector('.rf-semplice'),
    };
  }));
  // Si cerca per contenuto e non per posizione: l'elenco e' ordinato
  // alfabeticamente, quindi l'ordine in cui si seminano non e' quello in cui
  // escono.
  const otomo   = righe.find(r=> r.cognome === 'Otomo');
  const vecchia = righe.find(r=> r.testo === 'MOEBIUS');
  const soggetto = righe.find(r=> r.testo === 'Hands');
  ok('il cognome e il nome sono due pezzi distinti',
     otomo && otomo.nome === 'Katsuhiro', otomo);
  ok('il cognome si vede tutto maiuscolo e in grassetto',
     otomo && otomo.maiuscolo === 'uppercase' && otomo.pesoCognome >= 700, otomo);
  ok('il nome in minuscolo e in corsivo, non un secondo titolo',
     otomo && otomo.minuscolo === 'lowercase' && otomo.corsivo === 'italic', otomo);
  ok('una cartella vecchia resta una riga sola',
     vecchia && vecchia.semplice && vecchia.cognome === null, vecchia);
  ok('e cosi\' anche quelle che non sono persone',
     soggetto && soggetto.semplice, soggetto);

  sezione('ogni categoria ha il suo "+"');
  const piu = await page.evaluate(()=> Array.from(document.querySelectorAll('.refs-cat-row')).map(r=>({
    categoria: r.querySelector('.refs-cat-name').textContent.trim(),
    haPiu: !!r.querySelector('.refs-cat-add'),
    etichetta: (r.querySelector('.refs-cat-add')||{}).ariaLabel,
  })));
  ok('c\'e\' un "+" su ogni categoria', piu.length === 2 && piu.every(p=>p.haPiu), piu);
  ok('sotto Artists dice "artista", non "cartella"',
     /artista/i.test(piu.find(p=>p.categoria==='ARTISTS'||p.categoria==='Artists').etichetta||''), piu);
  const fondo = await page.evaluate(()=> document.querySelector('.refs-new-folder-row').textContent.trim());
  ok('in fondo resta solo "Nuova categoria"', /categoria/i.test(fondo), fondo);

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

});
