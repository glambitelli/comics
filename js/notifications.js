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

export function updateReminderStatus(){
  const el = document.getElementById('reminder-status');
  if(!el) return;
  const enabled = localStorage.getItem('inkflow_reminder_enabled') === 'true';
  const time = localStorage.getItem('inkflow_reminder_time') || '08:20';
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';

  if(perm === 'unsupported'){
    el.textContent = 'Notifiche non supportate su questo browser';
    el.style.color = 'var(--ink3)';
  } else if(!enabled){
    el.textContent = 'Reminder disattivato';
    el.style.color = 'var(--ink3)';
  // I colori vengono dalla palette calda di Inkflow (vedi variables.css):
  // rame per l'avviso al posto del rosso squillante, ottone per lo stato
  // attivo al posto del verde. Il giallo #f0c020 del suggerimento era così
  // chiaro da leggersi a fatica sul fondo panna.
  } else if(perm === 'denied'){
    el.textContent = 'Permesso negato — abilita le notifiche nelle impostazioni del telefono';
    el.style.color = 'var(--rame)';
  } else if(perm === 'granted'){
    el.textContent = `Reminder attivo alle ${time} — funziona con la scheda aperta`;
    el.style.color = 'var(--ottone)';
  } else {
    el.textContent = 'Attiva l\'interruttore per abilitare il reminder';
    el.style.color = 'var(--ottone)';
  }
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
