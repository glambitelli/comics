import { projects } from './state.js';
import { db, COL, saveUserData, setDoc, doc, bumpDataRev, collection, getDocs } from './firebase.js';
import { getStreak } from './evening.js';
import { restoreReminderUI } from './notifications.js';
import { isSoundEnabled, setSoundEnabled, playSfx, SET_SUONI, setSuoniAttivo, setSuoniScegli } from './sound.js';
import { confirmModal, infoModal } from './dialogs.js';
import { registro, registroTesto, svuotaRegistro } from './registro.js';

// ── IL BACKUP — l'unica cosa che rende l'archivio davvero tuo ──
//
// COSA C'ERA PRIMA, E PERCHÉ NON BASTAVA. Il backup esportava i progetti e i
// contatori delle stelle: due righe di JSON e via. Ma l'archivio visivo — i
// ritagli, le tavole, gli artisti, gli albi, i tag, le idee — non c'era. E le
// immagini stanno su Cloudinary, mentre i loro INDIRIZZI vivono solo qui: se
// questo database si svuota, i file restano dove sono e diventano
// irraggiungibili per sempre, perché nessuno sa più dove sono né a chi
// appartengono. Il backup vecchio salvava la parte che si riscrive in un
// pomeriggio e lasciava fuori quella che non si rifà più.
//
// Adesso si esportano TUTTE le collezioni, lette una per una da Firestore e
// non dalla memoria dell'app: così il file è completo anche se in questa
// sessione non hai mai aperto References. Aggiungere una collezione domani è
// una riga in questo elenco.
const COLLEZIONI = [
  { nome:'projects',   etichetta:'progetti' },
  { nome:'refs',       etichetta:'immagini' },
  { nome:'refFolders', etichetta:'cartelle' },
  { nome:'refAlbums',  etichetta:'albi' },
  { nome:'ideas',      etichetta:'idee' },
  { nome:'userdata',   etichetta:'stelle e streak' },
];
// Le impostazioni e i contatori che vivono solo su questo telefono.
const CHIAVI_LOCALI = ['inkflow_stars','inkflow_monthly_stars','inkflow_streak',
  'inkflow_streak_last','inkflow_task_history','inkflow_order','inkflow_secrets',
  'inkflow_reminder_time','inkflow_reminder_enabled','inkflow_max_streak'];
const ULTIMO_BACKUP = 'inkflow_ultimo_backup';

export async function exportBackup(){
  const btn = document.querySelector('.settings-action.backup-esporta');
  const testo = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = 'Leggo…'; }
  try{
    const collezioni = {};
    for(const c of COLLEZIONI){
      const snap = await getDocs(collection(db, c.nome));
      collezioni[c.nome] = snap.docs.map(d=> ({ id:d.id, ...d.data() }));
    }
    const locale = {};
    CHIAVI_LOCALI.forEach(k=>{
      const v = localStorage.getItem(k);
      if(v !== null) locale[k] = v;
    });
    const dati = {
      app: 'inkflow',
      formato: 2,               // 1 era il backup dei soli progetti
      versione: (document.querySelector('.app-vers')||{}).textContent || '',
      esportatoIl: new Date().toISOString(),
      collezioni, locale,
    };
    const testoFile = JSON.stringify(dati, null, 2);
    const blob = new Blob([testoFile], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkflow-archivio-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Un giro di eventi prima di revocare: su Android il download parte in
    // modo asincrono, e revocare subito l'indirizzo lasciava un file vuoto.
    setTimeout(()=> URL.revokeObjectURL(url), 4000);
    try{ localStorage.setItem(ULTIMO_BACKUP, String(Date.now())); }catch(e){}
    mostraUltimoBackup();
    const righe = COLLEZIONI
      .map(c=> `${collezioni[c.nome].length} ${c.etichetta}`)
      .join(', ');
    await infoModal(
      `Salvato un file con ${righe}. Tienilo dove tieni le cose che non vuoi perdere: da qui si rimette tutto com'era.`,
      { title:'Archivio esportato' });
  }catch(e){
    await infoModal('Non sono riuscito a leggere l\'archivio: ' + (e && e.message ? e.message : e) +
      '\nSe sei senza rete riprova quando torna.', { title:'Esportazione non riuscita' });
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = testo; }
  }
}

