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
    const m = await import('/js/notifications.js');
    m.updateReminderStatus();
    const el = document.getElementById('reminder-status');
    return { testo: el.textContent, altezza: Math.round(el.getBoundingClientRect().height) };
  });
  ok('e nemmeno a promemoria acceso, se va tutto bene',
     acceso.testo === '' && acceso.altezza === 0, acceso);

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

});
