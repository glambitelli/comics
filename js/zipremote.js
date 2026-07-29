// ── LETTORE ZIP "A INTERVALLI" ────────────────────────────────────────────
// Un .cbz è uno ZIP: la struttura del formato mette apposta l'indice (central
// directory) in FONDO al file, proprio per permettere di leggerlo senza avere
// tutto il resto sottomano. Qui sfruttiamo questo per aprire un albo leggendo
// SOLO: la coda del file (per trovare l'indice), l'indice stesso, e — una alla
// volta — le singole tavole che si guardano davvero.
//
// La sorgente dei byte è astratta in `readRange(start, end)`, quindi lo stesso
// parser serve due casi molto diversi:
//  · Google Drive → richieste HTTP Range: apre un albo senza scaricarlo
//  · file locale (o albo in cache su disco) → Blob.slice: apre un albo senza
//    caricarlo in memoria. Cruciale con volumi grossi: leggere tutto con
//    arrayBuffer() significa materializzare centinaia di MB nella heap, e su
//    telefono la scheda viene uccisa dal browser.
//
// Non copre i .cbr (RAR): quel formato non ha un indice equivalente leggibile
// così, e libarchive.js richiede comunque il file intero.
import { driveRangeFetch } from './drive.js';
import { inflateSync } from './vendor/fflate.js';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

function b2(buf, i){ return buf[i] | (buf[i+1] << 8); }
function b4(buf, i){ return (buf[i] | (buf[i+1] << 8) | (buf[i+2] << 16) | (buf[i+3] << 24)) >>> 0; }

// Apre uno ZIP dato un lettore di intervalli. `isImageEntry` e `naturalCompare`
// arrivano da albums.js per riusare gli stessi filtri e lo stesso ordinamento
// del percorso classico, invece di duplicarli qui.
export async function openZipSourceFromReader(readRange, totalSize, isImageEntry, naturalCompare){
  if(!totalSize || totalSize < 22) throw new Error('Dimensione del file sconosciuta.');

  // L'End Of Central Directory sta negli ultimi 22 byte + un commento
  // opzionale fino a 65535: una coda generosa lo contiene di sicuro.
  const tailSize = Math.min(totalSize, 65557 + 64);
  const base = totalSize - tailSize;
  const tail = await readRange(base, totalSize - 1);

  let e = tail.length - 22;
  for(; e >= 0 && b4(tail, e) !== EOCD_SIG; e--){}
  if(e < 0) throw new Error('Indice ZIP non trovato.');

  const totalEntries = b2(tail, e + 10);
  const cdSize = b4(tail, e + 12);
  const cdOffset = b4(tail, e + 16);
  if(cdOffset === 0xFFFFFFFF || totalEntries === 0xFFFF){
    throw new Error('ZIP troppo grande per la lettura a intervalli (zip64).');
  }

  // L'indice è quasi sempre già dentro la coda appena letta (i commenti sono
  // corti o assenti); solo se non basta lo richiediamo a parte.
  let cdBuf;
  if(cdOffset >= base){
    cdBuf = tail.subarray(cdOffset - base, cdOffset - base + cdSize);
  } else {
    cdBuf = await readRange(cdOffset, cdOffset + cdSize - 1);
  }

  const entries = [];
  let p = 0;
  const dec = new TextDecoder();
  for(let i = 0; i < totalEntries; i++){
    if(p + 46 > cdBuf.length || b4(cdBuf, p) !== CD_SIG) throw new Error('Indice ZIP incoerente.');
    const method = b2(cdBuf, p + 10);
    const compSize = b4(cdBuf, p + 20);
    const uncompSize = b4(cdBuf, p + 24);
    const nameLen = b2(cdBuf, p + 28);
    const extraLen = b2(cdBuf, p + 30);
    const commentLen = b2(cdBuf, p + 32);
    const localOffset = b4(cdBuf, p + 42);
    const name = dec.decode(cdBuf.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, uncompSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const byName = new Map(entries.map(en => [en.name, en]));
  const pageEntries = entries.filter(en => isImageEntry(en.name))
                             .sort((a, b) => naturalCompare(a.name, b.name));
  if(!pageEntries.length) throw new Error('Nessuna immagine nell\'indice ZIP.');

  return {
    pages: pageEntries.map(en => ({ name: en.name, url: null, blob: null })),
    // Legge UNA tavola: un solo intervallo che copre generosamente
    // l'intestazione locale (nome+extra raramente superano 512 byte) più i
    // dati compressi. Se la stima era corta (nome insolitamente lungo) si
    // rilegge con la misura esatta, ora nota. Poi decomprime (deflate) o
    // restituisce direttamente (stored, il caso tipico dei JPEG).
    async getData(name){
      const en = byName.get(name);
      if(!en) return null;
      const OVERFETCH = 512;
      const guessEnd = Math.min(totalSize - 1, en.localOffset + 30 + OVERFETCH + en.compSize - 1);
      let raw = await readRange(en.localOffset, guessEnd);
      const n2 = b2(raw, 26), m2 = b2(raw, 28);
      const dataStart = 30 + n2 + m2;
      const dataEnd = dataStart + en.compSize;
      if(dataEnd > raw.length){
        raw = await readRange(en.localOffset, en.localOffset + dataEnd - 1);
      }
      const compData = raw.subarray(dataStart, dataEnd);
      if(en.method === 0) return compData.slice();
      if(en.method === 8) return inflateSync(compData, { out: new Uint8Array(en.uncompSize) });
      throw new Error('Compressione ZIP non supportata (metodo ' + en.method + ').');
    },
  };
}

// Sorgente per un .cbz che vive su Google Drive: mai scaricato per intero.
export function openRemoteZipSource(fileId, totalSize, isImageEntry, naturalCompare){
  const readRange = (start, end) => driveRangeFetch(fileId, start, end);
  return openZipSourceFromReader(readRange, totalSize, isImageEntry, naturalCompare);
}

// Sorgente per un .cbz locale (o già in cache su disco): mai caricato per
// intero in memoria. Blob.slice non legge nulla finché non si chiede davvero
// quel pezzo, quindi la memoria resta a pochi MB anche con volumi enormi.
export function openBlobZipSource(blob, isImageEntry, naturalCompare){
  const readRange = async (start, end) =>
    new Uint8Array(await blob.slice(start, end + 1).arrayBuffer());
  return openZipSourceFromReader(readRange, blob.size, isImageEntry, naturalCompare);
}
