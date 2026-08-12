// Ritaglio — maniglie del riquadro e peso del file
const { suite } = require('../motore.js');

module.exports = () => suite("Ritaglio — maniglie del riquadro e peso del file", {"banco": "/test/banco/lettore.html"}, async ({ page, base, ok }) => {
  await page.evaluate(()=>{ localStorage.clear(); window.__folderId='F';
    window.__dests=[{id:'f1',name:'OTOMO',isCurrent:true,category:'Artists'}]; window.__cats=[]; });
  await page.evaluate(async u=>{ const b=await (await fetch(u)).arrayBuffer();
    await window.albums.openAlbumFromFile(new File([b],'Naruto 1.cbz',{type:'application/zip'})); }, base+'/test/fixtures/tavole.cbz');
  await page.waitForTimeout(1000);

  const box = ()=> page.evaluate(()=>{
    const b = document.querySelector('.ar-clipbox');
    return { left:parseFloat(b.style.left), top:parseFloat(b.style.top),
             w:parseFloat(b.style.width), h:parseFloat(b.style.height) };
  });
  const disegna = async (x1,y1,x2,y2)=>{
    const l = await page.evaluate(()=>{ const r=document.querySelector('.ar-cliplayer').getBoundingClientRect(); return {x:r.x,y:r.y}; });
    await page.mouse.move(l.x+x1, l.y+y1); await page.mouse.down();
    await page.mouse.move(l.x+x2, l.y+y2, {steps:6}); await page.mouse.up();
    await page.waitForTimeout(250);
  };
  const tira = async (corner, dx, dy)=>{
    const p = await page.evaluate(c=>{
      const h = document.querySelector('.ar-clip-handle[data-corner="'+c+'"]');
      const r = h.getBoundingClientRect();
      return { x:r.left+r.width/2, y:r.top+r.height/2, visibile: r.width > 0 };
    }, corner);
    if(!p.visibile) return null;
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x+dx, p.y+dy, {steps:6}); await page.mouse.up();
    await page.waitForTimeout(200);
    return true;
  };

  console.log('\n── il riquadro ha angoli E mediane ──');
  await page.evaluate(()=> document.querySelector('.ar-clip').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(200);
  await disegna(60, 120, 340, 460);
  const maniglie = await page.evaluate(()=> Array.from(document.querySelectorAll('.ar-clip-handle'))
    .filter(h=> h.getBoundingClientRect().width > 0).map(h=>h.dataset.corner).sort());
  ok('otto maniglie: quattro angoli e quattro mediane',
     maniglie.join(',') === 'e,n,ne,nw,s,se,sw,w', maniglie);

  console.log('\n── una mediana muove UN lato solo ──');
  let prima = await box();
  await tira('e', 60, 0);
  let dopo = await box();
  ok('il lato destro si allarga', dopo.w > prima.w + 40, { prima, dopo });
  ok('e l\'altezza non si muove di un pixel', dopo.h === prima.h, { prima, dopo });
  ok('nemmeno il bordo sinistro', dopo.left === prima.left, { prima, dopo });

  prima = await box();
  await tira('n', 0, 50);
  dopo = await box();
  ok('il lato alto scende', dopo.top > prima.top + 30 && dopo.h < prima.h - 30, { prima, dopo });
  ok('e la larghezza resta quella', dopo.w === prima.w, { prima, dopo });

  console.log('\n── un angolo invece ne muove due ──');
  prima = await box();
  // Verso l'interno: verso l'esterno il riquadro e' gia' contro il bordo del
  // livello e il confronto direbbe solo che il clamp funziona.
  await tira('se', -40, -40);
  dopo = await box();
  ok('cambiano sia larghezza sia altezza', dopo.w < prima.w - 20 && dopo.h < prima.h - 20, { prima, dopo });

  console.log('\n── su un riquadro piccolo le mediane si tolgono di mezzo ──');
  await page.evaluate(()=> document.querySelector('[data-act="retryclip"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(200);
  await disegna(120, 200, 175, 255);   // 55x55: piu' corto della soglia
  const piccole = await page.evaluate(()=> Array.from(document.querySelectorAll('.ar-clip-handle'))
    .filter(h=> h.getBoundingClientRect().width > 0).map(h=>h.dataset.corner).sort());
  ok('restano i soli angoli', piccole.join(',') === 'ne,nw,se,sw', piccole);

  console.log('\n── quanto pesa il ritaglio ──');
  const peso = await page.evaluate(async ()=>{
    // Una tavola vera, ritagliata a 2000px: e' il caso che si spedisce.
    const im = document.querySelectorAll('.ar-cell')[1].querySelector('.ar-img');
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1400;
    c.getContext('2d').drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, 0, 0, 2000, 1400);
    const cod = (t,q)=> new Promise(r=> c.toBlob(b=>r(b), t, q));
    const j = await cod('image/jpeg', 0.88);
    const w = await cod('image/webp', 0.82);
    return { jpeg: j.size, webp: w.size, tipoWebp: w.type };
  });
  ok('il browser produce davvero WebP', peso.tipoWebp === 'image/webp', peso);
  ok('e pesa meno del JPEG di prima', peso.webp < peso.jpeg, peso);
  // La tavola del banco e' a tinta unita, quindi comprime in modo irreale:
  // il RAPPORTO qui non vale come misura, vale solo il verso.
  console.log('   (tavola di prova a tinta unita) JPEG ' + (peso.jpeg/1024).toFixed(0) +
              ' KB · WebP ' + (peso.webp/1024).toFixed(0) + ' KB');

  console.log('\n── e su qualcosa che somiglia a una tavola vera ──');
  const vero = await page.evaluate(async ()=>{
    // Tratto nero su bianco, retini, campiture: il profilo di una scansione a
    // fumetti, che e' il caso che conta. Una tinta unita comprimerebbe in modo
    // irreale e direbbe un numero che non vale per niente.
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1400;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0,0,2000,1400);
    x.strokeStyle = '#111'; x.fillStyle = '#111';
    for(let i=0;i<220;i++){
      x.lineWidth = 1 + (i % 7);
      x.beginPath();
      x.moveTo((i*137)%2000, (i*271)%1400);
      x.bezierCurveTo((i*53)%2000,(i*97)%1400,(i*311)%2000,(i*17)%1400,(i*89)%2000,(i*199)%1400);
      x.stroke();
    }
    for(let i=0;i<40;i++){ x.beginPath(); x.arc((i*211)%2000,(i*163)%1400, 30+(i%50), 0, 6.284); x.fill(); }
    // retino a puntini, il grande nemico del JPEG
    for(let y=0;y<1400;y+=4) for(let px=(y/4%2)*2; px<2000; px+=4) x.fillRect(px,y,1.5,1.5);
    const cod = (t,q)=> new Promise(r=> c.toBlob(b=>r(b), t, q));
    const j = await cod('image/jpeg', 0.88);
    const w = await cod('image/webp', 0.82);
    return { jpeg: j.size, webp: w.size };
  });
  ok('anche su tratto e retini il WebP pesa meno', vero.webp < vero.jpeg, vero);
  console.log('   JPEG 0.88: ' + (vero.jpeg/1024).toFixed(0) + ' KB   ·   WebP 0.82: ' + (vero.webp/1024).toFixed(0) +
              ' KB   ·   ' + Math.round(100 - vero.webp/vero.jpeg*100) + '% in meno');
});
