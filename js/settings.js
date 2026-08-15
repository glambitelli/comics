import { projects } from './state.js';
import { db, COL, saveUserData, setDoc, doc, bumpDataRev } from './firebase.js';
import { getStreak } from './evening.js';
import { restoreReminderUI } from './notifications.js';
import { isSoundEnabled, setSoundEnabled, playSfx, SET_SUONI, setSuoniAttivo, setSuoniScegli } from './sound.js';

export function exportBackup(){
  const data = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    projects,
    stars: localStorage.getItem('inkflow_stars'),
    monthly: localStorage.getItem('inkflow_monthly_stars'),
    streak: localStorage.getItem('inkflow_streak'),
    streakLast: localStorage.getItem('inkflow_streak_last'),
    taskHistory: localStorage.getItem('inkflow_task_history'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inkflow-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importBackup(){
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async e => {
    const file = e.target.files[0]; if(!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if(!data.version || !data.projects) throw new Error('File non valido');
      if(data.stars) localStorage.setItem('inkflow_stars', data.stars);
      if(data.monthly) localStorage.setItem('inkflow_monthly_stars', data.monthly);
      if(data.streak) localStorage.setItem('inkflow_streak', data.streak);
      if(data.streakLast) localStorage.setItem('inkflow_streak_last', data.streakLast);
      if(data.taskHistory) localStorage.setItem('inkflow_task_history', data.taskHistory);
      for(const p of data.projects){
        await setDoc(doc(db, COL, p.id), p);
      }
      alert(`✓ Backup ripristinato — ${data.projects.length} progetti importati`);
      closeSettings();
    } catch(err){
      alert('Errore nel file di backup: '+err.message);
    }
  };
  input.click();
}

export function openSettings(){
  document.getElementById('settings-overlay').classList.add('open');
  document.getElementById('settings-panel').classList.add('open');
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
