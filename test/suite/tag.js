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

  const stato = ()=> page.evaluate(()=>({
    scheda: (document.querySelector('.refs-axis-tab.active')||{}).textContent,
    sezioni: Array.from(document.querySelectorAll('.refs-sec-nome')).map(e=>e.textContent.trim()),
    tag: Array.from(document.querySelectorAll('.refs-tag-row')).map(r=>({
      nome: r.querySelector('.refs-folder-name').textContent.trim(),
      n: r.querySelector('.refs-folder-count').textContent.trim(),
    })),
    cartelle: Array.from(document.querySelectorAll('.refs-folder-row:not(.refs-tag-row) .refs-folder-name'))
      .map(e=>e.textContent.trim()),
  }));

  sezione('due schede: Artists e References');
  await semina();
  let s = await stato();
  ok('si apre su Artists', /artists/i.test(s.scheda||''), s);
  ok('e li\' ci sono solo gli artisti',
     s.cartelle.length === 2 && !s.tag.length, s);
  ok('Study non e\' una scheda a se\'',
     !s.sezioni.some(x=>/study/i.test(x)), s);

  sezione('dentro References ci sono i tag, e Study e\' una sua sottosezione');
  await page.evaluate(()=>{ window.setArchivio('references'); });
  await page.waitForTimeout(300);
  s = await stato();
  ok('la scheda attiva e\' References', /references/i.test(s.scheda||''), s);
  ok('la prima sezione e\' Study', /study/i.test(s.sezioni[0]||''), s);
  ok('e i Tag vengono dopo', s.sezioni.findIndex(x=>/^tag$/i.test(x)) > 0, s);
  ok('la cartella di Study e\' qui, non fra gli artisti',
     s.cartelle.some(c=>/hands/i.test(c)) && !s.cartelle.some(c=>/otomo/i.test(c)), s);
  // I tag non si elencano qui: c'e' una porta sola, e l'elenco sta dentro.
  ok('dei tag c\'e\' una riga sola, la porta',
     s.tag.length === 1 && /tutti i tag/i.test(s.tag[0].nome), s.tag);
  ok('con quanti ne trovera\' dentro', s.tag[0].n === '3', s.tag);

  sezione('entrando nella porta c\'e\' l\'elenco vero');
  await page.evaluate(()=>{ window.openTagList(); });
  await page.waitForTimeout(300);
  const dentroTag = await page.evaluate(()=>({
    righe: Array.from(document.querySelectorAll('.refs-tag-row')).map(r=>({
      nome: r.querySelector('.refs-folder-name').textContent.trim(),
      n: r.querySelector('.refs-folder-count').textContent.trim(),
    })),
    briciola: (document.getElementById('refs-breadcrumb-name')||{}).textContent,
    schede: document.getElementById('refs-axis').classList.contains('show'),
  }));
  ok('ci sono tre tag', dentroTag.righe.length === 3, dentroTag.righe);
  ok('col numero di immagini che li portano',
     dentroTag.righe.find(t=>/folla/.test(t.nome)).n === '3', dentroTag.righe);
  ok('e il piu\' usato sta in cima', /folla/.test(dentroTag.righe[0].nome), dentroTag.righe);
  ok('la briciola dice dove sei', /tag/i.test(dentroTag.briciola||''), dentroTag);
  ok('e le schede spariscono: qui sotto non c\'e\' nessun Artists',
     !dentroTag.schede, dentroTag);
  await page.evaluate(()=>{ window.refs.openFolderBrowser(); window.setArchivio('references'); });
  await page.waitForTimeout(250);

  sezione('le sezioni sono barre intere, non pastiglie');
  const barra = await page.evaluate(()=>{
    const b = document.querySelector('.refs-sec');
    const r = b.getBoundingClientRect();
    const c = b.parentElement.getBoundingClientRect();
    return { larga: Math.round(r.width), contenitore: Math.round(c.width),
             scura: getComputedStyle(b).backgroundImage.includes('gradient') };
  });
  ok('la barra occupa tutta la larghezza',
     Math.abs(barra.larga - barra.contenitore) < 2, barra);
  ok('ed e\' nera', barra.scura, barra);

  sezione('lo swipe cambia scheda');
  const swipe = await page.evaluate(async ()=>{
    const el = document.getElementById('refs-folder-browser');
    const t = (x,y)=> [new Touch({identifier:1, target:el, clientX:x, clientY:y})];
    // Da destra verso sinistra: si va avanti, cioe' verso References.
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:t(300,400),targetTouches:t(300,400)}));
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],targetTouches:[],changedTouches:t(300,400)}));
    await new Promise(r=>setTimeout(r,60));
    // Indietro: verso Artists.
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:t(80,400),targetTouches:t(80,400)}));
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],targetTouches:[],changedTouches:t(300,410)}));
    await new Promise(r=>setTimeout(r,250));
    const dopoDestra = (document.querySelector('.refs-axis-tab.active')||{}).textContent;
    // Uno scorrimento in diagonale NON deve cambiare scheda.
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:t(200,300),targetTouches:t(200,300)}));
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],targetTouches:[],changedTouches:t(260,500)}));
    await new Promise(r=>setTimeout(r,250));
    return { dopoDestra, dopoDiagonale: (document.querySelector('.refs-axis-tab.active')||{}).textContent };
  });
  ok('scorrendo verso destra si torna su Artists', /artists/i.test(swipe.dopoDestra||''), swipe);
  ok('ma uno scroll storto non cambia niente', /artists/i.test(swipe.dopoDiagonale||''), swipe);
  await page.evaluate(()=>{ window.setArchivio('references'); });
  await page.waitForTimeout(250);

  sezione('aprendo un tag si pesca da TUTTE le cartelle');
  await page.evaluate(()=>{ window.openTagList(); });
  await page.waitForTimeout(250);
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

  sezione('senza tag la sezione lo dice, invece di sparire');
  await page.evaluate(()=>{
    window.refs.getRefs().forEach(r=> r.tags = []);
    window.refs.openTagList();
  });
  await page.waitForTimeout(300);
  const vuota = await page.evaluate(()=>({
    righe: document.querySelectorAll('.refs-tag-row').length,
    testo: (document.querySelector('.refs-folders-empty')||{}).textContent || '',
  }));
  ok('nessun tag in elenco', vuota.righe === 0, vuota);
  // Sparire lascerebbe la scheda muta: e' l'unico punto in cui si spiega da
  // dove arrivano i tag, ed e' quando non ce n'e' ancora nessuno.
  ok('ma la scheda spiega come se ne fa uno', /ritagliando/i.test(vuota.testo), vuota);

  sezione('un\'immagine taggata lo dice anche in griglia');
  await page.evaluate(()=>{
    window.refs.getRefs().find(r=>r.id==='i1').tags = ['folla che cammina'];
    window.refs.openFolder('a1');
  });
  await page.waitForTimeout(300);
  const badge = await page.evaluate(()=>{
    const t = document.querySelector('.refs-thumb[data-id="i1"] .refs-thumb-tag');
    const senza = document.querySelector('.refs-thumb[data-id="i2"] .refs-thumb-tag');
    if(!t) return { c: null };
    const r = t.getBoundingClientRect(), th = t.parentElement.getBoundingClientRect();
    return {
      c: t.textContent.trim(),
      // Piccolo e in un angolo: non deve disturbare l'immagine.
      quota: +(r.width * r.height / (th.width * th.height)).toFixed(3),
      inAlto: r.top - th.top < 10,
      altre: !!senza,
    };
  });
  ok('c\'e\' un cancelletto sulla miniatura taggata', badge.c === '#', badge);
  ok('e non su quella senza tag', badge.altre === false, badge);
  ok('e\' piccolo — meno del 5% della miniatura', badge.quota < 0.05, badge);
  ok('e sta in un angolo', badge.inAlto, badge);

});
