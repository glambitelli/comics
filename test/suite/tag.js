// References — i tag: il secondo asse dell'archivio
//
// Un tag risponde a "cosa c'e' dentro", una cartella a "chi l'ha disegnato".
// Quello che si prova qui e' che i due assi NON si intralciano: un'immagine
// taggata resta dov'e', e si trova da tutte e due le parti.
const { suite } = require('../motore.js');

module.exports = () => suite("References — i tag", {"banco": "/test/banco/tavole.html"}, async ({ page, ok, sezione }) => {

  // Cinque immagini in due cartelle, con qualche tag addosso.
  const semina = async ()=>{
    await page.evaluate(()=>{
      const c = document.createElement('canvas'); c.width = 8; c.height = 8;
      const u = c.toDataURL('image/png');
      const r = window.refs.getRefs(); r.length = 0;
      r.push(
        { id:'i1', url:u, folderId:'a1', projectIds:[], tags:['folla che cammina'] },
        { id:'i2', url:u, folderId:'a1', projectIds:[], tags:['folla che cammina','persone sedute'] },
        { id:'i3', url:u, folderId:'a2', projectIds:[], tags:['folla che cammina'] },
        { id:'i4', url:u, folderId:'a2', projectIds:[], tags:[] },
        { id:'i5', url:u, folderId:null, projectIds:[], tags:['macchina parcheggiata'] },
      );
      const f = window.refs.getFolders(); f.length = 0;
      f.push({ id:'a1', category:'Artists', cognome:'Otomo', nome:'Katsuhiro', name:'Otomo Katsuhiro' },
             { id:'a2', category:'Artists', cognome:'Kon', nome:'Satoshi', name:'Kon Satoshi' },
             { id:'s1', category:'Study', name:'Hands' });
      window.refs.openFolderBrowser();
    });
    await page.waitForTimeout(300);
  };

  sezione('la sezione References elenca i tag, non le cartelle');
  await semina();
  const elenco = await page.evaluate(()=>{
    const righe = Array.from(document.querySelectorAll('.refs-tag-row')).map(r=>({
      nome: r.querySelector('.refs-folder-name').textContent.trim(),
      n: r.querySelector('.refs-folder-count').textContent.trim(),
    }));
    const occhielli = Array.from(document.querySelectorAll('.refs-cat-name')).map(e=>e.textContent.trim());
    return { righe, occhielli };
  });
  ok('c\'e\' un occhiello "References"',
     elenco.occhielli.some(o=>/^references$/i.test(o)), elenco.occhielli);
  ok('sta dopo gli artisti e prima di Study',
     elenco.occhielli.indexOf('References') > elenco.occhielli.indexOf('Artists')
     && elenco.occhielli.indexOf('References') < elenco.occhielli.indexOf('Study'), elenco.occhielli);
  ok('ci sono tre tag', elenco.righe.length === 3, elenco.righe);
  ok('col numero di immagini che li portano',
     elenco.righe.find(r=>/folla/.test(r.nome)).n === '3', elenco.righe);
  ok('e il piu\' usato sta in cima', /folla/.test(elenco.righe[0].nome), elenco.righe);

  sezione('aprendo un tag si pesca da TUTTE le cartelle');
  await page.evaluate(()=>{ window.openTag('folla che cammina'); });
  await page.waitForTimeout(300);
  const dentro = await page.evaluate(()=>({
    ids: Array.from(document.querySelectorAll('.refs-thumb')).map(e=>e.dataset.id),
    briciola: (document.getElementById('refs-breadcrumb-name')||{}).textContent,
    // Un tag non e' una cartella: i tab Albi/Ritagli/Tavole non c'entrano.
    tab: document.getElementById('refs-tabs').classList.contains('show'),
  }));
  ok('ci sono le immagini di entrambi gli artisti',
     dentro.ids.length === 3 && dentro.ids.includes('i1') && dentro.ids.includes('i3'), dentro);
  ok('e non quelle senza quel tag', !dentro.ids.includes('i4'), dentro);
  ok('la briciola dice quale tag stai guardando', /folla/.test(dentro.briciola||''), dentro);
  ok('e i tab della cartella non compaiono', !dentro.tab, dentro);

  sezione('il tag NON toglie l\'immagine dalla sua cartella');
  // È il punto della struttura: due assi, non due contenitori. Un ritaglio
  // preso da Otomo resta fra i suoi anche dopo essere stato taggato.
  await page.evaluate(()=>{ window.openFolder('a1'); });
  await page.waitForTimeout(300);
  const inCartella = await page.evaluate(()=>
    Array.from(document.querySelectorAll('.refs-thumb')).map(e=>e.dataset.id));
  ok('i1 e i2 sono ancora in OTOMO',
     inCartella.includes('i1') && inCartella.includes('i2'), inCartella);

  sezione('un tag si mette e si toglie dal menu dell\'immagine');
  const voci = await page.evaluate(async ()=>{
    await window.refsImageMenu(document.querySelector('.refs-thumb'), 'i1');
    await new Promise(r=>setTimeout(r,200));
    return window.vociMenu();
  });
  ok('nel menu c\'e\' "Tag"', voci.some(v=>/^tag$/i.test(v)), voci);
  await page.evaluate(()=> window.chiudiMenu());

  const menuTag = await page.evaluate(async ()=>{
    await window.promptTagImage('i4', document.body);
    await new Promise(r=>setTimeout(r,200));
    return window.vociMenu();
  });
  ok('propone i tag gia\' in uso', menuTag.some(v=>/folla che cammina/.test(v)), menuTag);
  ok('e la possibilita\' di inventarne uno', menuTag.some(v=>/nuovo tag/i.test(v)), menuTag);

  const scritto = await page.evaluate(async ()=>{
    window.__scritture = [];
    Array.from(document.querySelectorAll('.ink-action-menu button'))
      .find(b=>/folla che cammina/.test(b.textContent))
      .dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return (window.__scritture||[]).find(s=>s.id === 'i4');
  });
  ok('scegliendone uno lo si scrive sull\'immagine',
     scritto && (scritto.data.tags||[]).includes('folla che cammina'), scritto);

  sezione('e toccandolo di nuovo si toglie');
  const tolto = await page.evaluate(async ()=>{
    window.refs.getRefs().find(r=>r.id==='i4').tags = ['folla che cammina'];
    window.__scritture = [];
    await window.promptTagImage('i4', document.body);
    await new Promise(r=>setTimeout(r,200));
    const voce = Array.from(document.querySelectorAll('.ink-action-menu button'))
      .find(b=>/folla che cammina/.test(b.textContent));
    const spuntato = /✓/.test(voce.textContent);
    voce.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    return { spuntato, dati: (window.__scritture||[]).find(s=>s.id === 'i4') };
  });
  ok('quello gia\' messo ha la spunta', tolto.spuntato, tolto);
  ok('e ritoccandolo sparisce',
     tolto.dati && !(tolto.dati.data.tags||[]).includes('folla che cammina'), tolto);

  sezione('nomi scritti in modo diverso restano lo stesso tag');
  // "Folla" e "folla " sono la stessa cosa per chiunque tranne che per un
  // confronto fra stringhe: senza normalizzazione l'elenco si riempirebbe di
  // doppioni che a schermo sembrano identici.
  const doppioni = await page.evaluate(()=>{
    const r = window.refs.getRefs();
    r.find(x=>x.id==='i4').tags = ['  Folla   che cammina '];
    return window.refs.tuttiITag().filter(t=>/folla/i.test(t.nome));
  });
  ok('un tag solo, non due', doppioni.length === 1, doppioni);
  ok('e conta anche quello scritto storto', doppioni[0].n === 4, doppioni);

  sezione('senza tag la sezione non esiste');
  await page.evaluate(()=>{
    window.refs.getRefs().forEach(r=> r.tags = []);
    window.refs.openFolderBrowser();
  });
  await page.waitForTimeout(250);
  const vuota = await page.evaluate(()=>({
    occhielli: Array.from(document.querySelectorAll('.refs-cat-name')).map(e=>e.textContent.trim()),
    righe: document.querySelectorAll('.refs-tag-row').length,
  }));
  ok('niente occhiello References se non c\'e\' nessun tag',
     !vuota.occhielli.some(o=>/references/i.test(o)) && vuota.righe === 0, vuota);

});
