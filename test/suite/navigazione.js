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

  console.log('\n── tutte le intestazioni sono la STESSA intestazione ──');
  // Il marchio "Inkflow" sta nello stesso punto in tutte le schermate, quindi
  // passando dall'una all'altra non deve muoversi di un pixel. Ideas per un
  // po' e' stata l'eccezione — 22px di imbottitura invece di 24 e il filo di
  // sotto d'oro invece che azzurro — e a occhio si vedeva solo cambiando
  // schermata: il titolo scattava di lato. Qui si misurano tutte insieme.
  const testate = await page.evaluate(()=>{
    const quali = { home:'.home-header', refs:'.refs-header', idee:'.idee-header',
                    stats:'.stats-header', scene:'.scene-header' };
    const esito = {};
    for(const [nome, sel] of Object.entries(quali)){
      const el = document.querySelector(sel);
      if(!el){ esito[nome] = null; continue; }
      const s = getComputedStyle(el);
      const t = document.createElement('div');
      esito[nome] = {
        imbottitura: s.paddingTop + '/' + s.paddingRight + '/' + s.paddingBottom + '/' + s.paddingLeft,
        angoli: s.borderRadius,
        filo: s.borderBottomWidth + ' ' + s.borderBottomColor,
      };
    }
    // Dove comincia davvero la scritta "Inkflow", schermata per schermata.
    esito.marchi = Object.values(quali).map(sel=>{
      const t = document.querySelector(sel + ' .section-title');
      if(!t) return null;
      // Le schermate non attive sono nascoste: si misura l'imbottitura del
      // contenitore, che e' quella che sposta il titolo.
      return parseFloat(getComputedStyle(t.parentElement).paddingLeft);
    });
    return esito;
  });
  const chiavi = ['home','refs','idee','stats','scene'].filter(k=> testate[k]);
  const uguali = campo => new Set(chiavi.map(k=> testate[k][campo])).size === 1;
  ok('stessa imbottitura su tutte', uguali('imbottitura'), testate);
  ok('stessi angoli in basso', uguali('angoli'), testate);
  ok('stesso filo colorato sotto', uguali('filo'), testate);
  ok('e il marchio comincia sempre alla stessa distanza dal bordo',
     new Set(testate.marchi.filter(x=> x !== null)).size === 1, testate.marchi);

  console.log('\n── il quarto tondo porta alle Scene, e il taccuino e\' sceso in Impostazioni ──');
  // I cinque tondi sono per quello che si tocca ogni volta che si apre l'app.
  // Il taccuino si apre quando passa un pensiero — di rado, e da fermi — e per
  // questo e' sceso dov'erano gia' andate le Statistiche.
  const quarto = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.dune-btn'));
    return {
      etichette: b.map(x=> x.getAttribute('aria-label')),
      scene: b.some(x=> x.getAttribute('aria-label') === 'Scene'),
      idee: b.some(x=> x.getAttribute('aria-label') === 'Idee'),
      quanti: b.length,
    };
  });
  ok('nella barra c\'e\' Scene', quarto.scene, quarto);
  // IL GLIFO E' UNA TAVOLA, non l'icona "griglia" che mettono tutti: nella
  // barra c'e' gia' un rettangolo con dentro un disegno (References), e due
  // rettangoli generici accanto si scambiano. Una gabbia da fumetto invece dice
  // di cosa parla la sezione — ed e' quello che la Board mostra.
  const glifo = await page.evaluate(()=>{
    const b = document.querySelector('.dune-btn[aria-label="Scene"]');
    const svg = b.querySelector('svg');
    return {
      rettangoli: svg.querySelectorAll('rect').length,
      divisioni: svg.querySelectorAll('path').length,
      // Grande come gli altri glifi della barra: uno diverso si nota subito.
      lato: svg.getAttribute('width'),
    };
  });
  ok('il glifo e\' una gabbia: una cornice e due divisioni',
     glifo.rettangoli === 1 && glifo.divisioni === 2, glifo);
  ok('e non quattro quadratini staccati', glifo.rettangoli < 4, glifo);
  ok('grande come gli altri', glifo.lato === '18', glifo);
  ok('e Idee non c\'e\' piu\'', !quarto.idee, quarto);
  ok('i tondi restano cinque', quarto.quanti === 5, quarto);

  await page.evaluate(()=> document.querySelector('.dune-btn[aria-label="Scene"]').click());
  await page.waitForTimeout(600);
  const suScene = await page.evaluate(()=>({
    attiva: document.getElementById('screen-scene').classList.contains('active'),
    // Un tap dalla home e si e' gia' davanti al pulsante per cominciare.
    comincia: !!document.getElementById('scene-nuova'),
  }));
  ok('un tocco solo e si e\' nelle Scene', suScene.attiva, suScene);
  ok('col modo di cominciare gia\' a schermo', suScene.comincia, suScene);

  const daImpostazioni = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.settings-vai'));
    return b.map(x=> x.textContent.replace(/[›\s]+/g,' ').trim());
  });
  ok('e le Idee si aprono dalle Impostazioni, come le Statistiche',
     daImpostazioni.some(t=> /idee/i.test(t)) && daImpostazioni.some(t=> /statistiche/i.test(t)),
     daImpostazioni);
  await page.evaluate(()=> window.vaiAIdee());
  await page.waitForTimeout(600);
  ok('e ci portano davvero', await page.evaluate(()=>
     document.getElementById('screen-idee').classList.contains('active')), null);

});
