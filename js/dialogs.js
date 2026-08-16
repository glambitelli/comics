// ── DIALOGHI GENERICI IN-APP ──
// Sostituiscono window.prompt/window.confirm (finestre di sistema brutte e
// fuori palette) con modali coerenti col resto di Inkflow. Creati una sola
// volta e riusati; risolvono una Promise, si usano con await esattamente
// come le controparti native.

let _promptOverlay, _promptInput, _promptTitle, _promptOkBtn, _promptResolve;
function ensurePromptModal(){
  if(_promptOverlay) return;
  _promptOverlay = document.createElement('div');
  _promptOverlay.className = 'modal-overlay';
  _promptOverlay.innerHTML = `
    <div class="modal">
      <div class="modal-handle"></div>
      <div class="modal-head"><h3 id="ink-prompt-title">Titolo</h3></div>
      <div style="padding:0 22px">
        <input id="ink-prompt-input" class="field-input" type="text" maxlength="60"/>
      </div>
      <div class="modal-actions" style="padding:0 22px 0">
        <button class="btn-cancel" id="ink-prompt-cancel">Annulla</button>
        <button class="btn-create" id="ink-prompt-ok">Ok</button>
      </div>
    </div>`;
  document.body.appendChild(_promptOverlay);
  _promptTitle = _promptOverlay.querySelector('#ink-prompt-title');
  _promptInput = _promptOverlay.querySelector('#ink-prompt-input');
  _promptOkBtn = _promptOverlay.querySelector('#ink-prompt-ok');
  const cancelBtn = _promptOverlay.querySelector('#ink-prompt-cancel');
  const finish = (val)=>{
    _promptOverlay.classList.remove('open');
    document.body.style.overflow='';
    if(_promptResolve){ const r=_promptResolve; _promptResolve=null; r(val); }
  };
  _promptOkBtn.onclick = ()=> finish(_promptInput.value.trim() || null);
  cancelBtn.onclick = ()=> finish(null);
  _promptInput.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ e.preventDefault(); finish(_promptInput.value.trim() || null); }
    else if(e.key==='Escape'){ finish(null); }
  });
  _promptOverlay.addEventListener('click', e=>{ if(e.target===_promptOverlay) finish(null); });
}

// Sostituto di window.prompt(title, defaultValue) → Promise<string|null>
export function promptModal(title, defaultValue='', placeholder=''){
  ensurePromptModal();
  _promptTitle.textContent = title;
  _promptInput.value = defaultValue || '';
  _promptInput.placeholder = placeholder || '';
  _promptOkBtn.textContent = 'Ok';
  _promptOverlay.classList.add('open');
  document.body.style.overflow='hidden';
  setTimeout(()=>{ _promptInput.focus(); _promptInput.select(); }, 60);
  return new Promise(resolve=>{ _promptResolve = resolve; });
}