export function importBackup(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async e => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      const dati = JSON.parse(await file.text());
      // Il backup vecchio (solo progetti) si continua a leggere: chi ha un
      // file di due mesi fa non deve scoprire che non serve più a niente.
      const collezioni = dati.collezioni || (Array.isArray(dati.projects) ? { projects: dati.projects } : null);
      if(!collezioni) throw new Error('non sembra un file di Inkflow');
      const conto = COLLEZIONI
        .filter(c=> Array.isArray(collezioni[c.nome]) && collezioni[c.nome].length)
        .map(c=> `${collezioni[c.nome].length} ${c.etichetta}`);
      if(!conto.length) throw new Error('il file è vuoto');
      const quando = dati.esportatoIl ? new Date(dati.esportatoIl).toLocaleDateString('it-IT') : 'data sconosciuta';
      // NIENTE VIENE CANCELLATO, e va detto prima: un ripristino che
      // sostituisse l'archivio sarebbe il modo più veloce di perdere il lavoro
      // fatto dopo l'ultimo backup.
      const ok = await confirmModal(
        `Il file è del ${quando} e contiene ${conto.join(', ')}. Rimetto queste cose nell'archivio: ` +
        `quelle che ci sono già vengono riscritte com'erano nel file, le altre si aggiungono. Niente viene cancellato.`,
        { title:'Ripristina archivio', confirmLabel:'Ripristina', safe:true });
      if(!ok) return;
      let scritti = 0;
      for(const c of COLLEZIONI){
        const arr = collezioni[c.nome];
        if(!Array.isArray(arr)) continue;
        for(const documento of arr){
          const { id, ...resto } = documento;
          if(!id) continue;
          await setDoc(doc(db, c.nome, id), resto);
          scritti++;
        }
      }
      const locale = dati.locale || {};
      Object.keys(locale).forEach(k=>{
        if(CHIAVI_LOCALI.includes(k)){ try{ localStorage.setItem(k, locale[k]); }catch(e){} }
      });
      await infoModal(`Rimessi ${scritti} elementi. L'archivio si aggiorna da solo, senza riavviare.`,
        { title:'Archivio ripristinato' });
    }catch(err){
      await infoModal('Non sono riuscito a leggere il file: ' + (err && err.message ? err.message : err),
        { title:'Ripristino non riuscito' });
    }
  };
  input.click();
}

// "Ultimo backup: tre giorni fa", sotto i due pulsanti. Serve a una cosa sola:
// un backup che non si fa mai non e' un backup, e l'unico modo perche' se ne
// ricordi e' che la riga te lo dica quando apri le impostazioni per altro.
export function mostraUltimoBackup(){
  const el = document.getElementById('backup-quando');
  if(!el) return;
  const t = parseInt(localStorage.getItem(ULTIMO_BACKUP) || '0', 10);
  if(!t){
    el.textContent = 'Non hai ancora esportato niente.';
    el.className = 'settings-note avviso';
    return;
  }
  const giorni = Math.floor((Date.now() - t) / 86400000);
  const quando = giorni === 0 ? 'oggi' : giorni === 1 ? 'ieri' : `${giorni} giorni fa`;
  el.textContent = 'Ultimo backup: ' + quando + '.';
  // Dopo un mese la riga si accende: non e' un allarme, e' un promemoria.
  el.className = 'settings-note' + (giorni >= 30 ? ' avviso' : '');
}

