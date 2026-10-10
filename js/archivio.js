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
//   boot             — l'avvio di un PC anni '90 fino al beep del BIOS
//                      (da 0,1 a 3,95 secondi): la ventola che parte e il
//                      beep, e li' finisce;
// I tocchi sulle voci restano i suoni dei menu di Resident Evil di tutta
// l'app (sound.js): qui suona solo la macchina.
// A VOLUME PIENO, e tagliati sotto i 200 Hz. La prima versione suonava a
// meta' volume ed era 15 dB sotto i suoni del menu: sul telefono di Giovanni
// "non sento i suoni nuovi". In piu' quasi tutta l'energia stava nei bassi
// (ventola, ronzio del tubo) che l'altoparlante di un telefono non rende:
// tolti quelli, compressi e alzati, si sentono lo scatto e il beep.
// IL GERMANO DI INKFLOW (10 ottobre 2026): il logo, un'anatra in pixel art
// azzurra nello stile del Pip-Boy, che cammina sotto le righe dell'avvio.
// Quattro passi, disegnati a parte e scelti da Giovanni fra una decina di
// prove; qui c'e' il risultato pixel per pixel: a contorno acceso, m tono
// medio (testa e collo), s spento (corpo), o l'occhio (un buco nello schermo,
// sempre nello stesso punto della testa: quando si spostava per conto suo
// "faceva venire mal di testa").
const ANATRA = [
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
const ANATRA_TONI = { a:'#5ff4ff', m:'#2bb6d6', s:'#126d8c' };
const ANATRA_PASSO = 167;   // ms per passo: sei al secondo, come nella prova scelta

const RUMORI = {
  accendi: './sfx/monitor/accendi.mp3',
  spegni:  './sfx/monitor/spegni.mp3',
  boot:    './sfx/monitor/boot.mp3',
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

  // L'AVVIO. Il computer e' SPENTO quando si apre Inkflow (Giovanni, 10
  // ottobre 2026: "aprendo da zero il computer deve risultare spento, poi lo
  // accendo e mi fa il boot"). Si accende col tasto tondo — o toccando lo
  // schermo nero, che col dito e' un bersaglio molto piu' grande — e fa un
  // avvio da PC vero, rapido: righe del BIOS, la ventola e il beep, tre
  // secondi. Non prende i tocchi: chi ha fretta tocca gia' l'elenco sotto.
  const crt = document.getElementById('arch-crt');
  const boot = document.createElement('div');
  boot.className = 'arch-boot'; boot.hidden = true; boot.setAttribute('aria-hidden', 'true');
  const bootTesto = document.createElement('div');
  const anatra = document.createElement('canvas');
  anatra.className = 'arch-anatra';
  anatra.width = ANATRA[0][0].length; anatra.height = ANATRA[0].length;
  anatra.style.setProperty('--aw', anatra.width + 'px');
  boot.append(bootTesto, anatra);
  crt && crt.appendChild(boot);
  const ga = anatra.getContext('2d');
  const disegnaAnatra = i=>{
    ga.clearRect(0, 0, anatra.width, anatra.height);
    ANATRA[i % ANATRA.length].forEach((r, y)=>{ for(let x = 0; x < r.length; x++){
      const c = r[x]; if(c === '.' || c === 'o') continue;
      ga.fillStyle = ANATRA_TONI[c]; ga.fillRect(x, y, 1, 1);
    } });
  };
  let _passi = 0;
  const RIGHE = [
    'Inkflow BIOS v1.0',
    '(C) 1998 Inkflow Data Systems',
    '',
    'Memoria ........ 640K OK',
    'Disco fisso .... C: OK',
    '',
    "Avvio dell'archivio visivo...",
  ];
  let _bootTimer = 0;
  // IL MENU COMPARE SUL BEEP. Il beep del BIOS sta a 3,62 secondi dall'inizio
  // di boot.mp3, e il suono parte 350 ms dopo lo scatto del tubo: l'elenco
  // arriva quindi a 3,97 secondi, nell'istante del beep, non prima (Giovanni:
  // "non fa niente che perdo qualche secondino"). Fino a li' le righe del BIOS
  // e il cursore che lampeggia. Il suono finisce subito dopo il beep, senza la
  // lunga sfumatura che c'era prima.
  const SUONO_DOPO = 350, BEEP = 3620;
  let _bootFine = 0;
  const avvia = ()=>{
    clearInterval(_bootTimer); clearTimeout(_bootFine);
    let n = 0;
    bootTesto.textContent = ''; boot.hidden = false;
    // il germano cammina sotto le righe finche' l'avvio dura
    clearInterval(_passi); let passo = 0; disegnaAnatra(0);
    _passi = setInterval(()=> disegnaAnatra(++passo), ANATRA_PASSO);
    setTimeout(()=> suonaRumore(RUMORI.boot, 1), SUONO_DOPO);
    _bootTimer = setInterval(()=>{
      n++;
      bootTesto.textContent = RIGHE.slice(0, Math.min(n, RIGHE.length)).join('\n') + (n % 2 ? '_' : '');
    }, 320);
    _bootFine = setTimeout(()=>{ clearInterval(_bootTimer); clearInterval(_passi); boot.hidden = true; }, SUONO_DOPO + BEEP);
  };

  // L'ACCENSIONE: una riga bianca al centro che si apre su tutto lo schermo,
  // come un CRT vero, con lo scatto del tubo e poi l'avvio.
  // E POI RESTA ACCESO. Prima si riaccendeva (riga bianca e scatto) a ogni
  // ingresso nell'archivio; ma un computer vero, se vai in un'altra stanza e
  // torni, lo ritrovi acceso com'era. Ora cambiare sezione non lo tocca: si
  // spegne solo col tasto.
  const accendi = ()=>{
    suonaRumore(RUMORI.accendi, 1);
    if(ridotto()) return;
    avvia();
    mon.classList.remove('accensione'); void mon.offsetWidth;
    mon.classList.add('accensione');
    setTimeout(()=> mon.classList.remove('accensione'), 900);
  };
  const accendiDaSpento = ()=>{
    if(!mon.classList.contains('spento')) return;
    mon.classList.remove('spento');
    power.setAttribute('aria-label', 'Spegni il monitor');
    accendi();
  };
  if(crt) crt.addEventListener('click', accendiDaSpento);

  // IL TASTO DI ACCENSIONE sotto lo schermo: lo spegne chiudendolo in un punto,
  // e lo riaccende con l'avvio. La spia rossa va con lui.
  power.addEventListener('click', ()=>{
    if(mon.classList.contains('spento')){
      accendiDaSpento();
    } else {
      power.setAttribute('aria-label', 'Accendi il monitor');
      suonaRumore(RUMORI.spegni, 1);
      clearInterval(_bootTimer); clearTimeout(_bootFine); clearInterval(_passi); boot.hidden = true;
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
    // Nessun rumore suo: c'era il disco fisso che lavora, preso dall'avvio del
    // PC, e Giovanni l'ha trovato "terrificante" (10 ottobre 2026). Resta il
    // suono del menu di Resident Evil che fa ogni tocco (sound.js).
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
