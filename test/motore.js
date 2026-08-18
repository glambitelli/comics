// Il poco che serve a ogni suite: un server statico sulla radice del progetto,
// un browser, e il conteggio dei controlli.
//
// Il server serve il REPOSITORY COSÌ COM'È: le suite caricano js/albums.js,
// css/refs.css e index.html veri. Le dipendenze che parlerebbero con la rete
// vengono sostituite dalle mappe di import dentro test/banco/*.html, non da
// una copia del codice — una copia invecchierebbe da sola e le prove
// continuerebbero a passare su qualcosa che non esiste più.
const http = require('http');
const fs = require('fs');
const path = require('path');

const RADICE = path.join(__dirname, '..');
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json',
  '.cbz':'application/zip', '.wav':'audio/wav', '.png':'image/png', '.wasm':'application/wasm',
};

// Chromium sta dove l'ha messo Playwright. Se un giorno cambia versione,
// questo è l'unico punto da toccare.
function chromePath(){
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try{
    const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if(dir) return path.join(base, dir, 'chrome-linux', 'chrome');
  }catch(e){}
  return undefined;   // lascia decidere Playwright
}

function avviaServer(){
  return new Promise(res=>{
    const s = http.createServer((req, r)=>{
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const p = path.join(RADICE, rel);
      // Nessuna via d'uscita dalla radice del progetto.
      if(!p.startsWith(RADICE)){ r.writeHead(403); r.end(); return; }
      fs.readFile(p, (e, d)=>{
        if(e){ r.writeHead(404); r.end('non trovato: ' + rel); return; }
        r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
        r.end(d);
      });
    }).listen(0, ()=> res({ server: s, base: 'http://127.0.0.1:' + s.address().port }));
  });
}

// Playwright può stare fra le dipendenze del progetto (npm install) oppure
// essere già installato globalmente sulla macchina, com'è nell'ambiente in cui
// giravano le prime prove. Node non guarda da solo nella cartella globale,
// quindi glielo si dice qui: senza questo, `npm test` su una macchina che ha
// già playwright fallirebbe con "Cannot find module" pur avendolo.
function richiediPlaywright(){
  try{ return require('playwright'); }catch(e){}
  try{
    const radice = require('child_process')
      .execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim();
    return require(path.join(radice, 'playwright'));
  }catch(e){}
  throw new Error('playwright non trovato: `npm install` nella radice del progetto');
}

// Ogni suite esporta { nome, esegui(ctx) } e riceve qui dentro tutto il resto.
async function suite(nome, opzioni, corpo){
  const { chromium } = richiediPlaywright();
  const { server, base } = await avviaServer();
  const browser = await chromium.launch({ executablePath: chromePath(), args: opzioni.args || [] });
  const page = await browser.newPage({
    viewport: opzioni.viewport || { width: 412, height: 915 },
    hasTouch: true,
    deviceScaleFactor: opzioni.dpr || 1,
    // IL SERVICE WORKER SI PUO' SPEGNERE, e a volte va spento.
    //
    // Le richieste che partono DAL service worker non passano dalle
    // intercettazioni della prova (page.route): sono un'altra cosa, e
    // Playwright non le vede. Finche' i moduli si caricano all'avvio va tutto
    // bene, perche' il service worker non ha ancora preso in carico la pagina;
    // ma un modulo importato DOPO — l'accesso, che si carica al primo tocco su
    // "Entra" — passa da lui, e l'SDK finto non gli arriva mai: la prova
    // falliva con "Failed to fetch dynamically imported module" su un file che
    // esiste ed e' li'. Chi non sta provando la cache lo spegne e amen; chi
    // invece prova proprio quello (versione.js) se lo tiene.
    serviceWorkers: opzioni.senzaServiceWorker ? 'block' : 'allow',
  });
  let passati = 0, falliti = 0;
  // I nomi di quello che e' caduto: servono al riassunto finale. Sulla
  // macchina che pubblica il log e' lungo millecinquecento righe, e cercare la
  // riga con la ✗ scorrendo a mano e' esattamente il genere di lavoro che una
  // prova dovrebbe risparmiare.
  const caduti = [];
  const ok = (nome, cond, extra)=>{
    if(cond){ passati++; console.log('  ✓ ' + nome); }
    else {
      falliti++;
      caduti.push(nome + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
      console.log('  ✗ ' + nome + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : ''));
    }
  };
  page.on('pageerror', e=>{
    console.log('  !! errore di pagina: ' + e.message);
    caduti.push('errore di pagina: ' + e.message);
    falliti++;
  });
  console.log('\n\x1b[1m' + nome + '\x1b[0m');
  try{
    // `prima` serve alle suite che aprono l'APP VERA invece di un banco: e'
    // l'unico momento in cui si possono intercettare le richieste (l'SDK di
    // Firebase, i caratteri) prima che la pagina parta.
    if(opzioni.prima) await opzioni.prima(page);
    await page.goto(base + opzioni.banco);
    // I banchi alzano window.__ready quando hanno finito di montarsi; l'app
    // vera no, e dice di essere pronta in un altro modo (vedi `pronto`).
    await page.waitForFunction(opzioni.pronto || (()=> window.__ready === true), { timeout: 15000 });
    await corpo({ page, base, ok, sezione: t => console.log('\n  ── ' + t + ' ──') });
  }catch(e){
    falliti++;
    console.log('  ✗ la suite si è interrotta: ' + e.message);
  }finally{
    await browser.close();
    server.close();
  }
  return { nome, passati, falliti, caduti };
}

module.exports = { suite };
