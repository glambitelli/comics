export function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return{r,g,b};
}
export function lighten(hex,amt=60){
  const {r,g,b}=hexToRgb(hex);
  return `rgb(${Math.min(255,r+amt)},${Math.min(255,g+amt)},${Math.min(255,b+amt)})`;
}
export function darken(hex,amt=40){
  const {r,g,b}=hexToRgb(hex);
  return `rgb(${Math.max(0,r-amt)},${Math.max(0,g-amt)},${Math.max(0,b-amt)})`;
}

export function drawGem(canvas, hex){
  const s = canvas.width;
  const ctx = canvas.getContext('2d');
  const cx = s/2, cy = s/2;
  const {r:cr, g:cg, b:cb} = hexToRgb(hex);
  const gr = s/2 * 0.78;

  // Corpo cristallo — traslucido
  const sphere = ctx.createRadialGradient(
    cx - gr*.28, cy - gr*.30, gr*.04,
    cx + gr*.12, cy + gr*.18, gr
  );
  sphere.addColorStop(0,    `rgba(${Math.min(255,cr+90)},${Math.min(255,cg+85)},${Math.min(255,cb+75)},.55)`);
  sphere.addColorStop(0.28, `rgba(${cr},${cg},${cb},.50)`);
  sphere.addColorStop(0.65, `rgba(${Math.max(0,cr-40)},${Math.max(0,cg-38)},${Math.max(0,cb-30)},.60)`);
  sphere.addColorStop(1,    `rgba(${Math.max(0,cr-70)},${Math.max(0,cg-65)},${Math.max(0,cb-55)},.70)`);
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2);
  ctx.fillStyle = sphere; ctx.fill();

  // Riflesso principale — luce che attraversa il cristallo
  const glare = ctx.createRadialGradient(cx-gr*.22, cy-gr*.28, 0, cx-gr*.10, cy-gr*.14, gr*.52);
  glare.addColorStop(0,   'rgba(255,255,255,.82)');
  glare.addColorStop(0.25,'rgba(255,255,255,.45)');
  glare.addColorStop(0.6, 'rgba(255,255,255,.10)');
  glare.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle = glare; ctx.fillRect(0,0,s,s);
  ctx.restore();

  // Riflesso secondario in basso a destra
  const glare2 = ctx.createRadialGradient(cx+gr*.30, cy+gr*.28, 0, cx+gr*.28, cy+gr*.26, gr*.22);
  glare2.addColorStop(0,   'rgba(255,255,255,.35)');
  glare2.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2); ctx.clip();
  ctx.fillStyle = glare2; ctx.fillRect(0,0,s,s);
  ctx.restore();

  // Alone incastonatura
  ctx.beginPath(); ctx.arc(cx, cy, gr, 0, Math.PI*2);
  ctx.strokeStyle = 'rgba(0,0,0,.42)';
  ctx.lineWidth = s * 0.058;
  ctx.stroke();
}
