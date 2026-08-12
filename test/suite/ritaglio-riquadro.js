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

  console.log('\n── quanto costa un ritaglio, in byte e in tempo ──');
  // Tratto nero su bianco, retini, campiture: il profilo di una scansione a
  // fumetti, che e' il caso che conta davvero. Le tavole del banco sono a
  // tinta unita e comprimerebbero in modo irreale, dicendo un numero che non
  // vale per niente.
  const misura = await page.evaluate(async ()=>{
    const tavola = (w,h)=>{
      const c = document.createElement('canvas'); c.width=w; c.height=h;
      const x = c.getContext('2d');
      x.fillStyle='#fff'; x.fillRect(0,0,w,h);
      x.strokeStyle='#111'; x.fillStyle='#111';
      const n = Math.round(220*(w*h)/(2000*1400));
      for(let i=0;i<n;i++){
        x.lineWidth = 1+(i%7);
        x.beginPath(); x.moveTo((i*137)%w,(i*271)%h);
        x.bezierCurveTo((i*53)%w,(i*97)%h,(i*311)%w,(i*17)%h,(i*89)%w,(i*199)%h);
        x.stroke();
      }
      for(let i=0;i<40;i++){ x.beginPath(); x.arc((i*211)%w,(i*163)%h,30+(i%50),0,6.284); x.fill(); }
      for(let y=0;y<h;y+=4) for(let px=(y/4%2)*2;px<w;px+=4) x.fillRect(px,y,1.5,1.5);
      return c;
    };
    const CAP = 1400000;                       // CLIP_MAX_BYTES in albums.js
    const src = tavola(2480, 3508);            // una scansione, come esce da un CBR
    const prova = async (dim)=>{
      let w = 1800, h = 2400;                  // si ritaglia circa mezza tavola
      if(w>dim||h>dim){ if(w>=h){h=Math.round(h*dim/w);w=dim;} else {w=Math.round(w*dim/h);h=dim;} }
      const t0 = performance.now();
      const cv = document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(src, 300, 400, 1800, 2400, 0, 0, w, h);
      const cod = (t,q)=> new Promise(r=> cv.toBlob(r, t, q));
      let q = 0.82, bl = await cod('image/webp', q), giri = 1;
      while(bl && bl.size > CAP && q > 0.5){ q = Math.max(0.5, q-0.1); bl = await cod('image/webp', q); giri++; }
      const jp = await cod('image/jpeg', 0.88);
      return { ms: Math.round(performance.now()-t0), byte: bl.size, giri, jpeg: jp.size, tipo: bl.type };
    };
    return { vecchio: await prova(2000), nuovo: await prova(1600) };
  });
  const kb = n => (n/1024).toFixed(0) + ' KB';
  ok('il browser produce davvero WebP', misura.nuovo.tipo === 'image/webp', misura.nuovo);
  ok('e su tratto e retini pesa meno del JPEG di prima',
     misura.nuovo.byte < misura.nuovo.jpeg, misura.nuovo);
  ok('a 1600 il ritaglio sta sotto il tetto AL PRIMO COLPO (niente seconda codifica)',
     misura.nuovo.giri === 1, misura.nuovo);
  ok('e pesa molto meno di quello che si spediva a 2000',
     misura.nuovo.byte < misura.vecchio.byte * 0.8, misura);
  console.log('   2000px → ' + kb(misura.vecchio.byte) + ' in ' + misura.vecchio.ms + ' ms'
    + (misura.vecchio.giri > 1 ? ' (' + misura.vecchio.giri + ' codifiche)' : ''));
  console.log('   1600px → ' + kb(misura.nuovo.byte) + ' in ' + misura.nuovo.ms + ' ms'
    + '   ·   ' + Math.round(100 - misura.nuovo.byte/misura.vecchio.byte*100) + '% di byte in meno');

  console.log('\n── il banner dice a che punto e\' il caricamento ──');
  // Chi ritaglia vede "Ritaglio in corso…" e basta, per tutti i secondi che
  // la rete si prende: un banner fermo fa sembrare l'app piantata. Qui si
  // guarda che la percentuale ci sia e che salga davvero.
  await page.evaluate(()=>{ window.__salita = 8; window.__scritte = []; });
  await page.evaluate(()=>{
    const el = document.querySelector('.ar-toast');
    new MutationObserver(()=>{ window.__scritte.push(el.textContent); })
      .observe(el, { childList:true, characterData:true, subtree:true });
  });
  await page.evaluate(()=> document.querySelector('[data-act="retryclip"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(200);
  await disegna(60, 120, 340, 460);
  await page.evaluate(()=> document.querySelector('[data-act="confirmclip"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));
  await page.waitForTimeout(1200);
  const scritte = await page.evaluate(()=> window.__scritte);
  const perc = scritte.map(t=>{ const m = /(\d+)%/.exec(t); return m ? +m[1] : null; }).filter(n=>n!==null);
  ok('durante il caricamento compare una percentuale', perc.length >= 3, scritte);
  ok('e sale, non scende mai', perc.every((n,i)=> i===0 || n >= perc[i-1]), perc);
  ok('non arriva a 100 prima di essere davvero salvato', perc.every(n=> n < 100), perc);
  ok('e alla fine lo dice', /salvat/i.test(scritte[scritte.length-1] || ''), scritte.slice(-3));
});