export function openSettings(){
  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-panel').classList.add('open');
  montaTrascinamento();
  // Il pannello prende un posto nella cronologia: cosi' il tasto Indietro del
  // telefono lo CHIUDE invece di navigare via. Prima non lo faceva, e il
  // risultato era il difetto peggiore possibile — si tornava alla schermata di
  // prima con addosso ancora la classe che nasconde la barra in fondo, cioe'
  // l'app restava senza navigazione finche' non si riapriva e richiudeva le
  // impostazioni per bene.
  if(window.__navSync) window.__navSync('settings');
  // Nasconde la barra-duna (vedi body.settings-open in layout.css). Stesso
  // trattamento della galleria References: finché il pannello è aperto
  // l'overlay blocca comunque la navigazione, quindi la barra non serve — e
  // se resta lì si sovrappone ai comandi in fondo al pannello, che su alcuni
  // telefoni (safe-area più alta della nostra spaziatura) diventano
  // intoccabili. Toglierla è più solido che rincorrere i pixel.
  document.body.classList.add('settings-open');
  const stars = parseInt(localStorage.getItem('inkflow_stars')||'0');
  const el = document.getElementById('settings-stars-count');
  if(el) el.textContent = stars;
  const streakEl = document.getElementById('settings-streak-count');
  if(streakEl) streakEl.textContent = getStreak();
  restoreReminderUI();
  const st = document.getElementById('sound-toggle');
  if(st) st.checked = isSoundEnabled();
  riempiSetSuoni();
  mostraUltimoBackup();
  mostraRegistro();
  mostraAccount();
  mostraDrive();
}

// ── IL REGISTRO NELLE IMPOSTAZIONI ──
// A pannello aperto si legge subito se c'e' qualcosa che non ha funzionato.
// Quando non c'e' niente lo dice in una riga e finisce li': una scheda vuota
// che promette diagnostica e' peggio di nessuna scheda.
export function mostraRegistro(){
  const riassunto = document.getElementById('registro-riassunto');
  const testo = document.getElementById('registro-testo');
  const azioni = document.getElementById('registro-azioni');
  if(!riassunto) return;
  const righe = registro();
  if(!righe.length){
    riassunto.textContent = 'Nessun errore registrato.';
    riassunto.className = 'settings-note';
    if(testo){ testo.hidden = true; testo.textContent = ''; }
    if(azioni) azioni.hidden = true;
    return;
  }
  const ultimo = new Date(righe[righe.length-1].quando);
  riassunto.textContent = righe.length === 1
    ? '1 errore, l\'ultimo alle ' + ultimo.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) + '.'
    : righe.length + ' errori, l\'ultimo alle ' + ultimo.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) + '.';
  riassunto.className = 'settings-note avviso';
  if(testo){ testo.hidden = false; testo.textContent = registroTesto(); }
  if(azioni) azioni.hidden = false;
}

export async function copiaRegistro(){
  const t = registroTesto();
  if(!t) return;
  try{
    await navigator.clipboard.writeText(t);
    const r = document.getElementById('registro-riassunto');
    if(r){ const prima = r.textContent; r.textContent = 'Registro copiato.';
           setTimeout(()=>{ r.textContent = prima; }, 2000); }
  }catch(e){
    await infoModal(t, { title:'Registro degli errori' });
  }
}

export async function svuotaRegistroUI(){
  const ok = await confirmModal('Cancello l\'elenco degli errori registrati su questo telefono? Non tocca nient\'altro.',
    { title:'Svuota il registro', confirmLabel:'Svuota' });
  if(!ok) return;
  svuotaRegistro();
  mostraRegistro();
}

