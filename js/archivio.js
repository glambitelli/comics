// ── L'ARCHIVIO E' UN TERMINALE ──
// Il vestito e il perche' stanno in css/archivio.css. Qui c'e' solo quello che
// si muove: il tubo che si accende entrando, il tasto di accensione, il
// tremolio di tanto in tanto, lo schermo che "legge" la cartella aperta, e la
// riga di stato in fondo.
import { getRefs } from './refs.js';
import { suonaRumore, preparaRumori } from './sound.js';

// I RUMORI DEL COMPUTER (10 ottobre 2026), tagliati da due registrazioni
// mandate da Giovanni:
//   accendi / spegni — lo scatto e il fischio di un televisore CRT (da 2,03 e
//                      da 3,63 secondi), col fruscio di fondo attenuato;
//   boot             — i primi 4,6 secondi dell'avvio di un PC anni '90:
//                      la ventola che parte e il beep del BIOS;
//   disco            — un secondo dello stesso file, dove il disco fisso
//                      lavora: e' il rumore della "Lettura in corso".
// I tocchi sulle voci restano i suoni dei menu di Resident Evil di tutta
// l'app (sound.js): qui suona solo la macchina.
// A VOLUME PIENO, e tagliati sotto i 200 Hz. La prima versione suonava a
// meta' volume ed era 15 dB sotto i suoni del menu: sul telefono di Giovanni
// "non sento i suoni nuovi". In piu' quasi tutta l'energia stava nei bassi
// (ventola, ronzio del tubo) che l'altoparlante di un telefono non rende:
// tolti quelli, compressi e alzati, si sentono lo scatto, il beep e il disco.
const RUMORI = {
  accendi: './sfx/monitor/accendi.mp3',
  spegni:  './sfx/monitor/spegni.mp3',
  boot:    './sfx/monitor/boot.mp3',
  disco:   './sfx/monitor/disco.mp3',
};

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

  window.addEventListener('pointerdown', ()=> preparaRumori(Object.values(RUMORI)), { once:true, passive:true });

  // L'AVVIO: la prima volta che si entra nell'archivio, e ogni volta che lo si
  // riaccende col tasto, lo schermo fa un avvio da PC vero, rapido: tre
  // secondi di righe del BIOS col beep e la ventola, poi l'elenco. Le volte
  // dopo, entrando, solo lo scatto del tubo: un avvio a ogni ingresso
  // stancherebbe alla terza volta. Non prende i tocchi: chi ha fretta tocca
  // gia' l'elenco sotto.
  const crt = document.getElementById('arch-crt');
  const boot = document.createElement('div');
  boot.className = 'arch-boot'; boot.hidden = true; boot.setAttribute('aria-hidden', 'true');
  crt && crt.appendChild(boot);
  const RIGHE = [
    'Inkflow BIOS v1.0',
    '(C) 1998 Inkflow Data Systems',
    '',
    'Memoria ........ 640K OK',
    'Disco fisso .... C: OK',
    '',
    "Avvio dell'archivio visivo...",
  ];
  let _avviato = false, _bootTimer = 0;
  const avvia = ()=>{
    _avviato = true;
    clearInterval(_bootTimer);
    let n = 0;
    boot.textContent = ''; boot.hidden = false;
    setTimeout(()=> suonaRumore(RUMORI.boot, 1), 350);
    _bootTimer = setInterval(()=>{
      n++;
      boot.textContent = RIGHE.slice(0, n).join('\n') + (n % 2 ? '_' : '');
      if(n > RIGHE.length + 3){ clearInterval(_bootTimer); boot.hidden = true; }
    }, 320);
  };

  // ENTRANDO SI ACCENDE: una riga bianca al centro che si apre su tutto lo
  // schermo, come un CRT vero, con lo scatto e il fischio del tubo. Solo
  // quando la schermata diventa attiva, non a ogni ridisegno dell'elenco.
  const accendi = (conAvvio)=>{
    suonaRumore(RUMORI.accendi, 1);
    if(conAvvio && !ridotto()) avvia();
    if(ridotto()) return;
    mon.classList.remove('accensione'); void mon.offsetWidth;
    mon.classList.add('accensione');
    setTimeout(()=> mon.classList.remove('accensione'), 900);
  };
  let attiva = scr.classList.contains('active');
  new MutationObserver(()=>{
    const ora = scr.classList.contains('active');
    if(ora && !attiva && !mon.classList.contains('spento')) accendi(!_avviato);
    attiva = ora;
  }).observe(scr, { attributes:true, attributeFilter:['class'] });

  // IL TASTO DI ACCENSIONE sotto lo schermo: lo spegne chiudendolo in un punto,
  // e lo riaccende con l'avvio. La spia rossa va con lui.
  power.addEventListener('click', ()=>{
    if(mon.classList.contains('spento')){
      mon.classList.remove('spento');
      power.setAttribute('aria-label', 'Spegni il monitor');
      accendi(true);
    } else {
      power.setAttribute('aria-label', 'Accendi il monitor');
      suonaRumore(RUMORI.spegni, 1);
      clearInterval(_bootTimer); boot.hidden = true;
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
    // un attimo dopo il tocco: prima il tic del menu di Resident Evil, poi il
    // disco che lavora (suonati insieme, il secondo zittiva il primo)
    setTimeout(()=> suonaRumore(RUMORI.disco, .8), 140);
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
  if(crt) new MutationObserver(presto).observe(crt, { childList:true, subtree:true, attributes:true, attributeFilter:['style'] });
  aggiorna();
}
