// ── LETTORE ZIP "A INTERVALLI" (HTTP Range) ──────────────────────────────
// Un .cbz è uno ZIP: la struttura del formato mette apposta l'indice (central
// directory) in FONDO al file, proprio per permettere di leggerlo senza
// scaricare tutto. Qui sfruttiamo questo per aprire un .cbz che vive su
// Google Drive leggendo via Range HTTP SOLO: la coda del file (per trovare
// l'indice), l'indice stesso, e — una alla volta — le singole tavole che si
// guardano davvero. Un albo da 50MB con 190 tavole da ~250KB l'una costa,
// per aprirlo e sfogliarne una, poche decine di KB invece di 50MB interi.
//
// Non copre i .cbr (RAR): quel formato non si presta allo stesso trucco senza
// un indice equivalente lato client, e libarchive.js richiede il file intero.
// Per i .cbr resta la strada precedente (download intero, poi in cache).
import { driveRangeFetch } from './drive.js';
import { inflateSync } from './vendor/fflate.js';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;

function b2(buf, i){ return buf[i] | (buf[i+1] << 8); }
function b4(buf, i){ return (buf[i] | (buf[i+1] << 8) | (buf[i+2] << 16) | (buf[i+3] << 24)) >>> 0; }

// L'End Of Central Directory sta negli ultimi 22 byte + un commento opzionale
// fino a 65535 byte: prendiamo una coda generosa che lo contiene di sicuro.
async function fetchTail(fileId, totalSize){
  const tailSize = Math.min(totalSize, 65557 + 64);
  const base = totalSize - tailSize;
  const buf = await driveRangeFetch(fileId, base, totalSize - 1);
  return { buf, base };
}

// Apre un .cbz remoto: legge solo indice + intestazioni, mai i dati delle
// tavole (quelli si leggono uno alla volta con getData). `isImageEntry` e
// `naturalCompare` sono passate da albums.js per riusare gli stessi filtri e
// lo stesso ordinamento del percorso locale, invece di duplicarli qui.
export async function openRemoteZipSource(fileId, totalSize, isImageEntry, naturalCompare){
  if(!totalSize || totalSize < 22) throw new Error('Dimensione del file Drive sconosciuta.');
  const { buf: tail, base } = await fetchTail(fileId, totalSize);

  let e = tail.length - 22;
  for(; e >= 0 && b4(tail, e) !== EOCD_SIG; e--){}
  if(e < 0) throw new Error('Indice ZIP non trovato.');

  const totalEntries = b2(tail, e + 10);
  const cdSize = b4(tail, e + 12);
  const cdOffset = b4(tail, e + 16);
  if(cdOffset === 0xFFFFFFFF || totalEntries === 0xFFFF){
    throw new Error('ZIP troppo grande per la lettura remota (zip64).');
  }

  // La central directory è quasi sempre già dentro la coda appena letta
  // (comment corto, come fanno tutti i tool comuni); solo se non basta la
  // richiediamo con un secondo Range mirato.
  let cdBuf;
  if(cdOffset >= base){
    cdBuf = tail.subarray(cdOffset - base, cdOffset - base + cdSize);
  } else {
    cdBuf = await driveRangeFetch(fileId, cdOffset, cdOffset + cdSize - 1);
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
  const names = entries.filter(en => isImageEntry(en.name)).sort((a, b) => naturalCompare(a.name, b.name));

  return {
    pages: names.map(en => ({ name: en.name, url: null, blob: null })),
    // Legge UNA tavola: un solo Range che copre generosamente l'header locale
    // (nome+extra raramente superano 512 byte) più i dati compressi. Se la
    // stima era corta (nome insolitamente lungo) rifà il fetch con la misura
    // esatta, ora nota. Poi decomprime (deflate) o restituisce diretto (stored).
    async getData(name){
      const en = byName.get(name);
      if(!en) return null;
      const OVERFETCH = 512;
      const guessEnd = Math.min(totalSize - 1, en.localOffset + 30 + OVERFETCH + en.compSize - 1);
      let raw = await driveRangeFetch(fileId, en.localOffset, guessEnd);
      const n2 = b2(raw, 26), m2 = b2(raw, 28);
      const dataStart = 30 + n2 + m2;
      const dataEnd = dataStart + en.compSize;
      if(dataEnd > raw.length){
        raw = await driveRangeFetch(fileId, en.localOffset, en.localOffset + dataEnd - 1);
      }
      const compData = raw.subarray(dataStart, dataEnd);
      if(en.method === 0) return compData.slice();
      if(en.method === 8) return inflateSync(compData, { out: new Uint8Array(en.uncompSize) });
      throw new Error('Compressione ZIP non supportata (metodo ' + en.method + ').');
    },
  };
}