// ── L'ACCOUNT NEL PANNELLO ──
// Il login si accende da qui e non da una schermata d'ingresso, e per adesso
// e' volutamente FACOLTATIVO: le regole di Firestore sono ancora aperte, e
// bloccare l'app dietro un accesso che nessuno ha ancora provato sul proprio
// telefono e' il modo migliore per restare chiusi fuori dal proprio archivio.
// Prima si prova che si entra, poi si chiudono le regole, poi — e solo allora —
// l'accesso diventa obbligatorio.
let _authMod = null;
async function auth(){
  if(!_authMod) _authMod = await import('./auth.js');
  return _authMod;
}
export async function mostraAccount(){
  const riga = document.getElementById('account-riga');
  if(!riga) return;
  try{
    const a = await auth();
    await a.attendiAccesso();
    a.alCambioAccesso(disegnaAccount);
    disegnaAccount(a.utente());
  }catch(e){
    // L'SDK dell'accesso vive su un CDN: la primissima volta serve la rete, e
    // se non c'e' — o se Google e' irraggiungibile — questa riga non deve
    // buttare giu' tutto il pannello. Si dice cosa succede e si va avanti:
    // tutto il resto delle impostazioni funziona lo stesso.
    const mail = document.getElementById('account-mail');
    const nota = document.getElementById('account-nota');
    const btn = document.getElementById('account-bottone');
    if(mail) mail.textContent = 'Non raggiungibile';
    if(nota){ nota.textContent = 'Serve la rete per la prima volta. Riprova quando torna.'; nota.className = 'settings-note'; }
    if(btn) btn.textContent = 'Riprova';
  }
}
// La riga porta il MESTIERE scritto in grande ("Il tuo Inkflow") e sotto
// l'indirizzo: e' l'unica cosa che distingue davvero un account da un altro,
// e serve a confrontarlo a occhio con quello di Drive qui sotto. Il nome
// visualizzato ("Giovanni") non lo distingue — su due account Google puo'
// essere identico — quindi resta solo come ripiego se la mail manca.
let _mailInkflow = '';
function disegnaAccount(u){
  const mail = document.getElementById('account-mail');
  const btn = document.getElementById('account-bottone');
  const nota = document.getElementById('account-nota');
  const uid = document.getElementById('account-uid');
  if(!mail || !btn) return;
  _mailInkflow = (u && u.email) || '';
  if(u){
    mail.textContent = u.email || u.displayName || 'Account collegato';
    btn.textContent = 'Esci';
    if(nota){
      nota.textContent = 'Sei tu il proprietario: l\'archivio lo legge e lo scrive solo questo account. Il codice qui sotto va incollato nelle regole di Firestore.';
      nota.className = 'settings-note';
    }
    if(uid){ uid.hidden = false; uid.textContent = 'Copia il codice account'; uid.dataset.uid = u.uid; }
  } else {
    mail.textContent = 'Nessun account';
    btn.textContent = 'Entra';
    if(nota){
      nota.textContent = 'Senza account l\'archivio è leggibile da chiunque conosca l\'indirizzo dell\'app. Entrando con Google diventa tuo.';
      nota.className = 'settings-note avviso';
    }
    if(uid){ uid.hidden = true; uid.textContent = ''; }
  }
  disegnaDrive();   // la nota di Drive confronta i due indirizzi: cambia con questo
}

