// ── IL GERMANO E LA SUA FAMIGLIA DI PIXEL ──
// Il germano nasce nel terminale dell'archivio (js/archivio.js), ma dal 10
// ottobre 2026 cammina anche nel lettore degli albi, mentre un albo si
// scarica, e le icone del lettore sono disegnate con le sue stesse regole:
// "le icone le vorrei con lo stile cyberpunk retroilluminato pixellato
// dell'anatra" (Giovanni). Tenerlo qui, in un posto solo, vuol dire che se un
// giorno cambia un pixel del germano cambia dappertutto.

// IL GERMANO DI INKFLOW (10 ottobre 2026): il logo, un'anatra in pixel art
// azzurra nello stile del Pip-Boy, che cammina sotto le righe dell'avvio.
// Quattro passi, disegnati a parte e scelti da Giovanni fra una decina di
// prove; qui c'e' il risultato pixel per pixel: a contorno acceso, m tono
// medio (testa e collo), s spento (corpo), o l'occhio (un buco nello schermo,
// sempre nello stesso punto della testa: quando si spostava per conto suo
// "faceva venire mal di testa").
export const ANATRA = [
  ['.......................aaa.....',
   '.....................aammma....',
   '....................ammmmoma...',
   '....................ammmmmmaaaa',
   '.....................ammmaaaaaa',
   '.....................amma......',
   '.....................ama.......',
   '.....................ama.......',
   '....................aaaa.......',
   '..................aasssa.......',
   '....a...aaaaaaaaaassssa........',
   '..aasaaasssssssssssssssa.......',
   'aassssssssssssaaaasssssa.......',
   'asssssaaaaaaaaassssssssa.......',
   '.asssssssssssssssssssssa.......',
   '.assssssssssssssssssssa........',
   '.assssssssssssssssssssa........',
   '..assssssssssssssssaaa.........',
   '...aaassssssssssaaa............',
   '......aaaaaaaaaa...............',
   '.........a....a................',
   '........aa....aa...............',
   '........aaaa...aaa.............'],
  ['...............................',
   '......................aaa......',
   '....................aammma.....',
   '...................ammmmoma....',
   '...................ammmmmmaaaa.',
   '....................ammmaaaaaa.',
   '....................amma.......',
   '....................ama........',
   '....................ama........',
   '....................aaa........',
   '..................aassa........',
   '....a...aaaaaaaaaassssa........',
   '..aasaaasssssssssssssssa.......',
   'aassssssssssssaaaasssssa.......',
   'asssssaaaaaaaaassssssssa.......',
   '.asssssssssssssssssssssa.......',
   '.assssssssssssssssssssa........',
   '.assssssssssssssssssssa........',
   '..assssssssssssssssaaa.........',
   '...aaasssaassaasaaa............',
   '......aaaaaaaaaa...............',
   '.........aa..aa................',
   '.........aaaa.aaa..............'],
  ['.....................aaa.......',
   '...................aammma......',
   '..................ammmmoma.....',
   '..................ammmmmmaaaa..',
   '...................ammmaaaaaa..',
   '...................amma........',
   '...................ama.........',
   '...................ama.........',
   '...................aaa.........',
   '..................assa.........',
   '....a...aaaaaaaaaassssa........',
   '..aasaaasssssssssssssssa.......',
   'aassssssssssssaaaasssssa.......',
   'asssssaaaaaaaaassssssssa.......',
   '.asssssssssssssssssssssa.......',
   '.assssssssssssssssssssa........',
   '.assssssssssssssssssssa........',
   '..assssssssssssssssaaa.........',
   '...aaassssssssssaaa............',
   '......aaaaaaaaaa...............',
   '..........a..a.................',
   '..........aaaa.................',
   '...........aaaaa...............'],
  ['...............................',
   '......................aaa......',
   '....................aammma.....',
   '...................ammmmoma....',
   '...................ammmmmmaaaa.',
   '....................ammmaaaaaa.',
   '....................amma.......',
   '....................ama........',
   '....................ama........',
   '....................aaa........',
   '..................aassa........',
   '....a...aaaaaaaaaassssa........',
   '..aasaaasssssssssssssssa.......',
   'aassssssssssssaaaasssssa.......',
   'asssssaaaaaaaaassssssssa.......',
   '.asssssssssssssssssssssa.......',
   '.assssssssssssssssssssa........',
   '.assssssssssssssssssssa........',
   '..assssssssssssssssaaa.........',
   '...aaasssaassaasaaa............',
   '......aaaaaaaaaa...............',
   '.........aa..aa................',
   '..........aaaaaaa..............']
];
export const ANATRA_TONI = { a:'#5ff4ff', m:'#2bb6d6', s:'#126d8c' };
export const ANATRA_PASSO = 167;   // ms per passo: sei al secondo, come nella prova scelta

