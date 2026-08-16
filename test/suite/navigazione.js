// Navigazione — la barra-duna e il passaggio fra schermate
//
// L'unica suite che apre l'APP VERA invece di un banco: quello che si prova
// qui — chi nasconde e chi rimette la barra in fondo — vive proprio negli
// incastri fra i moduli, e un banco che li rimontasse a mano proverebbe una
// app che non esiste. Di finto c'e' solo l'SDK di Firebase, irraggiungibile
// dalle prove e comunque irrilevante per la navigazione.
const fs = require('fs');
const path = require('path');
const { suite } = require('../motore.js');

const SDK_FINTO = fs.readFileSync(path.join(__dirname, '..', 'finti', 'firebase-sdk.js'), 'utf8');

module.exports = () => suite("Navigazione — la barra in fondo fra una schermata e l'altra", {
  banco: '/index.html',
  pronto: ()=> !!document.querySelector('#screen-home'),
  prima: async (page)=>{
    await page.route('**://fonts.googleapis.com/**', r=> r.fulfill({status:200, contentType:'text/css', body:''}));
    await page.route('**://fonts.gstatic.com/**', r=> r.abort());
    await page.route('**://www.gstatic.com/firebasejs/**', r=> r.fulfill({
      status:200, contentType:'text/javascript', body: SDK_FINTO }));
  },
}, async ({ page, ok }) => {

  await page.waitForTimeout(1800);          // i moduli finiscono di montarsi
  await page.evaluate(()=> document.body.classList.add('is-touch'));

  const nascosta = ()=> page.evaluate(()=> document.getElementById('dune-nav').classList.contains('dune-hidden'));
  const vaiA = async (schermo)=>{
    await page.evaluate(s=>{
      document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
      document.getElementById(s).classList.add('active');
    }, schermo);
    await page.waitForTimeout(140);
  };
  // Riempie un contenitore e lo scorre, come farebbe un dito dentro un
  // progetto lungo.
  const scorri = async (selettore, quanto)=>{
    await page.evaluate(([sel, y])=>{
      const sc = document.querySelector(sel);
      sc.style.height = '400px'; sc.style.overflowY = 'auto';
      if(!sc.querySelector('.riempitivo')){
        const r = document.createElement('div');
        r.className = 'riempitivo'; r.style.height = '3000px';
        sc.appendChild(r);
      }
      sc.scrollTop = 0; sc.dispatchEvent(new Event('scroll'));
      sc.scrollTop = y; sc.dispatchEvent(new Event('scroll'));
    }, [selettore, quanto]);
    await page.waitForTimeout(120);
  };

  console.log('\n── all\'avvio la barra c\'e\' ──');
  ok('la barra e\' visibile sulla home', (await nascosta()) === false);

  console.log('\n── dentro un progetto, scorrendo, si toglie di mezzo ──');
  await vaiA('screen-project');
  await scorri('.proj-scroll', 600);
  ok('scorrendo in giu\' la barra si nasconde', (await nascosta()) === true);

  console.log('\n── ma tornando indietro deve ricomparire ──');
  // Il difetto segnalato: si entrava in un progetto, si scorreva, si tornava
  // alla home e la barra restava sparita. A rimetterla non ci pensava nessuno,
  // e la home non riceve nessun evento di scorrimento se non la si scorre.
  await vaiA('screen-home');
  ok('la barra e\' di nuovo li\'', (await nascosta()) === false);

  console.log('\n── e vale per ogni schermata, non solo per la home ──');
  for(const [dove, scroll] of [['screen-stats', '.stats-scroll'], ['screen-evening', '.evening-scroll']]){
    await vaiA('screen-project');
    await scorri('.proj-scroll', 600);
    if(await nascosta() === false) { ok('preparazione: la barra era nascosta prima di ' + dove, false); continue; }
    await vaiA(dove);
    ok('arrivando su ' + dove.replace('screen-','') + ' la barra c\'e\'', (await nascosta()) === false);
  }

  console.log('\n── scorrendo di nuovo in su torna comunque ──');
  await vaiA('screen-project');
  await scorri('.proj-scroll', 600);
  await page.evaluate(()=>{
    const sc = document.querySelector('.proj-scroll');
    sc.scrollTop = 200; sc.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(120);
  ok('scorrendo verso l\'alto la barra riappare', (await nascosta()) === false);
  console.log('\n── il passaggio giorno ↔ sera non e\' piu\' un lampo ──');
  // Non si prova "e' bello": si prova che fra le due schermate ci passa una
  // tenda, che lo scambio avviene MENTRE e' opaca (quindi non si vede), e che
  // alla fine se ne va da sola invece di restare li' a coprire tutto.
  await page.evaluate(()=>{
    document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));
    document.getElementById('screen-home').classList.add('active');
    window.__velo = [];
    const v = document.getElementById('velo-notte');
    // Si campiona l'opacita' vera calcolata dal browser, non la classe: e' la
    // sola cosa che dica se lo schermo era davvero coperto in quell'istante.
    window.__campiona = setInterval(()=>{
      window.__velo.push({
        t: Math.round(performance.now()),
        o: +getComputedStyle(v).opacity,
        sera: document.body.classList.contains('evening-mode'),
      });
    }, 25);
  });
  await page.evaluate(()=> window.enterEveningMode());
  await page.waitForTimeout(900);
  const campioni = await page.evaluate(()=>{ clearInterval(window.__campiona); return window.__velo; });

  const picco = Math.max(...campioni.map(c=>c.o));
  const primaSera = campioni.find(c=>c.sera);
  const ultimo = campioni[campioni.length - 1];
  ok('la tenda si accende davvero', picco > 0.9, picco);
  ok('lo scambio avviene al buio, non a vista',
     !!primaSera && primaSera.o > 0.9, primaSera);
  ok('e alla fine la tenda se n\'e\' andata', ultimo && ultimo.o < 0.02, ultimo);
  ok('non e\' un lampo: ci mette piu\' di due fotogrammi',
     campioni.filter(c=>c.o > 0.02 && c.o < 0.98).length >= 2,
     campioni.map(c=>c.o));
  ok('ma nemmeno una tenda lenta: sotto il secondo',
     (()=>{ const su = campioni.filter(c=>c.o > 0.02);
            return su.length && (su[su.length-1].t - su[0].t) < 1000; })(),
     campioni.map(c=>[c.t, c.o]));

  console.log('\n── e la tenda non resta mai a coprire lo schermo ──');
  const dopo = await page.evaluate(()=>{
    const v = document.getElementById('velo-notte');
    return { opacita: +getComputedStyle(v).opacity, tocchi: getComputedStyle(v).pointerEvents };
  });
  ok('a riposo e\' trasparente e non intercetta i tocchi',
     dopo.opacita < 0.02 && dopo.tocchi === 'none', dopo);

  console.log('\n── un menu contestuale non sopravvive a un cambio di schermata ──');
  // Il tasto Indietro del telefono non e' un tocco: premendolo con un menu
  // aperto ci si ritrovava il "Rinomina / Elimina" di una cartella appoggiato
  // sopra le schede della home, ancora funzionante e riferito a una cosa che
  // non era piu' a schermo.
  const sopravvive = await page.evaluate(async ()=>{
    const d = await import('/js/dialogs.js');
    d.actionMenu(document.querySelector('.dune-nav') || document.body, [
      { label:'Rinomina', icon:'rinomina', onSelect(){} },
      { label:'Elimina', icon:'elimina', danger:true, onSelect(){} },
    ]);
    await new Promise(r=>setTimeout(r,120));
    const aperto = !!document.querySelector('.ink-action-menu');
    window.openStats();                       // passa da hideAllScreens
    await new Promise(r=>setTimeout(r,250));
    return { aperto, dopo: !!document.querySelector('.ink-action-menu') };
  });
  ok('il menu si apre', sopravvive.aperto, sopravvive);
  ok('e cambiando schermata se ne va', !sopravvive.dopo, sopravvive);

  console.log('\n── cinque tondi, e la casa al centro esatto ──');
  // Erano sei e la casa terza: con un numero pari non esiste un centro, e il
  // tasto che si preme piu' spesso sembrava uno dei tanti. Qui si misura la
  // posizione vera del tondo rispetto alla capsula, non l'ordine nel markup.
  const fila = await page.evaluate(()=>{
    const barra = document.querySelector('.dune-nav-items').getBoundingClientRect();
    const bt = Array.from(document.querySelectorAll('.dune-nav-items .dune-btn'));
    const casa = document.querySelector('.dune-btn-home').getBoundingClientRect();
    return {
      quanti: bt.length,
      etichette: bt.map(b=> b.getAttribute('aria-label')),
      scarto: Math.abs((casa.left + casa.width/2) - (barra.left + barra.width/2)),
      larga: Math.round(casa.width),
      altre: bt.filter(b=> !b.classList.contains('dune-btn-home'))
               .map(b=> Math.round(b.getBoundingClientRect().width)),
    };
  });
  ok('i tondi sono cinque', fila.quanti === 5, fila);
  ok('nell\'ordine chiesto: statistiche, archivio, casa, idee, impostazioni',
     fila.etichette.join('|') === 'Statistiche|References|Home|Idee|Impostazioni', fila.etichette);
  ok('la casa cade sul centro della capsula', fila.scarto < 2, fila);
  ok('ed e\' piu\' grande delle altre',
     fila.altre.every(w=> w < fila.larga), fila);

  console.log('\n── la luna e\' uscita dalla barra, non dall\'app ──');
  // Toglierla dalla barra senza darle un altro posto avrebbe voluto dire
  // perdere la modalita' sera su telefono: ora e' il disco scuro in basso a
  // destra nella home, dove sta anche la nuvola di Drive nell'archivio.
  await vaiA('screen-home');
  const luna = await page.evaluate(()=>{
    const b = document.getElementById('btn-evening');
    const r = b.getBoundingClientRect();
    const capsula = document.querySelector('.dune-nav-items').getBoundingClientRect();
    const sopra = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    return {
      visibile: getComputedStyle(b).display !== 'none' && r.width > 0,
      aDestra: r.left > innerWidth/2,
      sopraLaBarra: r.bottom <= capsula.top,
      tocco: !!(sopra && (sopra === b || b.contains(sopra))),
      bersaglio: Math.round(r.width),
    };
  });
  ok('sulla home la luna c\'e\'', luna.visibile, luna);
  ok('sta in basso a destra, sopra la barra', luna.aDestra && luna.sopraLaBarra, luna);
  ok('e il dito ci arriva davvero', luna.tocco && luna.bersaglio >= 44, luna);

  console.log('\n── e di sera il sole per uscire non finisce sotto la capsula ──');
  // Finche' la luna stava nella barra, era lei a riportare al giorno. Uscita
  // di li', l'unica uscita e' il sole della schermata sera: se resta nascosto
  // (era hidden su touch) o finisce sotto la barra, dalla sera non si esce.
  const sole = await page.evaluate(async ()=>{
    window.toggleEvening();
    await new Promise(r=>setTimeout(r,700));
    const e = document.getElementById('evening-exit');
    const r = e.getBoundingClientRect();
    const cap = document.querySelector('.dune-nav-items').getBoundingClientRect();
    const sopra = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
    const esito = {
      sera: document.body.classList.contains('evening-mode'),
      visibile: getComputedStyle(e).display !== 'none' && r.width > 0,
      sopraLaBarra: r.bottom <= cap.top,
      tocco: !!(sopra && (sopra === e || e.contains(sopra))),
    };
    window.toggleEvening();
    await new Promise(r=>setTimeout(r,700));
    esito.tornati = !document.body.classList.contains('evening-mode');
    return esito;
  });
  ok('nella sera il sole si vede', sole.sera && sole.visibile, sole);
  ok('sta sopra la capsula e si puo\' premere',
     sole.sopraLaBarra && sole.tocco, sole);
  ok('e riporta al giorno', sole.tornati, sole);

});
