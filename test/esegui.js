// Esegue tutte le suite di test/suite, una dopo l'altra.
//
//   npm test                     → tutte
//   node test/esegui.js lettore  → solo quelle il cui nome file contiene "lettore"
//
// Perché in sequenza e non in parallelo: ogni suite apre un Chromium vero con
// un albo di prova dentro, e su una macchina piccola due Chromium insieme si
// rubano la CPU abbastanza da falsare le prove che misurano il TEMPO (il
// ritaglio, la fluidità dello sfoglio). Il totale è di pochi minuti: non vale
// la pena renderlo instabile per guadagnarne uno.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, 'suite');
const FIXTURES = path.join(__dirname, 'fixtures');

// Gli albi .cbz sono binari e si ricostruiscono in un istante: fuori dal
// repository, rigenerati qui se mancano (checkout pulito, macchina nuova).
function assicuraAlbi(){
  const attesi = ['pagine.cbz', 'tavole.cbz', 'alta.cbz', 'pesante.cbz'];
  if(attesi.every(f => fs.existsSync(path.join(FIXTURES, f)))) return;
  console.log('Mancano gli albi di prova, li rigenero.');
  execFileSync(process.execPath, [path.join(__dirname, 'crea-albi.js')], { stdio: 'inherit' });
}

(async ()=>{
  assicuraAlbi();

  const filtro = process.argv[2];
  const file = fs.readdirSync(DIR).filter(f => f.endsWith('.js'))
    .filter(f => !filtro || f.includes(filtro)).sort();
  if(!file.length){
    console.log('Nessuna suite corrisponde a "' + filtro + '".');
    process.exit(1);
  }

  const esiti = [];
  for(const f of file){
    const esegui = require(path.join(DIR, f));
    esiti.push(await esegui());
  }

  const passati = esiti.reduce((n, e) => n + e.passati, 0);
  const falliti = esiti.reduce((n, e) => n + e.falliti, 0);
  console.log('\n\x1b[1m─────────────────────────────────────────\x1b[0m');
  for(const e of esiti){
    const segno = e.falliti ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
    console.log('  ' + segno + ' ' + e.nome + '  —  ' + e.passati + ' ok'
      + (e.falliti ? ', \x1b[31m' + e.falliti + ' falliti\x1b[0m' : ''));
    // Sotto la riga della suite, cosa e' caduto: il riassunto deve bastare a
    // capire, senza risalire il log.
    for(const c of (e.caduti || [])) console.log('      \x1b[31m✗\x1b[0m ' + c);
  }
  console.log('\n  ' + passati + ' controlli superati'
    + (falliti ? ', \x1b[31m' + falliti + ' falliti\x1b[0m' : '') + '\n');
  process.exit(falliti ? 1 : 0);
})();
