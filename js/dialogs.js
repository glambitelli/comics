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

// Piccolo menu contestuale a due voci (Rinomina / Elimina), ancorato vicino
// all'elemento cliccato — sostituisce il prompt "scrivi rinomina o elimina".
let _actionMenuEl;
export function actionMenu(anchorEl, actions){
  closeActionMenu();
  _actionMenuEl = document.createElement('div');
  _actionMenuEl.className = 'ink-action-menu';
  _actionMenuEl.innerHTML = actions.map((a,i)=>
    `<button data-i="${i}" class="${a.danger?'danger':''}">${a.label}</button>`
  ).join('');
  document.body.appendChild(_actionMenuEl);
  const r = anchorEl.getBoundingClientRect();
  const mw = 160;
  let left = r.right - mw;
  if(left < 8) left = 8;
  if(left + mw > window.innerWidth - 8) left = window.innerWidth - mw - 8;
  _actionMenuEl.style.left = left+'px';
  _actionMenuEl.style.top = (r.bottom + 6 + window.scrollY)+'px';
  _actionMenuEl.querySelectorAll('button').forEach(btn=>{
    btn.onclick = (e)=>{ e.stopPropagation(); closeActionMenu(); actions[+btn.dataset.i].onSelect(); };
  });
  setTimeout(()=> document.addEventListener('click', closeActionMenu, {once:true}), 0);
}
export function closeActionMenu(){
  if(_actionMenuEl){ _actionMenuEl.remove(); _actionMenuEl=null; }
}
