// ── LA POLAROID DI MAX, IN MANO ──
// Toccando (o tenendo premuta) la polaroid nell'angolo della scrivania, si
// stacca dal tavolo, viene al centro dello schermo e la si gira col dito come
// una foto vera, fino a vederne il retro (Giovanni, 9 ottobre 2026: "vorrei
// che diventasse un piccolo modello 3D che posso muovere e ruotare").
//
// Scelte, dal mockup approvato lo stesso giorno:
// - PARTE DA DOVE STA. L'animazione comincia esattamente sulla polaroid
//   piccola (posizione, grandezza e i suoi -9/-10 gradi), cosi' si vede lei
//   che si alza, non una seconda foto che compare.
// - IL RETRO E' BIANCO COME IL DAVANTI, senza scritte, con qualche alone e
//   puntino di vecchio (img/scrivania/polaroid-retro.webp, disegnato in
//   Python). La prima versione aveva un retro scuro con "Max" a penna: "fai il
//   retro bianco come il davanti e non ci scriviamo niente".
// - NIENTE RIFLESSO LUCIDO: quello sulla polaroid del tavolo era "terribile".
//   Girandola cambia solo la luce: la faccia che si allontana si scurisce.
// - LO SPESSORE sono quattro fogli a 0,4px l'uno dall'altro dietro la faccia:
//   di taglio si vede un bordo, non una carta velina che sparisce.
// - In orizzontale gira senza limiti; in verticale fino a 55 gradi, e
//   lasciata andare torna piano dritta, come appoggiata su un palmo.
// - NIENTE X E NIENTE ISTRUZIONI: c'erano una × in alto e la riga "Trascina
//   per girarla", tolte lo stesso giorno ("non c'e' bisogno"). Si rimette
//   giu' toccando fuori dalla foto, o col tasto Esc.
// - Rimettendola giu' torna dritta e dal lato della foto, e solo allora la
//   piccola ricompare: nessun momento con due polaroid sullo schermo.
// La foto grande e' 640px di larghezza: la polaroid del tavolo (300px)
// ingrandita fino a 340px su uno schermo a densita' doppia si sgranava.

// ── E POI I DUE FOGLI (10 ottobre 2026) ──
// Il foglio giallo con la frase e il biglietto di "Stasera" si prendono in
// mano allo stesso modo. Ma SOLO TENENDO PREMUTO: il biglietto col tocco
// apre il progetto di stasera, e un tocco per sbaglio non deve trasformarsi
// in un oggetto che vola al centro (Giovanni: "il rischio e' aprirli per
// sbaglio"). 600 ms e non 380 come la polaroid: oltre i 550 ms sound.js non
// fa il tic del tocco al rilascio (TAP_MAX_MS), e il clic che segue la
// pressione lunga viene mangiato, cosi' il biglietto non apre anche il
// progetto.
// Il davanti e' il foglio vero clonato, con le sue scritte (il compito, la
// frase): ingrandito, non rifatto. Il retro e' la stessa carta specchiata e
// schiarita, come il dorso di un foglio scritto da una parte sola. Niente
// spessore a strati: e' carta, e gli strati sarebbero rettangoli pieni sotto
// i bordi stropicciati, dove la carta non c'e'.

const MAX_PITCH = 55;
let _montata = false;

export function montaLaPolaroid(){
  if(_montata) return;
  const pol = document.querySelector('.scriv-polaroid');
  if(!pol) return;
  _montata = true;
  // La polaroid per prima: la sua scena e' la prima .pola-scena del documento.
  prendibile(pol, { proporzione: ()=> 790 / 640, classe:'pola-polaroid', strati:4, larghezza:340 });
  const leg = document.getElementById('scriv-legenda');
  if(leg) prendibile(leg, { foglio:true, soloTenendo:true, larghezza:440, classe:'pola-frase' });
  const big = document.getElementById('scriv-biglietto');
  if(big) prendibile(big, { foglio:true, soloTenendo:true, larghezza:420, classe:'pola-stasera' });
}