// Disegna il passo i del germano su un canvas grande quanto lui (un pixel del
// disegno = un pixel del canvas; lo ingrandisce il CSS, con
// image-rendering:pixelated). L'occhio 'o' e' un buco: resta il fondo.
export function disegnaGermano(ctx, i){
  const f = ANATRA[i % ANATRA.length];
  ctx.clearRect(0, 0, f[0].length, f.length);
  f.forEach((r, y)=>{ for(let x = 0; x < r.length; x++){
    const c = r[x]; if(c === '.' || c === 'o') continue;
    ctx.fillStyle = ANATRA_TONI[c]; ctx.fillRect(x, y, 1, 1);
  } });
}

// LE ICONE DEL LETTORE, a pixel come il germano. Stessi toni: 'a' e' il
// tratto acceso; l'ombra spenta ('s') non si disegna a mano ma la mette
// iconaPixel() un pixel sotto e a destra di ogni pixel acceso che ha il vuoto
// li' — lo scalino che dà il rilievo al germano, uguale su tutte le icone.
// Griglie piccole (9-13 pixel) a 2px l'uno: a meno il disegno si impasta, a
// piu' le icone diventano piu' grandi di quelle che sostituiscono.
// Due cose provate e cambiate nel bozzetto: la prospettiva fatta come un
// fascio "appiattito" verso un punto sembrava una pistola, ora sono tre righe
// che si aprono a ventaglio da un punto; prima/ultima pagina con la freccia
// attaccata alla sbarra si leggevano come una K, ora c'e' un pixel d'aria.
const vuota = (w, h)=> Array.from({ length:h }, ()=> Array(w).fill('.'));
const punto = (g, x, y)=>{ if(g[y] && x >= 0 && x < g[0].length) g[y][x] = 'a'; };
function linea(g, x0, y0, x1, y1){
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let e = dx + dy;
  for(;;){
    punto(g, x0, y0);
    if(x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if(e2 >= dy){ e += dy; x0 += sx; }
    if(e2 <= dx){ e += dx; y0 += sy; }
  }
}
const righe = rr => rr.map(r => r.split(''));
const GRIGLIE = {
  chiudi: righe(['aa.......aa','.aa.....aa.','..aa...aa..','...aa.aa...','....aaa....','...aa.aa...','..aa...aa..','.aa.....aa.','aa.......aa']),
  prec:   righe(['....aa','...aa.','..aa..','.aa...','aa....','.aa...','..aa..','...aa.','....aa']),
  succ:   righe(['aa....','.aa...','..aa..','...aa.','....aa','...aa.','..aa..','.aa...','aa....']),
  prima:  righe(['aa.....aa','aa....aa.','aa...aa..','aa..aa...','aa.aa....','aa..aa...','aa...aa..','aa....aa.','aa.....aa']),
  ultima: righe(['aa.....aa','.aa....aa','..aa...aa','...aa..aa','....aa.aa','...aa..aa','..aa...aa','.aa....aa','aa.....aa']),
  tutta:  righe(['aaaa...aaaa','a.........a','a.........a','a.........a','...........','...........','...........','a.........a','a.........a','a.........a','aaaa...aaaa']),
  riprova:righe(['..aaaa.a..','.aa..aaa..','aa...aaa..','a.........','a........a','aa......aa','.aa....aa.','..aaaaaa..']),
  prosp: (()=>{ const g = vuota(13, 11);
    linea(g, 0, 0, 9, 5); linea(g, 0, 5, 9, 5); linea(g, 0, 10, 9, 5);
    [[10,4],[11,4],[10,5],[11,5],[10,6],[11,6],[12,5]].forEach(([x, y])=> punto(g, x, y));
    return g; })(),
  forbici: (()=>{ const g = vuota(12, 12);
    const anello = (x, y)=> ['.aa.','a..a','a..a','.aa.'].forEach((r, j)=> r.split('').forEach((c, i)=>{ if(c === 'a') punto(g, x + i, y + j); }));
    anello(0, 0); anello(0, 8); linea(g, 3, 3, 11, 10); linea(g, 3, 8, 11, 1); linea(g, 4, 3, 11, 9);
    return g; })(),
};
export function iconaPixel(nome, px = 2){
  const g = GRIGLIE[nome], h = g.length, w = g[0].length;
  const o = vuota(w + 1, h + 1);
  g.forEach((r, y)=> r.forEach((c, x)=>{ if(c !== '.') o[y][x] = c; }));
  g.forEach((r, y)=> r.forEach((c, x)=>{ if(c === 'a' && o[y + 1][x + 1] === '.') o[y + 1][x + 1] = 's'; }));
  let pix = '';
  o.forEach((r, y)=> r.forEach((c, x)=>{
    if(c !== '.') pix += `<rect class="px-${c}" x="${x}" y="${y}" width="1.02" height="1.02"/>`;
  }));
  return `<svg class="px-ico" viewBox="0 0 ${w + 1} ${h + 1}" width="${(w + 1) * px}" height="${(h + 1) * px}" shape-rendering="crispEdges" aria-hidden="true">${pix}</svg>`;
}
