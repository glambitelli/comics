// ── ARCHIVIO: animazione sabbia della Home, versione originale a 60 fps ──
//
// Questo file NON fa parte dell'app (non è importato da nessuno). È qui solo
// come riferimento se in futuro si vuole riattivare l'effetto o recuperarne
// la versione "piena".
//
// Storia: l'animazione disegnava fino a 240 granelli per fotogramma con
// arc() (un path per granello) a 60 fps e densità 2 (retina). Misurato con
// CPU rallentata 4× (telefono di fascia media) costava ~559 ms di CPU al
// secondo sulla sola Home — più di mezzo core, in continuazione, solo per un
// effetto decorativo.
//
// Prima di disattivarla del tutto era stata ottimizzata (30 fps, densità 1,
// fillRect raggruppati per colore): sceso a ~192 ms/s (-66%) a parità
// d'aspetto. Il codice risultante è comunque quello attivo in js/home.js,
// solo che ora startSandstorm() non lo richiama più.
//
// Per riportare l'effetto in vita:
//   1. copia il corpo di startSandstorm() qui sotto al posto dello stub in
//      js/home.js (cerca "SABBIA DISATTIVATA" in quel file);
//   2. se si preferisce la resa "piena" 60fps/densità2 invece della versione
//      ottimizzata, usa il codice di questo file — è la versione originale,
//      testata e funzionante, di prima dell'ottimizzazione.

export function startSandstorm_ORIGINALE_60FPS(){
  if(_sandStarted) return;
  const canvas = document.getElementById('home-sand');
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  let rectW = 0, rectH = 0, particles = [];
  const sandColors = ['rgba(170,140,100,', 'rgba(150,120,85,', 'rgba(190,160,115,', 'rgba(160,130,95,'];

  function measure(){
    const rect = canvas.getBoundingClientRect();
    rectW = rect.width;
    rectH = rect.height;
    // Fallback: se il canvas non ha dimensioni ma la finestra sì, usa quelle
    if((rectW<=0||rectH<=0) && window.innerWidth>0){
      const screen = document.getElementById('screen-home');
      if(screen && screen.classList.contains('active')){
        rectW = window.innerWidth;
        rectH = window.innerHeight;
      }
    }
    return rectW > 0 && rectH > 0;
  }

  function setupCanvas(){
    const dpr = Math.min(window.devicePixelRatio||1, 2);
    canvas.width = rectW * dpr;
    canvas.height = rectH * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function buildParticles(){
    const COUNT = Math.max(70, Math.min(240, Math.round((rectW*rectH)/4000)));
    particles = [];
    for(let i=0;i<COUNT;i++){
      particles.push({
        x: Math.random()*rectW,
        y: Math.random()*rectH,
        r: 0.9 + Math.random()*1.4,    // piccoli ma sopra il pixel → visibili
        vx: 0.12 + Math.random()*0.4,  // deriva lenta
        vy: (-0.1 + Math.random()*0.2),
        a: 0.18 + Math.random()*0.24,  // opacità percepibile
        c: sandColors[Math.floor(Math.random()*sandColors.length)]
      });
    }
  }

  function tick(){
    // Pulisci l'INTERO bitmap (non solo l'area logica): evita scie residue
    // nella striscia bassa quando il canvas è più grande dell'area misurata.
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.restore();
    particles.forEach(p=>{
      p.x += p.vx;
      p.y += p.vy;
      if(p.x > rectW+5){ p.x = -5; p.y = Math.random()*rectH; }
      if(p.y < -5) p.y = rectH+5;
      if(p.y > rectH+5) p.y = -5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = p.c + p.a + ')';
      ctx.fill();
    });
    // Continua solo se la home è visibile e la tab è attiva
    const homeActive = document.getElementById('screen-home')?.classList.contains('active');
    if(homeActive && !document.hidden){
      _sandAnim = requestAnimationFrame(tick);
    } else {
      _sandAnim = null; // pausa: verrà ripreso da resumeSand()
    }
  }

  // Riprende l'animazione quando si torna sulla home / tab torna attiva
  function resumeSand(){
    const homeActive = document.getElementById('screen-home')?.classList.contains('active');
    if(homeActive && !document.hidden && _sandStarted && _sandAnim === null){
      if(measure()){ _sandAnim = requestAnimationFrame(tick); }
    }
  }
  window._resumeSand = resumeSand;
  document.addEventListener('visibilitychange', resumeSand);

  // Aspetta che il canvas abbia dimensioni reali (lo schermo home dev'essere visibile)
  let attempts = 0;
  function tryStart(){
    if(measure()){
      _sandStarted = true;
      setupCanvas();
      buildParticles();
      if(_sandAnim) cancelAnimationFrame(_sandAnim);
      tick();
      window.addEventListener('resize', ()=>{
        if(measure()){ setupCanvas(); buildParticles(); }
      }, {passive:true});
    } else if(attempts++ < 60){
      // riprova finché lo schermo non è visibile (max ~6s)
      setTimeout(tryStart, 100);
    }
  }
  tryStart();
}
