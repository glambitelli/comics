// Service Worker — cache file statici locali, Firebase sempre da rete
//
// DUE NUMERI, E FANNO DUE MESTIERI DIVERSI.
//
// VERSIONE e' la versione dell'app per chi la usa: cambia quando cambia cosa
// l'app SA FARE, non a ogni ritocco. La 1.0.0 e' il 17 agosto 2026, il giorno
// in cui l'archivio, i progetti, il lettore, i ritagli, le idee e Drive sono
// diventati una cosa sola su cui si puo' contare.
//
// CACHE invece e' il numero di serie della PUBBLICAZIONE, e va alzato ad ogni
// ritocco di CSS o JS: e' il nome della dispensa dei file, e cambiargli nome
// e' l'unico modo per convincere il telefono a scaricare i file nuovi invece
// di servire quelli di ieri. Alzare questo e non quello e' normale; il
// contrario no.
const VERSIONE = '1.0.0';
const CACHE = 'inkflow-static-v280';
const SHARE_CACHE = 'inkflow-share-inbox';
// Cache dei file .cbz/.cbr scaricati da Drive: gestita da js/drive.js, va
// PRESERVATA tra i deploy (altrimenti a ogni aggiornamento riscaricheresti
// decine di MB su 4G). Deve restare identica alla costante in drive.js.
const ALBUM_CACHE = 'inkflow-drive-albums';
// Roba di terze parti: l'SDK di Firebase e i caratteri. Sta in una cache
// TUTTA SUA, e come quella degli albi va PRESERVATA fra i deploy.
//
// PERCHÉ, imparato male. Prima stava insieme ai file dell'app, quindi ogni
// volta che si alzava la versione della cache — cioè ad ogni ritocco di CSS,
// più volte al giorno — veniva buttata via anche lei. Alla riapertura
// successiva l'SDK di Firebase andava riscaricato dalla rete, e siccome è un
// import statico del grafo dei moduli, se quella singola richiesta non andava
// a buon fine main.js non veniva mai eseguito: l'app restava piantata sulla
// schermata di sincronizzazione, senza un messaggio e senza una via d'uscita.
// Un ritocco al colore di un bottone non deve poter costare il riscaricamento
// dell'SDK, e tantomeno l'avvio dell'app.
const VENDOR_CACHE = 'inkflow-vendor';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE && k !== SHARE_CACHE && k !== ALBUM_CACHE && k !== VENDOR_CACHE)
          .map(k => caches.delete(k))
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
      caches.open(VENDOR_CACHE).then(cache => cache.match(e.request).then(hit => {
        if(hit) return hit;
        return fetch(e.request).then(resp => {
          if(resp && resp.status === 200) cache.put(e.request, resp.clone());
          return resp;
        }).catch(err => {
          // Ultima spiaggia: se la rete non risponde si cerca la stessa cosa
          // nelle cache vecchie, comprese quelle di versioni precedenti che
          // non sono ancora state ripulite. Meglio un SDK di ieri che un'app
          // che non parte.
          return caches.match(e.request).then(vecchio => {
            if(vecchio) return vecchio;
            throw err;
          });
        });
      }))
    );
    return;
  }

  // STALE-WHILE-REVALIDATE: se il file è in cache si serve SUBITO, e intanto
  // in sottofondo si ricontrolla la rete per la volta dopo.
  //
  // Prima era network-first: ogni singolo file aspettava un giro in rete anche
  // quando era già in cache. Da browser desktop non si nota, ma nella PWA
  // installata su 4G aprire References significa caricare quattro moduli più i
  // loro CSS, e ognuno pagava la latenza prima che si vedesse qualcosa.
  //
  // I deploy continuano ad arrivare senza ritardo percepito: CACHE cambia nome
  // ad ogni versione e "activate" cancella le vecchie, quindi il primo avvio
  // dopo un aggiornamento scarica comunque tutto dalla rete. Da lì in poi le
  // aperture sono immediate.
  e.respondWith(
    caches.open(CACHE).then(cache => cache.match(e.request).then(hit => {
      const network = fetch(e.request).then(resp => {
        if(resp && resp.status === 200) cache.put(e.request, resp.clone());
        return resp;
      }).catch(() => hit);   // offline: resta valido quello che abbiamo
      return hit || network;
    }))
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
  // "Che versione stai servendo?" — la risposta la da' chi i file li serve
  // davvero, cioe' questo service worker, non la pagina che potrebbe essere
  // vecchia. Serve a leggere la versione in fondo alla home e sapere a colpo
  // d'occhio se un aggiornamento e' arrivato o se si sta ancora guardando la
  // copia in cache (vedi mostraVersione in main.js).
  if(e.data&&e.data.type==='VERSIONE'){
    const porta = e.ports && e.ports[0];
    // Tutti e due i numeri, in chiaro: "1.0.0 · v242". Quello a sinistra dice
    // che app e', quello a destra se l'aggiornamento di stasera e' arrivato.
    if(porta) porta.postMessage(VERSIONE + ' · ' + CACHE.replace('inkflow-static-',''));
    return;
  }
  if(e.data&&e.data.type==='SCHEDULE_NOTIFICATION'){
    const {title,body,delay}=e.data;
    setTimeout(()=>{
      self.registration.showNotification(title,{
        body,icon:'./icon-192.png',badge:'./icon-192.png',tag:'inkflow-reminder',renotify:true
      });
    },delay);
  }
});