// ── LA SORGENTE DEGLI ALBI (Google Drive) ──
// Sta accanto all'account e NON e' un secondo account: e' il posto da cui
// arrivano i .cbz/.cbr, in sola lettura. Puo' essere un altro account Google
// con un'altra mail, ed e' il caso per cui questa riga esiste — prima
// l'unico posto da cui collegarlo era il pannello nuvola dentro l'archivio,
// scritto "account" come l'altro: chi apriva le impostazioni non aveva modo
// di sapere che i due indirizzi potevano (e possono) essere diversi.
let _driveMod = null;
let _driveAgganciato = false;
async function drive(){
  if(!_driveMod) _driveMod = await import('./drive.js');
  return _driveMod;
}
export async function mostraDrive(){
  const riga = document.getElementById('drive-riga');
  if(!riga) return;
  try{
    const d = await drive();
    if(!_driveAgganciato){
      _driveAgganciato = true;
      // Collegare o scollegare Drive da un'altra schermata deve aggiornare
      // anche questa riga: e' lo stesso stato visto da due parti.
      d.onDriveAuthChange(disegnaDrive);
    }
    // Solo il download della libreria di Google, cosi' quando il dito arriva
    // sul pulsante la finestra puo' partire DENTRO il tocco (vedi drive.js).
    d.prepareDriveAuth();
    disegnaDrive();
  }catch(e){
    const stato = document.getElementById('drive-mail');
    if(stato) stato.textContent = 'Non raggiungibile';
  }
}
function disegnaDrive(){
  const stato = document.getElementById('drive-mail');
  const btn = document.getElementById('drive-bottone');
  const nota = document.getElementById('drive-nota');
  if(!stato || !btn) return;
  const d = _driveMod;
  if(!d || !d.isDriveConfigured()){
    stato.textContent = 'Non configurato';
    btn.hidden = true;
    if(nota){ nota.textContent = 'Google Drive non è ancora configurato per questa app.'; nota.className = 'settings-note'; }
    return;
  }
  btn.hidden = false;
  const collegato = d.isDriveConnected();
  const mail = collegato ? d.driveAccountEmail() : '';
  if(collegato){
    stato.textContent = mail || 'Collegato';
    btn.textContent = 'Scollega';
    if(nota){
      nota.className = 'settings-note';
      // I due indirizzi diversi NON sono un errore, ed e' importante che la
      // scheda lo dica: chi tiene gli albi su un secondo account Google,
      // vedendo due mail diverse senza una parola di spiegazione, pensa di
      // aver sbagliato accesso e scollega quello giusto.
      if(mail && _mailInkflow && mail.toLowerCase() === _mailInkflow.toLowerCase())
        nota.textContent = 'Stesso account con cui sei entrato in Inkflow. Solo lettura: gli albi si leggono, niente viene toccato su Drive.';
      else if(mail && _mailInkflow)
        nota.textContent = 'Account diverso da quello di Inkflow, e va bene così: qui conta dove stanno gli albi, non chi sei. Solo lettura.';
      else
        nota.textContent = 'Solo lettura: gli albi si leggono, niente viene toccato su Drive.';
    }
  } else {
    stato.textContent = 'Non collegato';
    btn.textContent = d.daRicollegare() ? 'Ricollega' : 'Collega';
    if(nota){
      nota.className = 'settings-note';
      nota.textContent = d.daRicollegare()
        ? 'Il collegamento è scaduto (dura un\'ora e si rinnova da solo finché la sessione Google è viva). Gli albi tornano con un tocco.'
        : 'Da qui arrivano gli albi .cbz e .cbr. Può essere un altro account Google, con un\'altra mail: è solo il posto dove tieni l\'archivio.';
    }
  }
}
// Stessa regola dell'accesso a Inkflow: la finestra di Google si apre DENTRO
// il tocco, quindi niente await prima di chiedere il token.
export function driveTocca(){
  if(!_driveMod){ mostraDrive(); return; }
  if(_driveMod.isDriveConnected()){
    _driveMod.disconnectDrive();
    disegnaDrive();
    return;
  }
  // Una riga che dice "sto lavorando": fra il tocco e la pagina di Google
  // passa qualche istante, e in quel buco la riga continuava a dire "Non
  // collegato" — cioe' esattamente quello che dice quando non e' successo
  // niente.
  const stato = document.getElementById('drive-mail');
  if(stato) stato.textContent = 'Apro Google…';
  _driveMod.connectDrive()
    .then(()=> disegnaDrive())
    .catch(e=>{
      disegnaDrive();
      if(e && /annullat/i.test(e.message || '')) return;   // ripensamento, non guasto
      infoModal(e && e.message ? e.message : 'Collegamento a Drive non riuscito.',
                { title:'Google Drive' });
    });
}
// La finestra di Google si apre DENTRO il tocco: niente await prima, o il
// browser la considera una finestra non richiesta e la blocca (stessa storia
// del collegamento a Drive, vedi requestToken in drive.js).
export function accountTocca(){
  if(!_authMod){
    // Primo tocco senza modulo in memoria: lo si carica e si dice di ripremere,
    // invece di aprire una finestra che verrebbe bloccata.
    mostraAccount();
    return;
  }
  if(_authMod.utente()){
    _authMod.esci().then(()=> disegnaAccount(null));
    return;
  }
  _authMod.entraConGoogle()
    .then(u=> disegnaAccount(u))
    .catch(e=>{
      // "popup-closed-by-user" non e' un errore: e' un ripensamento.
      if(e && /popup-closed|cancelled-popup/.test(e.code||'')) return;
      infoModal(spiegaErroreAccesso(e), { title:'Accesso non riuscito' });
    });
}

