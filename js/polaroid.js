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
// - Rimettendola giu' torna dritta e dal lato della foto, e solo allora la
//   piccola ricompare: nessun momento con due polaroid sullo schermo.
// La foto grande e' 640px di larghezza: la polaroid del tavolo (300px)
// ingrandita fino a 340px su uno schermo a densita' doppia si sgranava.

const PROPORZIONE = 790 / 640;        // altezza / larghezza della foto
const MAX_PITCH = 55;
let _montata = false;

export function montaLaPolaroid(){
  const piccola = document.querySelector('.scriv-polaroid');
  if(_montata || !piccola) return;
  _montata = true;

  const scena = document.createElement('div');
  scena.className = 'pola-scena';
  scena.innerHTML = `
    <div class="pola-velo"></div>
    <div class="pola-ombra"></div>
    <div class="pola-foto">
      <div class="pola-strato" style="transform:translateZ(-.4px)"></div>
      <div class="pola-strato" style="transform:translateZ(-.8px)"></div>
      <div class="pola-strato" style="transform:translateZ(-1.2px)"></div>
      <div class="pola-strato" style="transform:translateZ(-1.6px)"></div>
      <div class="pola-faccia pola-dietro"><div class="pola-luce"></div></div>
      <div class="pola-faccia pola-davanti"><div class="pola-luce"></div></div>
    </div>
    <button class="pola-chiudi" type="button" aria-label="Rimetti giù la polaroid">×</button>
    <p class="pola-aiuto">Trascina per girarla · tocca fuori per rimetterla giù</p>`;
  document.body.appendChild(scena);
  const foto = scena.querySelector('.pola-foto');
  const ombra = scena.querySelector('.pola-ombra');
  const [lR, lD] = scena.querySelectorAll('.pola-luce');
  const ridotto = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, aperta = false, ry = 0, rx = 0, vy = 0, vx = 0, anim = 0, attesa = 0;
  const misura = ()=>{
    W = Math.min(innerWidth * .72, innerHeight * .55, 340);
    scena.style.setProperty('--pw', W + 'px');
  };
  const centro = ()=> ({ x:(innerWidth - W) / 2, y:(innerHeight - W * PROPORZIONE) / 2 - 10 });
  // Dove sta la piccola adesso, e quanto e' storta (la legge dal CSS, che
  // la vuole a -9 gradi sul computer e a -10 sul telefono).
  const daDoveSta = ()=>{
    const r = piccola.getBoundingClientRect();
    const m = getComputedStyle(piccola).transform;
    let ang = -10;
    const v = /matrix\(([^)]+)\)/.exec(m || '');
    if(v){ const [a, b] = v[1].split(',').map(Number); ang = Math.atan2(b, a) * 180 / Math.PI; }
    const w = piccola.offsetWidth || 118;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return `translate3d(${cx - W / 2}px,${cy - W * PROPORZIONE / 2}px,0) scale(${w / W}) rotateZ(${ang}deg)`;
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
    // Torna dal lato della foto, per la strada piu' corta.
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

  // Trascinare = girare. Un tocco fermo fuori dalla foto la rimette giu'.
  let giu = null, ultimo = null;
  scena.addEventListener('pointerdown', e=>{
    if(!aperta || e.target.closest('.pola-chiudi')) return;
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
    if(performance.now() - ultimo.t > 80){ vy = 0; vx = 0; }   // fermata prima di lasciarla
    inerzia();
  };
  scena.addEventListener('pointerup', su);
  scena.addEventListener('pointercancel', su);
  scena.querySelector('.pola-chiudi').addEventListener('click', chiudi);
  addEventListener('keydown', e=>{ if(e.key === 'Escape') chiudi(); });
  addEventListener('resize', ()=>{ if(aperta){ misura(); disegna(); } });
  // Se si cambia schermata con la foto in mano, la si rimette giu'.
  addEventListener('popstate', ()=>{ if(aperta) chiudi(); });

  // Si apre col tocco, e anche tenendo premuto: dopo 380ms si stacca da
  // sola, senza aspettare che il dito si alzi.
  let lunga = 0;
  piccola.addEventListener('pointerdown', ()=>{ clearTimeout(lunga); lunga = setTimeout(()=>{ lunga = 0; apri(); }, 380); });
  piccola.addEventListener('pointerup', ()=>{ if(lunga){ clearTimeout(lunga); lunga = 0; apri(); } });
  piccola.addEventListener('pointerleave', ()=>{ clearTimeout(lunga); lunga = 0; });
  piccola.addEventListener('pointercancel', ()=>{ clearTimeout(lunga); lunga = 0; });
  piccola.addEventListener('contextmenu', e=> e.preventDefault());
  piccola.addEventListener('keydown', e=>{ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); apri(); } });
}
