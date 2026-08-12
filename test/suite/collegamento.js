// Galleria References — collegare un ritaglio ai progetti
const { suite } = require('../motore.js');

module.exports = () => suite("Galleria References — collegare un ritaglio ai progetti", {"banco": "/test/banco/galleria.html"}, async ({ page, base, ok }) => {

  await page.evaluate(()=>{
    const foto = n => Array.from({length:n},(_,i)=>{
      const c=document.createElement('canvas'); c.width=i+1; c.height=8;
      const x=c.getContext('2d'); x.fillStyle='rgb(20,90,150)'; x.fillRect(0,0,c.width,c.height);
      return { id:'r'+i, url:c.toDataURL('image/png'), projectIds:['p0'], projectId:'p0', folderId:null };
    });
    const arr = window.refs.getRefs(); arr.length=0; arr.push(...foto(4));
    window.__projects.push(
      { id:'p1', title:'Il Sentiero', color:'#4ab8d8' },
      { id:'p2', title:'Ossidiana',  color:'#e0605a' },
      { id:'p3', title:'Nebbia',     color:'#7ac07a' },
    );
    // openProjectRefGallery popola direttamente l'elenco della galleria,
    // senza dipendere dallo stato della griglia sotto.
    window.apri = i => window.refs.openProjectRefGallery('p0', i);
    window.menu = ()=> Array.from(document.querySelectorAll('.ink-action-menu button')).map(b=>b.textContent);
    window.menuVisibile = ()=>{
      const m = document.querySelector('.ink-action-menu');
      if(!m) return null;
      const r = m.getBoundingClientRect();
      const st = getComputedStyle(m);
      return { top:Math.round(r.top), bottom:Math.round(r.bottom), left:Math.round(r.left),
               dentroSchermo: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0,
               z: st.zIndex, visibile: st.display!=='none' && st.visibility!=='hidden' && +st.opacity>0 };
    };
    window.legami = ()=> window.refs.getRefs().map(r=>({id:r.id, p:window.refs.projectIdsOf(r)}));
  });

  console.log('\n── si apre un ritaglio e si tocca il pulsante di collegamento ──');
  await page.evaluate(()=> window.apri(1));
  await page.waitForTimeout(400);
  await page.evaluate(()=>{
    const b = document.getElementById('refs-lightbox-link');
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(300);
  let voci = await page.evaluate(()=>window.menu());
  let pos = await page.evaluate(()=>window.menuVisibile());
  const diag = await page.evaluate(()=>({
    idNelLightbox: document.getElementById('refs-lightbox').dataset.id,
    lightboxAperto: document.getElementById('refs-lightbox').classList.contains('open'),
    bottoneEsiste: !!document.getElementById('refs-lightbox-link'),
  }));
  console.log('   diagnostica:', JSON.stringify(diag));
  ok('il menu si apre', !!voci && voci.length > 0, voci);
  ok('elenca i progetti + "Nessun progetto"', voci && voci.length === 4, voci);
  ok('ed è davvero visibile sullo schermo', pos && pos.visibile && pos.dentroSchermo, pos);

  console.log('\n── si sceglie un progetto ──');
  await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.ink-action-menu button')).find(x=>/Sentiero/.test(x.textContent));
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(300);
  let l = await page.evaluate(()=>window.legami());
  // Nel banco i ritagli partono gia' legati a p0 (serve ad aprire la galleria):
  // qui interessa che p1 si SIA AGGIUNTO, non che abbia preso il posto.
  ok('il ritaglio risulta collegato', l.find(x=>x.id==='r1').p.includes('p1'), l.find(x=>x.id==='r1'));

  console.log('\n── e ora a un SECONDO progetto ──');
  await page.evaluate(()=>{
    document.getElementById('refs-lightbox-link').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(300);
  voci = await page.evaluate(()=>window.menu());
  ok('il menu si riapre', !!voci && voci.length>0, voci);
  ok('e segna con la spunta quello già collegato', voci && voci.some(v=>/^✓/.test(v)), voci);
  await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.ink-action-menu button')).find(x=>/Ossidiana/.test(x.textContent));
    if(b) b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(300);
  l = await page.evaluate(()=>window.legami());
  const suoi = l.find(x=>x.id==='r1').p;
  ok('IL RITAGLIO STA IN ENTRAMBI I PROGETTI', suoi.includes('p1') && suoi.includes('p2'), suoi);

  console.log('\n── il pulsante dice a colpo d\'occhio se e\' collegato ──');
  const seg = await page.evaluate(()=>{
    const b = document.getElementById('refs-lightbox-link');
    return { collegato: b.classList.contains('linked'),
             colore: b.style.getPropertyValue('--proj'),
             catena: b.querySelectorAll('svg path').length,
             segnalibro: b.innerHTML.includes('v14l-6-4-6 4') };
  });
  ok('si accende quando il ritaglio e\' agganciato', seg.collegato, seg);
  ok('e prende il colore del progetto', seg.colore === '#4ab8d8', seg);
  ok('l\'icona e\' una catena, non piu\' un segnalibro', seg.catena === 2 && !seg.segnalibro, seg);

  console.log('\n── il ritaglio compare in tutte e due le gallerie di progetto ──');
  const dentro = await page.evaluate(()=>({
    p1: window.refs.getRefs().filter(r=> (r.projectIds||[]).includes('p1')).map(r=>r.id),
    p2: window.refs.getRefs().filter(r=> (r.projectIds||[]).includes('p2')).map(r=>r.id),
  }));
  ok('lo si trova sia sotto p1 sia sotto p2', dentro.p1.includes('r1') && dentro.p2.includes('r1'), dentro);

  console.log('\n── togliere un collegamento lascia stare l\'altro ──');
  await page.evaluate(()=>{ document.getElementById('refs-lightbox-link').dispatchEvent(new MouseEvent('click',{bubbles:true})); });
  await page.waitForTimeout(300);
  voci = await page.evaluate(()=>window.menu());
  ok('entrambi i collegati hanno la spunta', voci.filter(v=>/^✓/.test(v)).length === 2, voci);
  ok('e compare "Scollega da tutti"', voci.some(v=>/Scollega/.test(v)), voci);
  await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.ink-action-menu button')).find(x=>/Sentiero/.test(x.textContent));
    b.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });
  await page.waitForTimeout(300);
  l = await page.evaluate(()=>window.legami());
  const dopoTolto = l.find(x=>x.id==='r1').p;
  ok('quello tolto sparisce e l\'altro resta',
     !dopoTolto.includes('p1') && dopoTolto.includes('p2'), dopoTolto);

  console.log('\n── un ritaglio vecchio, scritto quando il campo era uno solo ──');
  await page.evaluate(()=>{
    const arr = window.refs.getRefs();
    const vecchio = arr.find(r=>r.id==='r2');
    delete vecchio.projectIds;          // com'era prima: solo projectId
    vecchio.projectId = 'p3';
  });
  const vecchio = await page.evaluate(()=>({
    letto: window.refs.projectIdsOf(window.refs.getRefs().find(r=>r.id==='r2')),
  }));
  ok('viene letto lo stesso, senza migrazioni', JSON.stringify(vecchio.letto) === JSON.stringify(['p3']), vecchio);

  console.log('\n── la striscia morta con l\'interfaccia nascosta ──');
  await page.evaluate(()=>{
    document.querySelector('.ink-action-menu')?.remove();
    document.getElementById('refs-lightbox').classList.add('chrome-hidden');
  });
  await page.waitForTimeout(150);
  let nascosta = await page.evaluate(()=> document.getElementById('refs-lightbox').classList.contains('chrome-hidden'));
  ok('l\'interfaccia è nascosta', nascosta);
  await page.evaluate(()=>{
    const b = document.getElementById('refs-lightbox-link').getBoundingClientRect();
    document.getElementById('refs-lightbox').dispatchEvent(new PointerEvent('pointerdown',
      { pointerId:1, clientX:b.left+b.width/2, clientY:b.top+b.height/2, bubbles:true }));
  });
  await page.waitForTimeout(150);
  nascosta = await page.evaluate(()=> document.getElementById('refs-lightbox').classList.contains('chrome-hidden'));
  ok('un tocco sulla fascia in basso la richiama, invece di non fare niente', !nascosta);
});