// ── TRADURRE I CODICI DI FIREBASE IN COSE DA FARE ──
// "Firebase: Error (auth/configuration-not-found)" e' una stringa che non
// aiuta nessuno: non dice cosa manca ne' dove si sistema. E questi tre errori
// qui capitano tutti e tre UNA volta sola nella vita di un'app — il giorno che
// si accende l'accesso — cioe' proprio quando non si ha ancora idea di dove
// guardare. Meglio scrivere il passo da fare che il codice da cercare.
function spiegaErroreAccesso(e){
  const codice = (e && e.code) || '';
  if(/configuration-not-found|operation-not-allowed/.test(codice))
    return 'L\'accesso con Google non è ancora acceso nel progetto Firebase. ' +
           'Console Firebase → Authentication → Sign-in method → Google → abilita e salva. ' +
           'Poi riprova da qui.';
  if(/unauthorized-domain/.test(codice))
    return 'Questo indirizzo non è fra quelli autorizzati. ' +
           'Console Firebase → Authentication → Settings → Authorized domains → aggiungi ' +
           'glambitelli.github.io. Poi riprova da qui.';
  if(/popup-blocked/.test(codice))
    return 'Il browser ha bloccato la finestra di Google. Riprova toccando di nuovo "Entra": ' +
           'deve partire dal tocco, senza attese in mezzo.';
  if(/network-request-failed/.test(codice))
    return 'Senza rete non si può entrare. Riprova quando torna la connessione.';
  return 'Non sono riuscito a entrare: ' + ((e && e.message) ? e.message : e);
}
// Le prove leggono le spiegazioni senza dover far fallire Google davvero.
export const __perLeProve_spiega = spiegaErroreAccesso;
export async function copiaUid(){
  const el = document.getElementById('account-uid');
  const uid = el && el.dataset ? el.dataset.uid : '';
  if(!uid) return;
  try{
    await navigator.clipboard.writeText(uid);
    el.textContent = 'Codice copiato';
    setTimeout(()=>{ el.textContent = 'Copia il codice account'; }, 2200);
  }catch(e){
    // Senza appunti (o senza permesso) si mostra il codice: si trascrive a mano
    // una volta sola nella vita.
    await infoModal(uid, { title:'Codice account' });
  }
}

// Il menu dei set si costruisce dall'elenco in sound.js, non a mano
// nell'HTML: aggiungerne uno deve restare una riga sola, in un posto solo.
function riempiSetSuoni(){
  const sel = document.getElementById('sound-pack');
  if(!sel) return;
  const attivo = setSuoniAttivo();
  sel.innerHTML = SET_SUONI.map(s=>
    `<option value="${s.id}"${s.id === attivo ? ' selected' : ''}>${s.nome}</option>`).join('');
  // Con un set solo non c'è niente da scegliere: il menu resta visibile — dice
  // COSA stai sentendo, ed è un'informazione — ma non si apre a vuoto.
  sel.disabled = SET_SUONI.length < 2;
}

// Interruttore suoni: salva la preferenza e, se acceso, fa un piccolo suono
// di conferma — così senti subito com'è (e serve anche a sbloccare l'audio).
export function onSoundToggle(){
  const st = document.getElementById('sound-toggle');
  const on = !!(st && st.checked);
  setSoundEnabled(on);
  if(on) playSfx('done');
}

// Cambio di set: come per l'interruttore, si sente subito com'è. Il suono parte
// dopo il cambio, quindi è già quello nuovo.
export function onSoundPackChange(){
  const sel = document.getElementById('sound-pack');
  if(!sel) return;
  setSuoniScegli(sel.value);
  if(isSoundEnabled()) playSfx('done');
}

