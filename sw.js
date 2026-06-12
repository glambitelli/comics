// Service Worker — solo notifiche, nessuna cache
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// Mostra la notifica quando arriva dal background
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Inkflow', {
      body: data.body || 'Apri Inkflow e scrivi il task di stasera.',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'inkflow-reminder',
      renotify: true,
    })
  );
});

// Click sulla notifica — apre l'app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window'}).then(list => {
      for(const c of list) if(c.url.includes('inkflow') && 'focus' in c) return c.focus();
      if(clients.openWindow) return clients.openWindow('./');
    })
  );
});

// Alarm interno — usato per notifiche schedulate localmente
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SCHEDULE_NOTIFICATION') {
    const {title, body, delay} = e.data;
    setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'inkflow-reminder',
        renotify: true,
      });
    }, delay);
  }
});
