// Service Worker — cache file statici locali, Firebase sempre da rete
const CACHE = 'inkflow-static-v76';
const SHARE_CACHE = 'inkflow-share-inbox';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== SHARE_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // ── CONDIVISIONE DA ANDROID ("Condividi" → Inkflow) ──
  // GitHub Pages è statico e non può ricevere un vero POST: il Service Worker
  // intercetta la richiesta, mette le immagini in una cache temporanea e
  // reindirizza a share-target.html, che le legge e le carica su Storage.
  if(e.request.method === 'POST' && url.pathname.endsWith('/share-target.html')){
    e.respondWith(handleShareTarget(e.request));
    return;
  }

  const isSameOrigin = url.origin === self.location.origin;
  // L'SDK Firebase (gstatic.com/firebasejs) è versionato e immutabile:
  // CACHE-FIRST, altrimenti offline i moduli non si caricano e l'app non parte.
  const isFirebaseSDK = url.href.includes('gstatic.com/firebasejs')
                     || url.host === 'fonts.googleapis.com'
                     || url.host === 'fonts.gstatic.com';
  // Le API Firestore/Google dinamiche invece mai in cache
  const isFirebaseAPI = !isFirebaseSDK && /firebase|firestore|googleapis|gstatic/.test(url.href);

  if(e.request.method !== 'GET' || (!isSameOrigin && !isFirebaseSDK) || isFirebaseAPI){
    e.respondWith(fetch(e.request));
    return;
  }

  if(isFirebaseSDK){
    e.respondWith(
      caches.open(CACHE).then(cache => cache.match(e.request).then(hit =>
        hit || fetch(e.request).then(resp => {
          if(resp && resp.status === 200) cache.put(e.request, resp.clone());
          return resp;
        })
      ))
    );
    return;
  }

  // NETWORK-FIRST: online prendi sempre l'ultima versione (così i deploy hanno
  // effetto subito), la cache è solo fallback quando sei offline.
  e.respondWith(
    fetch(e.request).then(resp => {
      if(resp && resp.status === 200){
        const clone = resp.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return resp;
    }).catch(() =>
      caches.open(CACHE).then(cache => cache.match(e.request))
    )
  );
});

async function handleShareTarget(request){
  try{
    const formData = await request.formData();
    const files = formData.getAll('images').filter(f => f && f.size > 0);
    const cache = await caches.open(SHARE_CACHE);
    // pulisci eventuali condivisioni precedenti non consumate
    const oldKeys = await cache.keys();
    await Promise.all(oldKeys.map(k => cache.delete(k)));
    let i = 0;
    for(const file of files){
      const resp = new Response(file, {headers:{'Content-Type': file.type || 'image/jpeg'}});
      const key = new URL('__shared-image-'+i, self.location.href).href;
      await cache.put(new Request(key), resp);
      i++;
    }
  }catch(e){
    console.error('share-target: errore lettura formData', e);
  }
  return Response.redirect('./share-target.html?shared=1', 303);
}

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
