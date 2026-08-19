// Impostazioni — il pannello dice solo quello che serve
//
// Gira sull'APP VERA (come navigazione.js e home-ricerca.js): quello che si
// prova qui è quanto testo il pannello mostra davvero, e dipende dall'incastro
// fra il markup, notifications.js e sound.js.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');

module.exports = () => suite("Impostazioni — il pannello dice solo quello che serve", {
  banco: '/index.html',
  pronto: ()=> !!document.querySelector('#settings-panel'),
  // Il pannello carica l'accesso al volo (mostraAccount): con il service
  // worker acceso quella richiesta NON passa dalle intercettazioni qui sotto e
  // finisce sulla rete vera — sul computer di sviluppo fallisce e non succede
  // niente, sulla macchina che pubblica invece l'SDK vero di Google arriva
  // davvero e la prova comincia a dipendere da com'e' fatta la rete. Spento.
  senzaServiceWorker: true,
  prima: async (page)=>{
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
}, async ({ page, ok, sezione }) => {

  await page.waitForTimeout(1800);
  const apri = async ()=>{
    await page.evaluate(async ()=>{
      const m = await import('/js/settings.js');
      m.openSettings();
    });
    await page.waitForTimeout(250);
  };

  sezione('sotto "Suoni di menu" non c\'è più una didascalia generica');
  await apri();
  const suoni = await page.evaluate(()=>{
    const riga = document.getElementById('sound-toggle').closest('.settings-row');
    const sel = document.getElementById('sound-pack');
    return {
      didascalie: riga.querySelectorAll('.settings-item span').length,
      testo: riga.querySelector('.settings-item').textContent.trim(),
      opzioni: sel ? Array.from(sel.options).map(o=>o.textContent) : null,
      scelto: sel ? sel.value : null,
      // Con un set solo il menu resta leggibile ma non si apre a vuoto.
      spento: sel ? sel.disabled : null,
      visibile: sel ? getComputedStyle(sel).display !== 'none' : null,
    };
  });
  ok('la riga dell\'interruttore ha solo il titolo',
     suoni.didascalie === 0 && suoni.testo === 'Suoni di menu', suoni);
  ok('c\'è un menu per scegliere il set', suoni.visibile === true, suoni);
  ok('e dentro c\'è il set attuale', /Final Fantasy VII/.test((suoni.opzioni||[]).join('|')), suoni);
  ok('con un set solo non si apre a vuoto', suoni.spento === true, suoni);

  sezione('sotto "Promemoria" non si scrive quello che l\'interruttore già dice');
  const spento = await page.evaluate(async ()=>{
    localStorage.setItem('inkflow_reminder_enabled', 'false');
    const m = await import('/js/notifications.js');
    m.updateReminderStatus();
    const el = document.getElementById('reminder-status');
    return { testo: el.textContent, altezza: Math.round(el.getBoundingClientRect().height) };
  });
  ok('a promemoria spento la riga non c\'è proprio',
     spento.testo === '' && spento.altezza === 0, spento);

  const acceso = await page.evaluate(async ()=>{
    localStorage.setItem('inkflow_reminder_enabled', 'true');
    // IL PERMESSO SI DICHIARA, non si eredita dalla macchina. Questa prova
    // vuole il caso "va tutto bene", e "bene" vuol dire permesso concesso: il
    // browser sul computer di sviluppo parte da 'default' e la prova passava,
    // quello della macchina che pubblica parte da 'denied' e la prova cadeva —
    // su un'app che non era cambiata di una riga. La prima cosa che la
    // pubblicazione automatica ha trovato e' stata una prova che dipendeva da
    // dove girava.
    Object.defineProperty(Notification, 'permission', { get:()=>'granted', configurable:true });
    const m = await import('/js/notifications.js');
    m.updateReminderStatus();
    const el = document.getElementById('reminder-status');
    return { testo: el.textContent, altezza: Math.round(el.getBoundingClientRect().height) };
  });
  ok('e nemmeno a promemoria acceso, se va tutto bene',
     acceso.testo === '' && acceso.altezza === 0, acceso);

  sezione('il quadernetto dei guasti');
  // Nel codice ci sono quaranta punti in cui un errore viene ingoiato in
  // silenzio: giusto uno per uno, disastroso tutti insieme — sul telefono non
  // resta traccia di niente e l'unica cosa che arriva e' "non funziona".
  const registro = await page.evaluate(async ()=>{
    localStorage.removeItem('inkflow_registro');
    const m = await import('/js/settings.js');
    m.mostraRegistro();
    const vuoto = {
      testo: document.getElementById('registro-riassunto').textContent,
      elenco: document.getElementById('registro-testo').hidden,
      azioni: document.getElementById('registro-azioni').hidden,
    };
    // Un errore vero, di quelli che nessuno vede: una promessa rifiutata.
    const r = await import('/js/registro.js');
    r.ascoltaErrori();
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.reject(new Error('salvataggio non riuscito')).catch(()=>{}),
      reason: new Error('salvataggio non riuscito'),
    }));
    await new Promise(res=>setTimeout(res,100));
    m.mostraRegistro();
    return { vuoto, pieno: {
      testo: document.getElementById('registro-riassunto').textContent,
      elenco: document.getElementById('registro-testo').textContent,
      nascosto: document.getElementById('registro-testo').hidden,
      azioni: document.getElementById('registro-azioni').hidden,
      quanti: r.registro().length,
    }};
  });
  ok('a registro vuoto lo dice in una riga e finisce li\'',
     /nessun errore/i.test(registro.vuoto.testo) && registro.vuoto.elenco === true
     && registro.vuoto.azioni === true, registro.vuoto);
  ok('una promessa rifiutata finisce nel registro', registro.pieno.quanti === 1, registro.pieno);
  ok('e nel pannello si legge cos\'e\' successo',
     /salvataggio non riuscito/.test(registro.pieno.elenco) && !registro.pieno.nascosto, registro.pieno);
  ok('con l\'ora e i tasti per copiarlo o buttarlo',
     /\d{2}:\d{2}/.test(registro.pieno.elenco) && registro.pieno.azioni === false, registro.pieno);
  await page.evaluate(()=> localStorage.removeItem('inkflow_registro'));

  sezione('ma parla quando il promemoria non suonerà mai');
  // È il caso per cui la riga esiste ancora: acceso, e il telefono ha detto no.
  // Senza avviso resterebbe un interruttore acceso che non fa niente, e da
  // nessun'altra parte si vedrebbe il perché.
  const negato = await page.evaluate(async ()=>{
    Object.defineProperty(Notification, 'permission', { get:()=>'denied', configurable:true });
    const m = await import('/js/notifications.js');
    m.updateReminderStatus();
    const el = document.getElementById('reminder-status');
    return { testo: el.textContent, altezza: Math.round(el.getBoundingClientRect().height) };
  });
  ok('lo dice, e si vede', /permesso negato/i.test(negato.testo) && negato.altezza > 0, negato);

  const negatoMaSpento = await page.evaluate(async ()=>{
    localStorage.setItem('inkflow_reminder_enabled', 'false');
    const m = await import('/js/notifications.js');
    m.updateReminderStatus();
    return document.getElementById('reminder-status').textContent;
  });
  ok('ma non se il promemoria è spento: lì non è un problema di nessuno',
     negatoMaSpento === '', negatoMaSpento);

  sezione('il tasto Indietro chiude il pannello e RIMETTE la barra in fondo');
  // Il difetto: Indietro chiudeva il pannello ma lasciava sul body la classe
  // che nasconde la barra-duna. Si tornava alla schermata di prima senza piu'
  // navigazione, e non c'era modo di capire perche'.
  await page.evaluate(()=> document.body.classList.add('is-touch'));
  await apri();
  const aperto = await page.evaluate(()=>({
    pannello: document.getElementById('settings-panel').classList.contains('open'),
    classe: document.body.classList.contains('settings-open'),
    barra: getComputedStyle(document.getElementById('dune-nav')).display,
    stato: (history.state||{}).view,
  }));
  ok('aperto: il pannello c\'e\' e la barra si toglie di mezzo',
     aperto.pannello && aperto.classe && aperto.barra === 'none', aperto);
  ok('e il pannello ha preso un posto nella cronologia', aperto.stato === 'settings', aperto);

  await page.evaluate(()=> history.back());
  await page.waitForTimeout(400);
  const dopoIndietro = await page.evaluate(()=>({
    pannello: document.getElementById('settings-panel').classList.contains('open'),
    classe: document.body.classList.contains('settings-open'),
    barra: getComputedStyle(document.getElementById('dune-nav')).display,
  }));
  ok('Indietro chiude il pannello', !dopoIndietro.pannello, dopoIndietro);
  ok('e la barra in fondo torna', !dopoIndietro.classe && dopoIndietro.barra !== 'none', dopoIndietro);

  sezione('e la X fa esattamente la stessa cosa');
  await apri();
  await page.evaluate(async ()=>{ const m = await import('/js/settings.js'); m.closeSettings(); });
  await page.waitForTimeout(400);
  const dopoX = await page.evaluate(()=>({
    pannello: document.getElementById('settings-panel').classList.contains('open'),
    barra: getComputedStyle(document.getElementById('dune-nav')).display,
    // Chiudendo con la X il posto in cronologia va restituito, altrimenti il
    // primo Indietro dopo non farebbe niente di visibile.
    stato: (history.state||{}).view,
  }));
  ok('la X chiude e rimette la barra',
     !dopoX.pannello && dopoX.barra !== 'none', dopoX);
  ok('e non lascia il pannello nella cronologia', dopoX.stato !== 'settings', dopoX);

  sezione('le Statistiche sono uscite dalla barra e stanno qui');
  // La barra in fondo e' passata a cinque tondi con la casa al centro, e le
  // statistiche — che si guardano ogni tanto, non ogni giorno — hanno lasciato
  // il posto. Se il pannello non le portasse da nessuna parte, sarebbero
  // semplicemente sparite dall'app.
  await apri();
  const voce = await page.evaluate(()=>{
    const b = document.querySelector('.settings-vai');
    const r = b ? b.getBoundingClientRect() : null;
    return { c1e: !!b, testo: b ? b.textContent.trim() : null,
             alto: r ? Math.round(r.height) : 0,
             primo: !!(b && b.closest('.settings-body').firstElementChild.contains(b)) };
  });
  ok('nel pannello c\'e\' la voce Statistiche',
     voce.c1e && /statistiche/i.test(voce.testo||''), voce);
  ok('sta in cima, prima di tutto il resto', voce.primo, voce);
  ok('ed e\' alta abbastanza da premerla', voce.alto >= 44, voce);

  const andata = await page.evaluate(async ()=>{
    document.querySelector('.settings-vai').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=>setTimeout(r,600));
    return {
      stats: document.getElementById('screen-stats').classList.contains('active'),
      pannello: document.getElementById('settings-panel').classList.contains('open'),
      barra: getComputedStyle(document.getElementById('dune-nav')).display,
    };
  });
  ok('toccandola si aprono le statistiche', andata.stats, andata);
  ok('e il pannello si chiude dietro di se\'', !andata.pannello, andata);
  ok('con la barra in fondo che torna al suo posto', andata.barra !== 'none', andata);

  // Le statistiche PRENDONO IL POSTO del pannello nella cronologia: Indietro
  // deve riportare alla home, non riaprire un pannello che si e' appena
  // chiuso — sarebbe un giro a vuoto.
  const indietro = await page.evaluate(async ()=>{
    history.back();
    await new Promise(r=>setTimeout(r,700));
    return { home: document.getElementById('screen-home').classList.contains('active'),
             pannello: document.getElementById('settings-panel').classList.contains('open'),
             stats: document.getElementById('screen-stats').classList.contains('active') };
  });
  ok('e Indietro riporta alla home', indietro.home && !indietro.stats, indietro);
  ok('senza far riapparire le impostazioni', !indietro.pannello, indietro);

  sezione('e in fondo restano cinque tondi, con la casa al centro');
  const barra = await page.evaluate(()=>{
    const items = document.querySelector('.dune-nav-items').getBoundingClientRect();
    const bt = Array.from(document.querySelectorAll('.dune-nav-items .dune-btn'));
    const casa = document.querySelector('.dune-btn-home').getBoundingClientRect();
    return {
      quanti: bt.length,
      etichette: bt.map(b=> b.getAttribute('aria-label')),
      scarto: Math.abs((casa.left + casa.width/2) - (items.left + items.width/2)),
      chiara: getComputedStyle(document.querySelector('.dune-btn-home')).backgroundColor,
    };
  });
  ok('i tondi sono cinque', barra.quanti === 5, barra);
  ok('e le statistiche non sono piu\' fra loro',
     !barra.etichette.includes('Statistiche'), barra.etichette);
  ok('la casa e\' quella di sempre, chiara come le altre',
     barra.chiara === 'rgb(255, 251, 242)', barra);
  ok('e cade sul centro della barra', barra.scarto < 6, barra);

  sezione('e su mobile il pannello si chiude tirandolo giu\', senza X');
  // Un foglio che sale dal basso si chiude tirandolo giu': e' il gesto che il
  // telefono ha gia' in testa. La X stava nell'angolo in alto a destra, cioe'
  // il punto piu' lontano dal pollice di chi tiene il telefono in una mano.
  await page.evaluate(()=> document.body.classList.add('is-touch'));
  await apri();
  // La sezione prima e' andata avanti e indietro nella cronologia, e un
  // popstate in ritardo chiuderebbe il pannello proprio mentre lo si sta
  // trascinando: la prova fallirebbe una volta ogni tanto raccontando un
  // difetto che non c'e'. Si aspetta che la cronologia si sia calmata.
  await page.waitForTimeout(500);
  const senzaX = await page.evaluate(()=>({
    x: getComputedStyle(document.querySelector('.settings-close')).display,
    maniglia: getComputedStyle(document.querySelector('.settings-handle')).height,
  }));
  ok('la X non c\'e\' piu\'', senzaX.x === 'none', senzaX);
  ok('e al suo posto c\'e\' la maniglia, marcata abbastanza da vedersi',
     parseFloat(senzaX.maniglia) >= 5, senzaX);

  // Il trascinamento vero: il foglio deve seguire il dito PRIMA di lasciarlo.
  const trascina = async (dy, passi = 6, pausa = 0)=> page.evaluate(async ([dy,passi,pausa])=>{
    const el = document.getElementById('settings-panel');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + 30;   // sulla testata
    const t = (cy)=> [new Touch({identifier:1, target:el, clientX:x, clientY:cy})];
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true, cancelable:true, touches:t(y), targetTouches:t(y), changedTouches:t(y)}));
    let seguito = 0;
    for(let i = 1; i <= passi; i++){
      const cy = y + dy * i / passi;
      el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true, cancelable:true, touches:t(cy), targetTouches:t(cy), changedTouches:t(cy)}));
      if(pausa) await new Promise(r=>setTimeout(r,pausa));
      const m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform || '');
      if(m) seguito = parseFloat(m[1]);
    }
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true, cancelable:true, touches:[], targetTouches:[], changedTouches:t(y + dy)}));
    return seguito;
  }, [dy,passi,pausa]);

  const corto = await trascina(40);
  await page.waitForTimeout(450);
  const dopoCorto = await page.evaluate(()=>({
    aperto: document.getElementById('settings-panel').classList.contains('open'),
    fermo: document.getElementById('settings-panel').style.transform,
  }));
  ok('il foglio segue il dito mentre lo tiri', corto > 20, corto);
  ok('ma un tiro corto non chiude niente', dopoCorto.aperto, dopoCorto);
  ok('e il foglio torna al suo posto, senza restare a mezz\'aria',
     !dopoCorto.fermo || /translateY\(0/.test(dopoCorto.fermo), dopoCorto);

  const lungo = await trascina(160);
  await page.waitForTimeout(700);
  const dopoLungo = await page.evaluate(()=>({
    aperto: document.getElementById('settings-panel').classList.contains('open'),
    velo: document.getElementById('settings-overlay').classList.contains('open'),
    barra: getComputedStyle(document.getElementById('dune-nav')).display,
    resti: document.getElementById('settings-panel').style.transform,
  }));
  ok('un tiro deciso lo chiude', !dopoLungo.aperto, dopoLungo);
  ok('col velo che se ne va insieme', !dopoLungo.velo, dopoLungo);
  ok('la barra in fondo torna al suo posto', dopoLungo.barra !== 'none', dopoLungo);
  // Se restasse una translateY addosso, il pannello riaprendosi partirebbe
  // storto: le prossime aperture devono ritrovarlo pulito.
  ok('e il foglio non si porta dietro il trascinamento', !dopoLungo.resti, dopoLungo);

  await apri();
  await page.waitForTimeout(400);   // il pannello sale in .35s: prima di allora si misura la corsa
  const riaperto = await page.evaluate(()=>({
    aperto: document.getElementById('settings-panel').classList.contains('open'),
    dove: document.getElementById('settings-panel').getBoundingClientRect().bottom,
    alto: window.innerHeight,
  }));
  ok('e riaprendolo sta di nuovo al suo posto',
     riaperto.aperto && Math.abs(riaperto.dove - riaperto.alto) < 4, riaperto);

  // Se la lista e' gia' scesa, il dito sta scorrendo: rubargli il gesto
  // vorrebbe dire chiudere il pannello mentre uno legge.
  const scorrendo = await page.evaluate(async ()=>{
    const el = document.getElementById('settings-panel');
    el.scrollTop = 60;
    if(el.scrollTop < 10) return { saltato:true };
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;   // in mezzo alla lista
    const t = (cy)=> [new Touch({identifier:1, target:el, clientX:x, clientY:cy})];
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true, cancelable:true, touches:t(y), targetTouches:t(y), changedTouches:t(y)}));
    for(let i=1;i<=6;i++){
      const cy = y + 200*i/6;
      el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true, cancelable:true, touches:t(cy), targetTouches:t(cy), changedTouches:t(cy)}));
    }
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true, cancelable:true, touches:[], targetTouches:[], changedTouches:t(y+200)}));
    await new Promise(r=>setTimeout(r,400));
    return { aperto: el.classList.contains('open'), mosso: el.style.transform };
  });
  if(scorrendo.saltato){
    ok('(il pannello ci sta tutto nello schermo: niente da scorrere)', true, scorrendo);
  } else {
    ok('con la lista gia\' scesa il dito scorre e basta',
       scorrendo.aperto && !scorrendo.mosso, scorrendo);
  }

  sezione('e chiudendolo col dito non lampeggia');
  // Il difetto raccontato cosi': "per un attimo, prima di sparire, fa uno
  // strano lampeggio". Era il foglio che tornava su a schermo intero per
  // qualche istante e poi ricadeva giu': gli stili messi dal dito venivano
  // tolti PRIMA che il pannello perdesse la classe che lo tiene aperto.
  // Qui si guarda il bordo alto del foglio ad ogni fotogramma: una volta
  // cominciata la discesa, non deve mai piu' risalire.
  await apri();
  await page.waitForTimeout(400);
  const corsa = await page.evaluate(async ()=>{
    const el = document.getElementById('settings-panel');
    el.scrollTop = 0;          // il gesto parte dal bordo alto della lista
    // LA CRONOLOGIA CON CALMA. La chiusura passa da history.back(), e quanto
    // ci mette a rispondere non lo decide l'app: qui sul computer risponde
    // entro il fotogramma, sul telefono ci mette molto di piu'. Il lampo si
    // vedeva proprio in quella finestra, quindi per provarlo la finestra si
    // allarga apposta — se no la prova direbbe "tutto a posto" su una
    // macchina veloce e non prenderebbe mai il difetto.
    const veroBack = history.back.bind(history);
    history.back = ()=> setTimeout(veroBack, 150);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + 30;
    const t = (cy)=> [new Touch({identifier:1, target:el, clientX:x, clientY:cy})];
    const posizioni = [];
    let attivo = true;
    const velo = document.getElementById('settings-overlay');
    const veli = [];
    const scoperti = [];
    const campiona = ()=>{
      if(!attivo) return;
      posizioni.push(Math.round(el.getBoundingClientRect().top));
      veli.push(parseFloat(getComputedStyle(velo).opacity));
      // Il fotogramma incriminato: il pannello e' ancora "aperto" (cioe' la
      // classe che lo tiene a schermo intero c'e') ma il foglio non ha piu'
      // addosso la posizione lasciata dal dito. In quell'istante il pannello
      // e' tornato su, ed e' esattamente quello che si vedeva lampeggiare.
      if(el.classList.contains('open') && !el.style.transform) scoperti.push(posizioni.length);
      requestAnimationFrame(campiona);
    };
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true, cancelable:true, touches:t(y), targetTouches:t(y), changedTouches:t(y)}));
    for(let i=1;i<=6;i++){
      const cy = y + 160*i/6;
      el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true, cancelable:true, touches:t(cy), targetTouches:t(cy), changedTouches:t(cy)}));
    }
    campiona();
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true, cancelable:true, touches:[], targetTouches:[], changedTouches:t(y+160)}));
    await new Promise(r=>setTimeout(r, 1100));
    attivo = false;
    history.back = veroBack;
    return { posizioni, veli, scoperti, alto: window.innerHeight,
             aperto: el.classList.contains('open') };
  });
  // Il fondo dello schermo e' la posizione "chiuso": una volta arrivati
  // almeno a meta' strada, tornare in cima e' il lampo.
  const meta = corsa.alto * 0.5;
  let sceso = false, risalito = false;
  for(const p of corsa.posizioni){
    if(p > meta) sceso = true;
    else if(sceso && p < corsa.alto * 0.25) risalito = true;
  }
  ok('il foglio scende e basta', sceso, corsa.posizioni.slice(0, 12));
  ok('senza mai tornare su a schermo intero per un fotogramma',
     !risalito, corsa.posizioni);
  ok('e alla fine il pannello e\' chiuso', !corsa.aperto, corsa.aperto);
  // IL LAMPO VERO ERA IL VELO. Sparito il foglio, il fondo scuro dietro
  // tornava opaco per un istante prima di dissolversi: si vedeva la schermata
  // sotto che si rabbuiava di colpo a pannello ormai chiuso.
  let sceso2 = false, tornato = false;
  for(const o of corsa.veli){
    if(o < 0.35) sceso2 = true;
    else if(sceso2 && o > 0.6) tornato = true;
  }
  ok('anche il fondo scuro si dissolve e basta', sceso2 && !tornato, corsa.veli);
  // E la causa, non solo l'effetto: quanto dura la chiusura dipende da quanto
  // ci mette la cronologia a rispondere — sul telefono molto piu' che qui —
  // quindi il lampo si vede o no a seconda della fortuna. Questo controllo
  // invece guarda la condizione che lo produce, e non dipende dai tempi.
  ok('e in nessun fotogramma il foglio resta aperto senza posizione',
     corsa.scoperti.length === 0, corsa.scoperti);

});
