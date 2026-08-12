// Genera gli albi .cbz usati dal banco di prova. Non stanno nel repository:
// sono file binari che si ricostruiscono in un istante, e li rigenera da solo
// test/esegui.js se mancano.
//
// Trucco che regge quasi tutte le prove sul lettore: nell'albo "pagine" ogni
// tavola è un PNG largo (indice+1) px, quindi la larghezza naturale
// dell'immagine DICE quale pagina una cella sta mostrando. Niente da leggere
// dal DOM, nessuna finzione: si guarda il pixel.
//
//   node test/crea-albi.js                → rigenera tutto
//   node test/crea-albi.js <file> <n> <w> <h>  → un albo su misura
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_T = (()=>{ const t=new Int32Array(256);
  for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[n]=c; }
  return t; })();
function crc32(buf, crc=0){
  crc = ~crc;
  for(let i=0;i<buf.length;i++) crc = CRC_T[(crc^buf[i])&0xFF] ^ (crc>>>8);
  return (~crc)>>>0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type,'ascii'), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
function png(w, h, rgb){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=2; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const raw = Buffer.alloc(h*(1+w*3));
  for(let y=0;y<h;y++){
    const off = y*(1+w*3);
    raw[off]=0;
    for(let x=0;x<w;x++){ raw[off+1+x*3]=rgb[0]; raw[off+2+x*3]=rgb[1]; raw[off+3+x*3]=rgb[2]; }
  }
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
// ZIP "stored": nessuna compressione, così l'archivio resta leggibile da
// fflate senza dipendere da un encoder esterno.
function zip(entries){
  const locals=[], centrals=[]; let off=0;
  for(const {name, data} of entries){
    const nb = Buffer.from(name,'ascii'), c = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0); lh.writeUInt16LE(20,4); lh.writeUInt16LE(0,6);
    lh.writeUInt16LE(0,8); lh.writeUInt16LE(0,10); lh.writeUInt16LE(0,12);
    lh.writeUInt32LE(c,14); lh.writeUInt32LE(data.length,18); lh.writeUInt32LE(data.length,22);
    lh.writeUInt16LE(nb.length,26); lh.writeUInt16LE(0,28);
    locals.push(lh, nb, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0); ch.writeUInt16LE(20,4); ch.writeUInt16LE(20,6);
    ch.writeUInt16LE(0,8); ch.writeUInt16LE(0,10); ch.writeUInt16LE(0,12); ch.writeUInt16LE(0,14);
    ch.writeUInt32LE(c,16); ch.writeUInt32LE(data.length,20); ch.writeUInt32LE(data.length,24);
    ch.writeUInt16LE(nb.length,28); ch.writeUInt32LE(off,42);
    centrals.push(ch, nb);
    off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50,0);
  eocd.writeUInt16LE(entries.length,8); eocd.writeUInt16LE(entries.length,10);
  eocd.writeUInt32LE(cd.length,12); eocd.writeUInt32LE(off,16);
  return Buffer.concat([Buffer.concat(locals), cd, eocd]);
}

function scrivi(dest, n, w, h){
  const entries = [];
  for(let i=0;i<n;i++){
    entries.push({
      name: 'p' + String(i+1).padStart(3,'0') + '.png',
      data: png(w || (i+1), w ? h : 8, [(i*20)%256, 90, 160]),
    });
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, zip(entries));
  console.log('  ' + path.basename(dest) + ' — ' + n + ' tavole' + (w ? ' da ' + w + 'x' + h : ' larghe quanto il loro indice'));
}

if(process.argv[2]){
  scrivi(process.argv[2], parseInt(process.argv[3]||'12',10),
         parseInt(process.argv[4]||'0',10), parseInt(process.argv[5]||'0',10));
} else {
  const dir = path.join(__dirname, 'fixtures');
  console.log('Albi di prova:');
  scrivi(path.join(dir, 'pagine.cbz'), 12);            // la larghezza dice la pagina
  scrivi(path.join(dir, 'tavole.cbz'), 5, 1400, 2000); // proporzioni da fumetto
  scrivi(path.join(dir, 'alta.cbz'),   5, 1000, 2600); // vincolata in altezza: si sposta davvero
  scrivi(path.join(dir, 'pesante.cbz'), 6, 2480, 3508);// scansione vera, per la memoria
}
