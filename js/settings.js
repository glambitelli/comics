import { projects } from './state.js';
import { db, COL, saveUserData, setDoc, doc } from './firebase.js';
import { getStreak } from './evening.js';
import { restoreReminderUI } from './notifications.js';

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
  const stars = parseInt(localStorage.getItem('inkflow_stars')||'0');
  const el = document.getElementById('settings-stars-count');
  if(el) el.textContent = stars;
  const streakEl = document.getElementById('settings-streak-count');
  if(streakEl) streakEl.textContent = getStreak();
  restoreReminderUI();
}

export function closeSettings(){
  document.getElementById('settings-overlay').classList.remove('open');
  document.getElementById('settings-panel').classList.remove('open');
}

export function resetStarsConfirm(){
  document.getElementById('stars-confirm-modal').classList.add('open');
}

export function closeStarsConfirm(){
  document.getElementById('stars-confirm-modal').classList.remove('open');
}

export function doResetStars(){
  localStorage.setItem('inkflow_stars','0');
  Object.keys(localStorage).filter(k=>k.startsWith('inkflow_starred_')).forEach(k=>localStorage.removeItem(k));
  saveUserData();
  const el = document.getElementById('settings-stars-count');
  if(el) el.textContent = '0';
  const hud = document.getElementById('stars-count');
  if(hud) hud.textContent = '0';
  closeStarsConfirm();
}

export function resetStreakConfirm(){
  document.getElementById('streak-confirm-modal').classList.add('open');
}

export function closeStreakConfirm(){
  document.getElementById('streak-confirm-modal').classList.remove('open');
}

export function doResetStreak(){
  localStorage.setItem('inkflow_streak','0');
  localStorage.removeItem('inkflow_streak_last');
  saveUserData();
  const el = document.getElementById('settings-streak-count');
  if(el) el.textContent = '0';
  closeStreakConfirm();
}