// Chiude e basta, senza toccare la cronologia: la usa il tasto Indietro, che
// la cronologia l'ha gia' fatta scorrere per conto suo (vedi popstate in
// main.js). Stesso schema del lettore e della lightbox.
export function closeSettingsUI(){
  document.getElementById('settings-overlay').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
  document.body.classList.remove('settings-open');
}

// ── CHIUDERE COL DITO ──
// Il pannello sale dal basso come un foglio, e un foglio che sale dal basso su
// un telefono si chiude tirandolo giu': la X in cima e' un bersaglio piccolo
// nell'angolo opposto al pollice, e su mobile e' ora nascosta (vedi
// settings.css) — resta solo dove il dito non c'e', cioe' col mouse.
//
// Due accortezze, che sono poi tutto il mestiere di questo gesto:
//   1. IL PANNELLO SCORRE. Se si comincia a trascinare con il contenuto gia'
//      sceso, il gesto e' uno scorrimento e non va rubato: si trascina solo
//      partendo dal bordo alto della lista (scrollTop a zero) o dalla testata,
//      che e' la maniglia dichiarata.
//   2. IL FOGLIO SEGUE IL DITO. Un gesto che decide solo quando lo lasci —
//      niente si muove, poi salta — sembra rotto. Qui il pannello si sposta
//      insieme al dito, e se si molla troppo presto torna su da solo.
const CHIUDI_DOPO = 90;      // px di trascinamento oltre i quali si chiude
const CHIUDI_VELOCE = 0.55;  // px/ms: uno strappo corto ma deciso vale uguale
function montaTrascinamento(){
  const pannello = document.getElementById('settings-panel');
  const velo = document.getElementById('settings-overlay');
  if(!pannello || pannello._trascina) return;
  pannello._trascina = true;
  let y0 = 0, t0 = 0, dy = 0, puo = false, attivo = false;

  const posa = (y)=>{
    // Verso l'alto il foglio non va: si lascia un accenno di elasticita' e
    // basta, se no sembra che si possa aprire piu' di cosi'.
    const v = y < 0 ? y / 4 : y;
    pannello.style.transition = 'none';
    pannello.style.transform = 'translateY(' + v + 'px)';
    if(velo) velo.style.opacity = String(Math.max(0, 1 - v / 320));
  };
  const rimetti = ()=>{
    pannello.style.transition = '';
    pannello.style.transform = '';
    if(velo) velo.style.opacity = '';
  };

  pannello.addEventListener('touchstart', e=>{
    if(e.touches.length !== 1){ puo = attivo = false; return; }
    // Dentro un modale aperto sopra il pannello si sta facendo altro.
    if(e.target.closest && e.target.closest('.modal, .ink-action-menu')){
      puo = attivo = false; return;
    }
    const daTestata = !!(e.target.closest && e.target.closest('.settings-head-wrap'));
    puo = daTestata || pannello.scrollTop <= 0;
    attivo = false;
    y0 = e.touches[0].clientY; t0 = Date.now(); dy = 0;
  }, { passive:true });

  pannello.addEventListener('touchmove', e=>{
    if(!puo || e.touches.length !== 1) return;
    dy = e.touches[0].clientY - y0;
    // Finche' non e' chiaro che si sta tirando giu' non si tocca niente: un
    // dito che parte verso l'alto sta scorrendo la lista.
    if(!attivo){
      if(dy < 8) { if(dy < -4) puo = false; return; }
      attivo = true;
    }
    // Da qui il gesto e' nostro: senza questo il telefono continua a scorrere
    // sotto il foglio mentre il foglio si sposta, e si muovono due cose insieme.
    if(e.cancelable) e.preventDefault();
    posa(dy);
  }, { passive:false });

  const finito = ()=>{
    if(!attivo){ puo = false; return; }
    puo = attivo = false;
    const velocita = dy / Math.max(1, Date.now() - t0);
    if(dy > CHIUDI_DOPO || (dy > 40 && velocita > CHIUDI_VELOCE)){
      // Si finisce la corsa da dove sta il dito, poi si chiude per davvero
      // (passando dalla cronologia, come la X: vedi closeSettings).
      pannello.style.transition = 'transform .22s cubic-bezier(.32,.72,0,1)';
      pannello.style.transform = 'translateY(100%)';
      if(velo){ velo.style.transition = 'opacity .22s'; velo.style.opacity = '0'; }
      setTimeout(()=>{
        // PRIMA si chiude, POI si tolgono gli stili messi a mano. Nell'ordine
        // opposto — ed era l'ordine di prima — c'era un lampo: togliendo la
        // translateY messa dal dito mentre il pannello ha ancora addosso la
        // classe "open" (che vale translateY(0)), il foglio ricompariva a
        // schermo intero per qualche istante, e solo dopo scendeva.
        //
        // E "poi" non vuol dire mezzo secondo dopo: la chiusura passa dalla
        // cronologia (history.back), che risponde quando vuole lui. Quindi si
        // aspetta il fatto — la classe che sparisce — e non un tempo.
        closeSettings();
        const pulisci = (giri = 0)=>{
          if(pannello.classList.contains('open') && giri < 40){
            requestAnimationFrame(()=> pulisci(giri + 1));
            return;
          }
          rimetti();
          if(velo) velo.style.transition = '';
        };
        pulisci();
      }, 220);
      return;
    }
    // Non abbastanza: torna su da solo, con la stessa molla dell'apertura.
    pannello.style.transition = 'transform .28s cubic-bezier(.32,.72,0,1)';
    pannello.style.transform = 'translateY(0)';
    if(velo) velo.style.opacity = '';
    setTimeout(rimetti, 280);
  };
  pannello.addEventListener('touchend', finito, { passive:true });
  pannello.addEventListener('touchcancel', finito, { passive:true });
}
// Le prove hanno bisogno di montarlo senza aprire il pannello.
export const __perLeProve_trascina = montaTrascinamento;

