// Chi tocca CSS o JS deve alzare il numero di cache. Punto.
//
// PERCHÉ ESISTE QUESTO CONTROLLO. Il service worker serve i file dalla
// dispensa che porta il nome scritto in sw.js (`inkflow-static-vNNN`). Se il
// nome non cambia, il telefono continua a servire i file di ieri: si pubblica,
// si guarda, "non è cambiato niente", e si passa mezz'ora a cercare un bug che
// non c'è. È successo davvero, più di una volta, e la cura è sempre stata la
// stessa: ricordarselo. Ricordarselo non è un metodo — questo sì.
//
// Gira nella pubblicazione (vedi pages.yml) e confronta il commit che si sta
// pubblicando con quello di prima. Se fra i file toccati c'è roba che il
// service worker mette in cache, e il numero è rimasto uguale, la
// pubblicazione si ferma qui.
const { execFileSync } = require('child_process');

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

// Quello che il service worker tiene in cache e che quindi va invalidato.
const CONTA = /^(css\/|js\/|index\.html|share-target\.html|manifest\.json)/;

const prima = process.argv[2];
const adesso = process.argv[3] || 'HEAD';

// Primo commit di un ramo, push forzato, storia non disponibile: non c'è niente
// da confrontare, e bloccare sarebbe peggio che lasciar passare.
if(!prima || /^0+$/.test(prima)){
  console.log('Nessun commit precedente con cui confrontare: controllo saltato.');
  process.exit(0);
}

let toccati;
try{
  toccati = git('diff', '--name-only', prima, adesso).split('\n').filter(Boolean);
}catch(e){
  console.log('Storia non disponibile (' + e.message.split('\n')[0] + '): controllo saltato.');
  process.exit(0);
}

const daCache = toccati.filter(f => CONTA.test(f));
if(!daCache.length){
  console.log('Nessun file servito dal service worker è cambiato: niente da alzare.');
  process.exit(0);
}

const versione = (sha)=>{
  const testo = git('show', sha + ':sw.js');
  const m = testo.match(/inkflow-static-(v\d+)/);
  return m ? m[1] : null;
};

const vPrima = versione(prima);
const vAdesso = versione(adesso);

console.log('File in cache modificati:\n  ' + daCache.join('\n  '));
console.log('Versione della cache: ' + vPrima + ' → ' + vAdesso);

if(vPrima && vAdesso && vPrima === vAdesso){
  console.error('::error file=sw.js::Hai toccato ' + daCache.length + ' file che il service worker' +
    ' tiene in cache, ma CACHE è rimasta ' + vAdesso + '. Alzala in sw.js, se no il telefono' +
    ' continuerà a servire i file vecchi e sembrerà che la modifica non sia mai arrivata.');
  process.exit(1);
}

console.log('✓ La versione è stata alzata.');
