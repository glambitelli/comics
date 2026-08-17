import { projects } from './state.js';
import { db, COL, saveUserData, setDoc, doc, bumpDataRev, collection, getDocs } from './firebase.js';
import { getStreak } from './evening.js';
import { restoreReminderUI } from './notifications.js';
import { isSoundEnabled, setSoundEnabled, playSfx, SET_SUONI, setSuoniAttivo, setSuoniScegli } from './sound.js';
import { confirmModal, infoModal } from './dialogs.js';

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