function prendibile(piccola, o){
  const strati = o.strati || 0;
  const scena = document.createElement('div');
  scena.className = 'pola-scena ' + (o.classe || '');
  scena.innerHTML = `
    <div class="pola-velo"></div>
    <div class="pola-ombra"></div>
    <div class="pola-foto">
      ${Array.from({length:strati}, (_, i)=> `<div class="pola-strato" style="transform:translateZ(-${((i+1)*.4).toFixed(1)}px)"></div>`).join('')}
      <div class="pola-faccia pola-dietro"><div class="pola-retro"></div><div class="pola-luce"></div></div>
      <div class="pola-faccia pola-davanti"><div class="pola-luce"></div></div>
    </div>`;
  document.body.appendChild(scena);
  const foto = scena.querySelector('.pola-foto');
  const ombra = scena.querySelector('.pola-ombra');
  const davanti = scena.querySelector('.pola-davanti');
  const retro = scena.querySelector('.pola-retro');
  const [lR, lD] = scena.querySelectorAll('.pola-luce');
  const ridotto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Un foglio e' alto quanto quello che c'e' scritto: la proporzione si legge
  // ogni volta dal foglio vero.
  const proporzione = ()=> o.proporzione ? o.proporzione()
    : (piccola.offsetHeight || 1) / (piccola.offsetWidth || 1);
  let R = proporzione();

  let W = 0, aperta = false, ry = 0, rx = 0, vy = 0, vx = 0, anim = 0, attesa = 0;
  const misura = ()=>{
    R = proporzione();
    W = Math.min(innerWidth * (o.foglio ? .88 : .72), innerHeight * .55 / Math.max(R, .5), o.larghezza || 340);
    scena.style.setProperty('--pw', W + 'px');
    foto.style.aspectRatio = `1 / ${R}`;
  };
  const centro = ()=> ({ x:(innerWidth - W) / 2, y:(innerHeight - W * R) / 2 - 10 });
  // Dove sta il pezzo piccolo adesso, e quanto e' storto (lo legge dal CSS).
  const daDoveSta = ()=>{
    const r = piccola.getBoundingClientRect();
    const m = getComputedStyle(piccola).transform;
    let ang = 0;
    const v = /matrix\(([^)]+)\)/.exec(m || '');
    if(v){ const [a, b] = v[1].split(',').map(Number); ang = Math.atan2(b, a) * 180 / Math.PI; }
    const w = piccola.offsetWidth || 118;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return `translate3d(${cx - W / 2}px,${cy - W * R / 2}px,0) scale(${w / W}) rotateZ(${ang}deg)`;
  };

  // IL FOGLIO VERO, INGRANDITO: si clona com'e' adesso (il compito di stasera
  // cambia) e lo si scala alla larghezza della faccia.
  const vesti = ()=>{
    if(!o.foglio) return;
    davanti.querySelectorAll('.pola-copia').forEach(x=> x.remove());
    const w = piccola.offsetWidth, h = piccola.offsetHeight;
    const c = piccola.cloneNode(true);
    c.removeAttribute('id'); c.querySelectorAll('[id]').forEach(x=> x.removeAttribute('id'));
    c.classList.remove('in-mano');
    c.classList.add('pola-copia');
    c.removeAttribute('onclick');
    Object.assign(c.style, { position:'absolute', left:'0', top:'0', margin:'0', width:w + 'px', height:h + 'px',
      transform:`scale(${W / w})`, transformOrigin:'0 0', filter:'none', pointerEvents:'none' });
    davanti.insertBefore(c, davanti.firstChild);
    retro.style.backgroundImage = getComputedStyle(piccola).backgroundImage;
  };

  function disegna(){
    const c = centro();
    foto.style.transform = `translate3d(${c.x}px,${c.y}px,0) rotateX(${rx}deg) rotateY(${ry}deg)`;
    const nz = Math.cos(ry * Math.PI / 180) * Math.cos(rx * Math.PI / 180);
    lD.style.opacity = ((1 - Math.max(0, nz)) * .55).toFixed(3);
    lR.style.opacity = ((1 - Math.max(0, -nz)) * .55).toFixed(3);
    ombra.style.width = (W * (.55 + .45 * Math.abs(Math.cos(ry * Math.PI / 180)))) + 'px';
  }

  function apri(){
    if(aperta) return;
    aperta = true;
    misura();
    vesti();
    ry = 0; rx = 0; vy = 0; vx = 0;
    foto.style.transition = 'none';
    foto.style.transform = daDoveSta();
    scena.classList.add('aperta', 'in-volo');
    piccola.classList.add('in-mano');
    foto.getBoundingClientRect();
    const dur = ridotto ? 0 : 520;
    foto.style.transition = `transform ${dur}ms cubic-bezier(.2,.8,.2,1)`;
    // Arriva con mezzo giro addosso: si capisce subito che e' un oggetto
    // e che si puo' girare.
    if(!ridotto){ ry = -25; rx = 8; }
    disegna();
    clearTimeout(attesa);
    attesa = setTimeout(()=>{ foto.style.transition = 'none'; vy = ridotto ? 0 : 1.2; inerzia(); }, dur);
  }
  function chiudi(){
    if(!aperta) return;
    aperta = false;
    cancelAnimationFrame(anim); clearTimeout(attesa);
    // Torna dal lato giusto, per la strada piu' corta.
    ry = Math.round(ry / 360) * 360; rx = 0;
    const dur = ridotto ? 0 : 460;
    foto.style.transition = `transform ${dur}ms cubic-bezier(.4,0,.2,1)`;
    foto.style.transform = daDoveSta() + ` rotateX(0deg) rotateY(${ry}deg)`;
    lD.style.opacity = 0;
    scena.classList.remove('aperta');
    attesa = setTimeout(()=>{
      scena.classList.remove('in-volo');
      piccola.classList.remove('in-mano');
      foto.style.transition = 'none';
    }, dur);
  }

  function inerzia(){
    cancelAnimationFrame(anim);
    const passo = ()=>{
      if(!aperta) return;
      vy *= .94; vx *= .9;
      ry += vy; rx = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, rx + vx));
      rx *= .96;
      disegna();
      if(Math.abs(vy) > .02 || Math.abs(vx) > .02 || Math.abs(rx) > .1) anim = requestAnimationFrame(passo);
    };
    anim = requestAnimationFrame(passo);
  }

  // Trascinare = girare. Un tocco fermo fuori dall'oggetto lo rimette giu'.
  let giu = null, ultimo = null;
  scena.addEventListener('pointerdown', e=>{
    if(!aperta) return;
    cancelAnimationFrame(anim);
    const t = performance.now();
    giu = { x:e.clientX, y:e.clientY, t, mosso:false };
    ultimo = { x:e.clientX, y:e.clientY, t };
    try{ scena.setPointerCapture(e.pointerId); }catch(err){}
  });
  scena.addEventListener('pointermove', e=>{
    if(!giu) return;
    const now = performance.now(), dt = Math.max(1, now - ultimo.t);
    const dx = e.clientX - ultimo.x, dy = e.clientY - ultimo.y;
    if(Math.hypot(e.clientX - giu.x, e.clientY - giu.y) > 6) giu.mosso = true;
    ry += dx * .45;
    rx = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, rx - dy * .35));
    vy = dx * .45 / dt * 16; vx = -dy * .35 / dt * 16;
    ultimo = { x:e.clientX, y:e.clientY, t:now };
    disegna();
  });
  const su = e=>{
    if(!giu) return;
    const tocco = !giu.mosso && performance.now() - giu.t < 300;
    giu = null;
    if(tocco){
      const r = foto.getBoundingClientRect();
      if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom){ chiudi(); return; }
    }
    if(performance.now() - ultimo.t > 80){ vy = 0; vx = 0; }   // fermato prima di lasciarlo
    inerzia();
  };
  scena.addEventListener('pointerup', su);
  scena.addEventListener('pointercancel', su);
  addEventListener('keydown', e=>{ if(e.key === 'Escape') chiudi(); });
  addEventListener('resize', ()=>{ if(aperta){ misura(); vesti(); disegna(); } });
  // Se si cambia schermata con l'oggetto in mano, lo si rimette giu'.
  addEventListener('popstate', ()=>{ if(aperta) chiudi(); });

  const ATTESA = o.soloTenendo ? 600 : 380;
  let lunga = 0, da = null, presoAlle = 0;
  const lascia = ()=>{ clearTimeout(lunga); lunga = 0; };
  piccola.addEventListener('pointerdown', e=>{
    lascia(); da = { x:e.clientX, y:e.clientY };
    lunga = setTimeout(()=>{
      lunga = 0; presoAlle = Date.now();
      try{ if(o.soloTenendo && navigator.vibrate) navigator.vibrate(12); }catch(err){}
      apri();
    }, ATTESA);
  });
  // il dito che scivola via non sta "tenendo": niente presa
  piccola.addEventListener('pointermove', e=>{
    if(lunga && da && Math.hypot(e.clientX - da.x, e.clientY - da.y) > 10) lascia();
  });
  piccola.addEventListener('pointerup', ()=>{
    if(!lunga) return;
    lascia();
    if(!o.soloTenendo) apri();   // la polaroid si prende anche col tocco
  });
  piccola.addEventListener('pointerleave', lascia);
  piccola.addEventListener('pointercancel', lascia);
  piccola.addEventListener('contextmenu', e=> e.preventDefault());
  // Il clic che segue una pressione lunga non deve fare anche il gesto del
  // tocco (aprire il progetto): lo si ferma prima che arrivi al foglio.
  document.addEventListener('click', e=>{
    if(Date.now() - presoAlle < 900 && piccola.contains(e.target)){
      e.preventDefault(); e.stopImmediatePropagation();
    }
  }, true);
  if(!o.soloTenendo){
    piccola.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); apri(); } });
  }
}
