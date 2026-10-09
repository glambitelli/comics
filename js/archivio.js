// ── L'ARCHIVIO E' UN TERMINALE ──
// Il vestito e il perche' stanno in css/archivio.css. Qui c'e' solo quello che
// si muove: il tubo che si accende entrando, il tasto di accensione, il
// tremolio di tanto in tanto, lo schermo che "legge" la cartella aperta, e la
// riga di stato in fondo.
import { getRefs } from './refs.js';

const ridotto = ()=> window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let _montato = false;

export function montaArchivio(){
  const scr = document.getElementById('screen-refs');
  const mon = document.getElementById('arch-monitor');
  if(_montato || !scr || !mon) return;
  _montato = true;
  const led = document.getElementById('arch-led');
  const power = document.getElementById('arch-power');
  const lettura = document.getElementById('arch-lettura');
  const stato = document.getElementById('arch-stato');

  // ENTRANDO SI ACCENDE: una riga bianca al centro che si apre su tutto lo
  // schermo, come un CRT vero. Solo quando la schermata diventa attiva, non a
  // ogni ridisegno dell'elenco.
  const accendi = ()=>{
    if(ridotto()) return;
    mon.classList.remove('accensione'); void mon.offsetWidth;
    mon.classList.add('accensione');
    setTimeout(()=> mon.classList.remove('accensione'), 900);
  };
  let attiva = scr.classList.contains('active');
  new MutationObserver(()=>{
    const ora = scr.classList.contains('active');
    if(ora && !attiva && !mon.classList.contains('spento')) accendi();
    attiva = ora;
  }).observe(scr, { attributes:true, attributeFilter:['class'] });

  // IL TASTO DI ACCENSIONE sotto lo schermo: lo spegne chiudendolo in un punto,
  // e lo riaccende. La spia rossa va con lui.
  power.addEventListener('click', ()=>{
    if(mon.classList.contains('spento')){
      mon.classList.remove('spento');
      power.setAttribute('aria-label', 'Spegni il monitor');
      accendi();
    } else {
      power.setAttribute('aria-label', 'Accendi il monitor');
      if(ridotto()){ mon.classList.add('spento'); return; }
      mon.classList.add('spegnimento');
      setTimeout(()=>{ mon.classList.remove('spegnimento'); mon.classList.add('spento'); }, 420);
    }
  });

  // IL TREMOLIO: ogni tanto, fra 6 e 16 secondi a caso, l'immagine trema per
  // un attimo. Era uno degli effetti del "tubo"; gli altri (griglia dei
  // fosfori, colori sfasati, curvatura) erano troppo, e sono stati tolti.
  (function prossimo(){
    setTimeout(()=>{
      if(!ridotto() && scr.classList.contains('active') && !mon.classList.contains('spento') && !document.hidden){
        mon.classList.add('sfarfallio');
        setTimeout(()=> mon.classList.remove('sfarfallio'), 170);
      }
      prossimo();
    }, 6000 + Math.random() * 10000);
  })();

  // APRENDO UNA CARTELLA lo schermo si svuota per meno di un secondo e scrive
  // il nome e "Lettura in corso.....", con la spia che lampeggia come un disco
  // che lavora. Giovanni ha preferito questo a un riquadro d'avviso. La
  // cartella intanto si apre davvero, sotto: questo non ritarda niente e non
  // prende i tocchi.
  let timer = 0;
  const leggi = nome=>{
    if(ridotto() || !lettura) return;
    clearInterval(timer);
    let p = 0;
    const scrivi = ()=>{
      lettura.textContent = `${nome.toUpperCase()}\nArchivio visivo.\n\nLettura in corso${'.'.repeat(Math.min(p, 5))}${p % 2 ? '_' : ' '}`;
    };
    scrivi(); lettura.hidden = false; led && led.classList.add('arch-lavora');
    timer = setInterval(()=>{
      p++; scrivi();
      if(p >= 8){
        clearInterval(timer);
        setTimeout(()=>{ lettura.hidden = true; led && led.classList.remove('arch-lavora'); }, 250);
      }
    }, 90);
  };
  const browser = document.getElementById('refs-folder-browser');
  if(browser) browser.addEventListener('click', e=>{
    const riga = e.target.closest('.refs-folder-row');
    if(!riga || e.target.closest('.refs-spunta')) return;
    // mentre si sceglie, un tocco aggiunge alla scelta: niente "lettura"
    const assi = document.getElementById('refs-axis');
    if(assi && assi.classList.contains('coperto')) return;
    // cognome e nome stanno in due span: si uniscono con uno spazio, se no
    // "Breccia" e "Alberto" diventavano "BRECCIAALBERTO"
    const nomeEl = riga.querySelector('.refs-folder-name') || riga;
    const parti = [...nomeEl.querySelectorAll('span')].map(x=> x.textContent.trim()).filter(Boolean);
    const nome = (parti.length ? parti.join(' ') : nomeEl.textContent).replace(/\s+/g, ' ').trim();
    if(nome) leggi(nome);
  }, true);

  // LA RIGA DI STATO, come in fondo al CMOS Setup: quante cartelle si vedono e
  // quante immagini ci sono in tutto; dentro una cartella, quante ne contiene.
  const aggiorna = ()=>{
    if(!stato) return;
    const galleria = document.getElementById('refs-gallery-view');
    const dentro = galleria && galleria.style.display !== 'none';
    if(dentro){
      const n = document.querySelectorAll('#refs-grid .refs-thumb').length;
      stato.textContent = n ? `${n} ${n === 1 ? 'immagine' : 'immagini'}...` : '';
    } else {
      const c = document.querySelectorAll('#refs-folder-browser .refs-folder-row[data-folder-id]').length;
      let tot = 0; try{ tot = getRefs().length; }catch(e){}
      stato.textContent = c ? `${c} ${c === 1 ? 'cartella' : 'cartelle'}, ${tot} immagini...` : '';
    }
  };
  let attesa = 0;
  const presto = ()=>{ clearTimeout(attesa); attesa = setTimeout(aggiorna, 60); };
  const crt = document.getElementById('arch-crt');
  if(crt) new MutationObserver(presto).observe(crt, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
  aggiorna();
}