// La X e le chiusure da codice passano invece DALLA cronologia: altrimenti il
// posto occupato dall'apertura resterebbe li', e il primo Indietro dopo aver
// chiuso col pulsante non farebbe niente di visibile.
export function closeSettings(){
  const st = history.state;
  if(st && st.view === 'settings'){ history.back(); return; }
  closeSettingsUI();
}

export function resetStarsConfirm(){
  document.getElementById('stars-confirm-modal').classList.add('open');
}

export function closeStarsConfirm(){
  document.getElementById('stars-confirm-modal').classList.remove('open');
}

export async function doResetStars(){
  localStorage.setItem('inkflow_stars','0');
  localStorage.setItem('inkflow_monthly_stars','{}');
  localStorage.setItem('inkflow_task_history','[]');
  Object.keys(localStorage).filter(k=>k.startsWith('inkflow_starred_')).forEach(k=>localStorage.removeItem(k));
  // Forza una revisione molto alta così sovrascrive qualunque valore vecchio su Firebase
  const forcedRev = Date.now();
  localStorage.setItem('inkflow_data_rev', String(forcedRev));
  const el = document.getElementById('settings-stars-count');
  if(el) el.textContent = '0';
  const hud = document.getElementById('stars-count');
  if(hud) hud.textContent = '0';
  closeStarsConfirm();
  await saveUserData();
}

export function resetStreakConfirm(){
  document.getElementById('streak-confirm-modal').classList.add('open');
}

export function closeStreakConfirm(){
  document.getElementById('streak-confirm-modal').classList.remove('open');
}

export async function doResetStreak(){
  localStorage.setItem('inkflow_streak','0');
  localStorage.setItem('inkflow_streak_last','');
  localStorage.setItem('inkflow_data_rev', String(Date.now()));
  const el = document.getElementById('settings-streak-count');
  if(el) el.textContent = '0';
  closeStreakConfirm();
  await saveUserData();
}
