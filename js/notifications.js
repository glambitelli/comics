let swReg = null;

export async function initNotifications(){
  if(!('serviceWorker' in navigator) || !('Notification' in window)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    restoreReminderUI();
    scheduleNextReminder();
  } catch(e){ console.warn('SW failed:', e); }
}

export function restoreReminderUI(){
  const time = localStorage.getItem('inkflow_reminder_time') || '08:20';
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  const timeEl = document.getElementById('reminder-time');
  const toggleEl = document.getElementById('reminder-toggle');
  if(timeEl) timeEl.value = time;
  if(toggleEl) toggleEl.checked = enabled;
  updateReminderStatus();
}

export function saveReminderSettings(){
  const time = document.getElementById('reminder-time').value;
  const enabled = document.getElementById('reminder-toggle').checked;
  localStorage.setItem('inkflow_reminder_time', time);
  localStorage.setItem('inkflow_reminder_enabled', enabled);

  if(enabled){
    requestNotificationPermission().then(granted => {
      if(granted){
        scheduleNextReminder();
        updateReminderStatus();
      } else {
        document.getElementById('reminder-toggle').checked = false;
        localStorage.setItem('inkflow_reminder_enabled', 'false');
        updateReminderStatus();
      }
    });
  } else {
    updateReminderStatus();
  }
}

async function requestNotificationPermission(){
  if(Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

export function scheduleNextReminder(){
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  if(!enabled || !swReg) return;
  if(Notification.permission !== 'granted') return;

  const time = localStorage.getItem('inkflow_reminder_time') || '08:20';
  const [h, m] = time.split(':').map(Number);

  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if(next <= now) next.setDate(next.getDate() + 1);

  const delay = next - now;

  const prevTimer = window._reminderTimer;
  if(prevTimer) clearTimeout(prevTimer);

  window._reminderTimer = setTimeout(async () => {
    const reg = await navigator.serviceWorker.ready;
    if(reg && reg.active){
      reg.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        title: 'Inkflow ✏️',
        body: 'Buongiorno! Scrivi il task di stasera prima di iniziare la giornata.',
        delay: 0
      });
    } else {
      new Notification('Inkflow ✏️', {
        body: 'Buongiorno! Scrivi il task di stasera prima di iniziare la giornata.',
        icon: './icon-192.png'
      });
    }
    scheduleNextReminder();
  }, delay);
}

// Didascalia sotto la voce "Promemoria" nel pannello (vedi index.html).
//
// PARLA SOLO QUANDO C'È UN PROBLEMA, e il resto del tempo non c'è proprio.
// Prima diceva sempre qualcosa — "Spento", "Tocca l'interruttore per
// attivarlo", "Attivo alle 08:30" — cioè ripeteva a parole quello che
// l'interruttore lì accanto e l'orario nella riga sopra già mostrano. Tre righe
// di testo che non facevano prendere nessuna decisione.
//
// Restano i due casi in cui il silenzio farebbe danno: il promemoria è acceso e
// non suonerà mai, e da nessun'altra parte si vede il perché. Lì la riga
// compare, in rame — che nella palette calda dell'app è l'avviso (vedi
// variables.css), al posto di un rosso squillante.
export function updateReminderStatus(){
  const el = document.getElementById('reminder-status');
  if(!el) return;
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';

  let avviso = '';
  if(enabled && perm === 'unsupported') avviso = 'Questo browser non sa mandare notifiche';
  else if(enabled && perm === 'denied')  avviso = 'Permesso negato: abilitalo dalle impostazioni del telefono';

  el.textContent = avviso;
  el.hidden = !avviso;
  el.style.color = 'var(--rame)';
}

export async function testNotification(){
  const granted = await requestNotificationPermission();
  if(!granted){ alert('Permesso notifiche non concesso'); return; }

  try {
    const reg = await navigator.serviceWorker.ready;
    if(reg && reg.active){
      reg.active.postMessage({
        type: 'SCHEDULE_NOTIFICATION',
        title: 'Inkflow ✏️',
        body: 'Test riuscito! Il reminder funziona correttamente.',
        delay: 2000
      });
      return;
    }
  } catch(e){}

  setTimeout(()=>{
    new Notification('Inkflow ✏️', {
      body: 'Test riuscito! Il reminder funziona correttamente.',
      icon: './icon-192.png'
    });
  }, 2000);
}
