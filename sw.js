const CACHE = 'inkflow-v1';
const STATIC = ['./','./index.html','./app.js','./manifest.json','./icon-192.png','./icon-512.png'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
});

self.addEventListener('activate', e => {
  self.clients.claim();
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
  ));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase e Google Fonts — sempre rete
  if(url.hostname.includes('firebase') || url.hostname.includes('google') || url.hostname.includes('gstatic')){
    e.respondWith(fetch(e.request).catch(()=>new Response('',{status:503})));
    return;
  }
  // File statici — cache first, poi rete
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if(res.ok){
        const clone = res.clone();
        caches.open(CACHE).then(c=>c.put(e.request,clone));
      }
      return res;
    }))
  );
});

// Notifiche schedulate
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(data.title||'Inkflow',{
    body:data.body||'Apri Inkflow e scrivi il task di stasera.',
    icon:'./icon-192.png',badge:'./icon-192.png',tag:'inkflow-reminder',renotify:true
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type:'window'}).then(list=>{
    for(const c of list) if(c.url.includes('inkflow')&&'focus' in c) return c.focus();
    if(clients.openWindow) return clients.openWindow('./');
  }));
});

self.addEventListener('message', e => {
  if(e.data&&e.data.type==='SCHEDULE_NOTIFICATION'){
    const {title,body,delay}=e.data;
    setTimeout(()=>{
      self.registration.showNotification(title,{
        body,icon:'./icon-192.png',badge:'./icon-192.png',tag:'inkflow-reminder',renotify:true
      });
    },delay);
  }
});