// ── MODALE A PIU' CAMPI ──
// Il promptModal qui sopra fa una domanda sola, e per un artista ne servono
// due: cognome e nome vanno tenuti separati, altrimenti l'app non sa piu' dove
// finisce l'uno e comincia l'altro e non puo' comporli come si deve (vedi
// nomeCartella in refs.js). Costruito ogni volta invece di riusato: i campi
// cambiano di numero e di etichetta, e un modale riciclato andrebbe comunque
// svuotato e ricostruito dentro.
//
// campi: [{ etichetta, valore?, placeholder?, maiuscolo? }]
// Risolve con un array di stringhe nello stesso ordine, oppure null.
export function promptCampi(titolo, campi, okLabel='Aggiungi'){
  return new Promise(resolve=>{
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${titolo}</h3></div>
        <div class="modal-body">
          ${campi.map((c,i)=>`
            <div class="field-label">${c.etichetta}</div>
            <input class="field-input${c.maiuscolo ? ' maiuscolo' : ''}" data-i="${i}"
                   type="text" maxlength="60" autocomplete="off"
                   placeholder="${c.placeholder||''}" value="${(c.valore||'').replace(/"/g,'&quot;')}"/>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn-cancel">Annulla</button>
          <button class="btn-create">${okLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    const inputs = Array.from(ov.querySelectorAll('.field-input'));
    const chiudi = (val)=>{
      ov.classList.remove('open');
      document.body.style.overflow = '';
      ov.remove();
      resolve(val);
    };
    const conferma = ()=>{
      const v = inputs.map(i=> i.value.trim());
      // Il primo campo e' quello obbligatorio: senza, non c'e' niente da
      // creare. Gli altri possono restare vuoti (un artista di cui si conosce
      // solo il cognome resta un artista).
      if(!v[0]) { inputs[0].focus(); return; }
      chiudi(v);
    };
    ov.querySelector('.btn-create').onclick = conferma;
    ov.querySelector('.btn-cancel').onclick = ()=> chiudi(null);
    ov.addEventListener('click', e=>{ if(e.target === ov) chiudi(null); });
    inputs.forEach((inp, i)=>{
      inp.addEventListener('keydown', e=>{
        if(e.key === 'Escape'){ chiudi(null); return; }
        if(e.key !== 'Enter') return;
        e.preventDefault();
        // Invio scende al campo dopo, e sull'ultimo conferma: e' quello che si
        // aspetta chiunque abbia mai compilato due caselle di fila.
        if(i < inputs.length - 1) inputs[i+1].focus(); else conferma();
      });
    });
    ov.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(()=>{ inputs[0].focus(); inputs[0].select(); }, 60);
  });
}

let _confirmOverlay, _confirmTitle, _confirmMsg, _confirmOkBtn, _confirmResolve;
function ensureConfirmModal(){
  if(_confirmOverlay) return;
  _confirmOverlay = document.createElement('div');
  _confirmOverlay.className = 'modal-overlay';
  _confirmOverlay.innerHTML = `
    <div class="confirm-modal">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <h3 id="ink-confirm-title"></h3>
        <p id="ink-confirm-msg"></p>
      </div>
      <div class="modal-actions" style="padding:0 22px 0">
        <button class="btn-cancel" id="ink-confirm-cancel">Annulla</button>
        <button class="btn-danger" id="ink-confirm-ok">Conferma</button>
      </div>
      <div style="height:18px"></div>
    </div>`;
  document.body.appendChild(_confirmOverlay);
  _confirmTitle = _confirmOverlay.querySelector('#ink-confirm-title');
  _confirmMsg = _confirmOverlay.querySelector('#ink-confirm-msg');
  _confirmOkBtn = _confirmOverlay.querySelector('#ink-confirm-ok');
  const cancelBtn = _confirmOverlay.querySelector('#ink-confirm-cancel');
  const finish = (val)=>{
    _confirmOverlay.classList.remove('open');
    document.body.style.overflow='';
    if(_confirmResolve){ const r=_confirmResolve; _confirmResolve=null; r(val); }
  };
  _confirmOkBtn.onclick = ()=> finish(true);
  cancelBtn.onclick = ()=> finish(false);
  _confirmOverlay.addEventListener('click', e=>{ if(e.target===_confirmOverlay) finish(false); });
}

// Sostituto di window.confirm(message) → Promise<boolean>. options: {title, confirmLabel}
export function confirmModal(message, options={}){
  ensureConfirmModal();
  _confirmTitle.textContent = options.title || 'Conferma';
  _confirmMsg.textContent = message;
  _confirmOkBtn.textContent = options.confirmLabel || 'Conferma';
  _confirmOverlay.classList.add('open');
  document.body.style.overflow='hidden';
  return new Promise(resolve=>{ _confirmResolve = resolve; });
}

// ── ICONE DEI MENU ──
// Stesso tratto di tutte le altre icone dell'app (1,7px, estremita' tonde):
// un menu di sole parole allineate a sinistra sembra un elenco di sistema, non
// una cosa costruita. L'icona la si legge prima della parola e permette anche
// di accorciare le etichette senza renderle ambigue — "Sposta" accanto a una
// cartella non ha bisogno di dire "in cartella".
const G = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';
export const ICONE = {
  progetto:  `<path d="M9.5 14.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" ${G}/><path d="M14.5 9.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" ${G}/>`,
  cartella:  `<path d="M3.5 6.8A1.3 1.3 0 0 1 4.8 5.5h4.4l1.8 1.8h7.2a1.3 1.3 0 0 1 1.3 1.3v8.6a1.3 1.3 0 0 1-1.3 1.3H4.8a1.3 1.3 0 0 1-1.3-1.3Z" ${G}/>`,
  tavola:    `<rect x="5" y="3.5" width="14" height="17" rx="1.6" ${G}/><path d="M8 8h8M8 12h8M8 16h4" ${G}/>`,
  ritaglio:  `<path d="M8 3v13a2 2 0 0 0 2 2h11" ${G}/><path d="M3 8h13a2 2 0 0 1 2 2v11" ${G}/>`,
  rinomina:  `<path d="M4 20h16" ${G}/><path d="M15.5 5.2a1.9 1.9 0 0 1 2.7 2.7L9.6 16.5l-3.6.9.9-3.6Z" ${G}/>`,
  elimina:   `<path d="M4.5 6.5h15" ${G}/><path d="M9.5 6.5V5a1.2 1.2 0 0 1 1.2-1.2h2.6A1.2 1.2 0 0 1 14.5 5v1.5" ${G}/><path d="M6.8 6.5 7.6 19a1.4 1.4 0 0 0 1.4 1.3h6a1.4 1.4 0 0 0 1.4-1.3l.8-12.5" ${G}/>`,
};

// Menu contestuale ancorato all'elemento toccato. Ogni voce e' {label, icon?,
// danger?, onSelect}.
let _actionMenuEl;
export function actionMenu(anchorEl, actions){
  closeActionMenu();
  _actionMenuEl = document.createElement('div');
  _actionMenuEl.className = 'ink-action-menu';
  // Le voci distruttive si staccano dalle altre con un filo, invece di essere
  // una riga uguale alle altre col testo rosso: "Elimina" e "Rinomina" non
  // sono due scelte dello stesso peso, e messe in fila lo sembravano.
  // Fuori schermo finche' non si sa dove va: l'altezza si puo' misurare solo
  // dopo averlo messo nel documento, e un menu appoggiato per un fotogramma in
  // fondo alla pagina prima di saltare al suo posto e' l'altra meta' del
  // lampeggio.
  _actionMenuEl.style.top = '-9999px';
  _actionMenuEl.innerHTML = actions.map((a,i)=>{
    const ico = a.icon && ICONE[a.icon]
      ? `<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">${ICONE[a.icon]}</svg>`
      : '';
    const stacca = a.danger && i > 0 && !actions[i-1].danger ? ' stacca' : '';
    return `<button data-i="${i}" class="${a.danger?'danger':''}${stacca}">${ico}<span>${a.label}</span></button>`;
  }).join('');
  document.body.appendChild(_actionMenuEl);
  const r = anchorEl.getBoundingClientRect();
  const isTouch = document.body.classList.contains('is-touch');
  // 236 e non 280: con le icone e le etichette accorciate il menu non ha piu'
  // bisogno di tutta quella larghezza, e uno stretto sembra un oggetto mentre
  // uno che arriva quasi da bordo a bordo sembra un pannello di sistema.
  const mw = isTouch ? Math.min(236, window.innerWidth - 32) : 190;
  let left = r.right - mw;
  if(left < 8) left = 8;
  if(left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  _actionMenuEl.style.left = left+'px';
  _actionMenuEl.style.width = mw+'px';
  // Sotto se c'è spazio, altrimenti SOPRA: ancorato a un pulsante in fondo
  // allo schermo (il "⋯" della galleria, le pastiglie del ritaglio) il menu
  // finiva sotto il bordo inferiore, di fatto irraggiungibile. L'altezza si
  // misura ora che è già nel documento.
  const mh = _actionMenuEl.offsetHeight;
  let top = r.bottom + 6;
  if(top + mh > window.innerHeight - 8){
    top = Math.max(8, r.top - mh - 6);
    // Ribaltato sopra, deve crescere dal basso: con l'origine in alto sembra
    // scendere DAL pulsante mentre in realta' gli sta sopra.
    _actionMenuEl.classList.add('verso-alto');
  }
  _actionMenuEl.style.top = (top + window.scrollY)+'px';
  _actionMenuEl.querySelectorAll('button').forEach(btn=>{
    btn.onclick = (e)=>{ e.stopPropagation(); closeActionMenu(); actions[+btn.dataset.i].onSelect(); };
  });
  // SI CHIUDE AL POINTERDOWN FUORI, NON AL CLICK.
  //
  // Il difetto era visibile e assurdo: aprendo il menu col tocco prolungato su
  // un ritaglio, il menu appariva e spariva subito — "lampeggia". Il motivo:
  // il menu nasce mentre il dito e' ANCORA GIU' (il tocco prolungato scatta a
  // 480ms), e quando il dito si stacca il browser manda comunque un click, che
  // il menu interpretava come "hai toccato fuori" e si chiudeva da solo. Il
  // gesto che apriva il menu era anche quello che lo chiudeva.
  //
  // Col pointerdown il problema non esiste: la pressione che ha aperto il menu
  // e' gia' avvenuta, quindi il prossimo pointerdown e' per forza un tocco
  // NUOVO. E chi tocca dentro il menu viene lasciato passare, altrimenti la
  // voce sparirebbe da sotto il dito prima che il suo click arrivi.
  _fuoriMenu = (e)=>{
    if(_actionMenuEl && _actionMenuEl.contains(e.target)) return;
    closeActionMenu();
  };
  // Il giro di ritardo resta: se il menu e' stato aperto DA un click (il "⋯"),
  // registrare subito significherebbe raccogliere il pointerdown di quello
  // stesso gesto nei browser che li riordinano.
  setTimeout(()=>{
    if(_fuoriMenu) document.addEventListener('pointerdown', _fuoriMenu, true);
  }, 0);
}
let _fuoriMenu = null;
export function closeActionMenu(){
  // L'ascoltatore va tolto SEMPRE, anche quando il menu si chiude scegliendo
  // una voce. Prima era registrato con {once:true} e basta: scegliendo una
  // voce il click veniva fermato dentro il menu (stopPropagation), quindi
  // l'ascoltatore non scattava mai e restava appeso al documento. Il menu
  // successivo aperto con un click veniva creato e poi ucciso all'istante da
  // quell'ascoltatore vecchio, che finalmente scattava — un "⋯" che non
  // risponde, apparentemente a caso. Vale per tutti i menu dell'app, non solo
  // per le idee: anche quelli delle cartelle in References.
  if(_fuoriMenu){
    document.removeEventListener('pointerdown', _fuoriMenu, true);
    _fuoriMenu = null;
  }
  if(_actionMenuEl){ _actionMenuEl.remove(); _actionMenuEl=null; }
}
