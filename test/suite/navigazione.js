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
                    stats:'.stats-header', scene:'.scene-header',
                    progetto:'.proj-header' };
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
  const chiavi = ['home','refs','idee','stats','scene','progetto'].filter(k=> testate[k]);
  const uguali = campo => new Set(chiavi.map(k=> testate[k][campo])).size === 1;
  ok('stessa imbottitura su tutte', uguali('imbottitura'), testate);
  ok('stessi angoli in basso', uguali('angoli'), testate);
  ok('stesso filo colorato sotto', uguali('filo'), testate);
  ok('e il marchio comincia sempre alla stessa distanza dal bordo',
     new Set(testate.marchi.filter(x=> x !== null)).size === 1, testate.marchi);

  console.log('\n── e da dentro un progetto la via di casa non sparisce ──');
  // ERA L'UNICA SCHERMATA SENZA MARCHIO: si apriva un progetto e "Inkflow" non
  // c'era piu', quando dappertutto altrove basta toccarlo per tornare a casa.
  const dentroUnProgetto = await page.evaluate(()=>{
    const t = document.querySelector('#screen-project .section-title');
    const sub = document.querySelector('#screen-project .section-sub');
    return {
      c: !!t,
      dice: t ? t.textContent.trim().startsWith('Inkflow') : false,
      sotto: sub ? sub.textContent.trim() : null,
      tocca: t ? (t.getAttribute('onclick') || '') : '',
      misuraMarchio: t ? parseFloat(getComputedStyle(t).fontSize) : 0,
      misuraProgetto: parseFloat(getComputedStyle(document.getElementById('proj-title')).fontSize),
      // Il marchio e' grande come nelle altre sezioni: passando da References a
      // un progetto non deve cambiare misura sotto gli occhi.
      misuraAltrove: parseFloat(getComputedStyle(document.querySelector('.refs-header .section-title')).fontSize),
      // E il progetto e' una targa staccata sotto, col filo d'oro sul fianco.
      targa: !!document.querySelector('.proj-targa'),
      // L'avanzamento sta dentro la targa, non piu' in una fascia sua.
      avanzDentro: !!document.querySelector('.proj-targa .prog-bar-wrap'),
    };
  });
  ok('il marchio c\'e\' anche nel progetto', dentroUnProgetto.c && dentroUnProgetto.dice, dentroUnProgetto);
  ok('e sotto dice "projects"', dentroUnProgetto.sotto === 'projects', dentroUnProgetto);
  ok('toccandolo si torna a casa',
     /goHomeFromLogo/.test(dentroUnProgetto.tocca), dentroUnProgetto);
  ok('ed e\' grande come nelle altre sezioni',
     dentroUnProgetto.misuraMarchio === dentroUnProgetto.misuraAltrove, dentroUnProgetto);
  ok('il progetto e\' una targa staccata sotto', dentroUnProgetto.targa, dentroUnProgetto);
  ok('con dentro l\'avanzamento', dentroUnProgetto.avanzDentro, dentroUnProgetto);
  // Trentadue contro quarantasei: due titoli quasi uguali uno sull'altro si
  // contenderebbero la pagina, e non si leggerebbe piu' chi contiene chi.
  ok('e il nome del lavoro sta sotto al marchio, non alla pari',
     dentroUnProgetto.misuraProgetto < dentroUnProgetto.misuraMarchio, dentroUnProgetto);

  console.log('\n── dentro un progetto scorre via il marchio, non la targa ──');
  // Sono cento pixel buoni di intestazione: quello che serve sotto gli occhi
  // mentre si lavora e' il nome del lavoro, non il nome dell'app.
  const scorrendo = await page.evaluate(async ()=>{
    document.querySelectorAll('.screen').forEach(s=> s.classList.remove('active'));
    document.getElementById('screen-project').classList.add('active');
    const sc = document.querySelector('.proj-scroll');
    const dove = ()=>({
      marchio: Math.round(document.querySelector('.proj-header').getBoundingClientRect().top),
      targa: Math.round(document.querySelector('.proj-targa').getBoundingClientRect().top),
    });
    sc.scrollTop = 0;
    await new Promise(r=> setTimeout(r, 120));
    const fermo = dove();
    sc.scrollTop = 400;
    await new Promise(r=> setTimeout(r, 200));
    const scorso = dove();
    // La targa e' opaca: il contenuto le passa dietro, e una scheda anche solo
    // un po' trasparente li' diventerebbe illeggibile.
    const sfondo = getComputedStyle(document.querySelector('.proj-targa')).backgroundColor;
    sc.scrollTop = 0;
    return { fermo, scorso, sfondo, quantoHaScorso: 400 };
  });
  ok('fermi, il marchio e\' in cima', scorrendo.fermo.marchio === 0, scorrendo);
  ok('scorrendo, il marchio se ne va davvero',
     scorrendo.scorso.marchio <= -300, scorrendo);
  ok('ma la targa resta a schermo', scorrendo.scorso.targa >= 0, scorrendo);
  // A filo del bordo: con una fessura sopra si vedeva scorrere il contenuto
  // dietro, una striscia in movimento incollata alla scheda ferma.
  ok('agganciata a filo, senza fessure sopra', scorrendo.scorso.targa === 0, scorrendo);
  ok('ed e\' opaca, perche\' il contenuto le passa dietro',
     !/rgba\([^)]*,\s*0(\.\d+)?\)/.test(scorrendo.sfondo), scorrendo);

  console.log('\n── i pulsanti si chiamano come le sezioni che aprono ──');
  // Passando il mouse sopra i tondi si leggeva "References" e "Scene", ma le
  // sezioni si chiamano "visual archive" e "scenes" — il nome scritto in cima
  // alla schermata che si apre. Due nomi per la stessa stanza.
  const nomi = await page.evaluate(()=>{
    const sub = id =>{
      const el = document.querySelector('#' + id + ' .section-sub');
      return el ? el.textContent.trim() : null;
    };
    const bottoni = Array.from(document.querySelectorAll('.dune-btn, .home-fab-row .home-fab'));
    return {
      // Ogni pulsante di navigazione ha un tooltip: senza, col mouse non si
      // sa cosa sia un glifo finche' non lo si preme.
      senzaTitle: bottoni.filter(b=> !b.getAttribute('title'))
                         .map(b=> b.getAttribute('aria-label') || '?'),
      // E dove la sezione ha un nome scritto, il tooltip e' quello.
      refs: bottoni.filter(b=> /openRefsScreen/.test(b.getAttribute('onclick')||''))
                   .map(b=> b.getAttribute('title')),
      scene: bottoni.filter(b=> /openScene/.test(b.getAttribute('onclick')||''))
                    .map(b=> b.getAttribute('title')),
      nomeRefs: sub('screen-refs'), nomeScene: sub('screen-scene'),
    };
  });
  ok('ogni pulsante ha un tooltip', nomi.senzaTitle.length === 0, nomi);
  ok('References si chiama come la sua sezione',
     nomi.refs.length === 2 && nomi.refs.every(t=> t === nomi.nomeRefs), nomi);
  ok('e le Scene pure',
     nomi.scene.length === 2 && nomi.scene.every(t=> t === nomi.nomeScene), nomi);

  console.log('\n── e col mouse i pulsanti si vedono da ogni schermata ──');
  // Stavano dentro #screen-home: da References o dalle Scene, col mouse, non
  // c'era piu' un modo di spostarsi che non fosse il tasto Indietro.
  // Il resto della suite gira a misura di telefono, dove comanda la barra-duna:
  // qui serve una finestra da mouse, e il rilevamento del tocco si ricalcola
  // con 200ms di ritardo (vedi main.js).
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.waitForTimeout(400);
  const dovunque = [];
  for(const [nome, id] of [['home','screen-home'], ['references','screen-refs'],
                           ['scene','screen-scene'], ['progetto','screen-project']]){
    dovunque.push(await page.evaluate((arg)=>{
      document.querySelectorAll('.screen').forEach(s=> s.classList.remove('active'));
      document.getElementById(arg.id).classList.add('active');
      const row = document.querySelector('.home-fab-row');
      const r = row.getBoundingClientRect();
      return { nome: arg.nome,
        visibile: getComputedStyle(row).display !== 'none' && r.width > 0,
        tondi: Array.from(row.querySelectorAll('.home-fab')).filter(x=> x.getBoundingClientRect().width > 0).length,
        // Centrata in fondo, come la barra-duna sul telefono.
        centrata: Math.abs((r.left + r.width/2) - window.innerWidth/2) < 2 };
    }, { nome, id }));
  }
  ok('la fila si vede su tutte le schermate', dovunque.every(d=> d.visibile), dovunque);
  ok('con tutti e quattro i tondi', dovunque.every(d=> d.tondi === 4), dovunque);
  ok('e sempre centrata in fondo', dovunque.every(d=> d.centrata), dovunque);

  // E I TONDI STANNO SU UN PIANO D'APPOGGIO. Col mouse galleggiavano nel vuoto
  // in fondo alla pagina — quattro cose sparse invece di una barra sola —
  // mentre sul telefono hanno la barra-duna sotto. La pastiglia e' sabbia piu'
  // scura del fondo pagina e un filo trasparente, cosi' il contenuto che le
  // passa sotto si intravede senza disturbare.
  const pastiglia = await page.evaluate(()=>{
    const row = document.querySelector('.home-fab-row');
    const st = getComputedStyle(row);
    const r = row.getBoundingClientRect();
    const primo = row.querySelector('.home-fab').getBoundingClientRect();
    const ultimo = Array.from(row.querySelectorAll('.home-fab')).pop().getBoundingClientRect();
    return {
      fondo: st.backgroundColor,
      raggio: parseFloat(st.borderTopLeftRadius),
      // Larga quanto i tondi piu' un po' d'aria, non quanto lo schermo: una
      // pastiglia da bordo a bordo sarebbe una fascia, non una barra.
      larga: Math.round(r.width),
      schermo: window.innerWidth,
      // I tondi devono starci DENTRO, con del margine da tutti i lati.
      ariaSinistra: Math.round(primo.left - r.left),
      ariaDestra: Math.round(r.right - ultimo.right),
      ariaSopra: Math.round(primo.top - r.top),
    };
  });
  // Trasparente: si legge dall'alfa, che dev'esserci e non essere 1.
  const alfa = (pastiglia.fondo.match(/rgba?\([^)]*,\s*([\d.]+)\)/)||[])[1];
  ok('la fila ha un fondo suo', pastiglia.fondo !== 'rgba(0, 0, 0, 0)', pastiglia);
  ok('ed e\' leggermente trasparente', alfa && parseFloat(alfa) > 0 && parseFloat(alfa) < 1, { alfa, ...pastiglia });
  ok('e' + '\' una pastiglia, non un rettangolo', pastiglia.raggio >= 30, pastiglia);
  ok('larga quanto i tondi, non quanto lo schermo',
     pastiglia.larga < pastiglia.schermo * 0.75, pastiglia);
  ok('coi tondi dentro e un po\' d\'aria attorno',
     pastiglia.ariaSinistra > 4 && pastiglia.ariaDestra > 4 && pastiglia.ariaSopra > 4, pastiglia);

  // Di sera resta il solo sole, e in mezzo: i comandi si riducono a uno — si
  // torna al giorno — e in un angolo lo si cercava.
  const diSera = await page.evaluate(()=>{
    document.querySelectorAll('.screen').forEach(s=> s.classList.remove('active'));
    document.getElementById('screen-evening').classList.add('active');
    document.body.classList.add('evening-mode');
    const row = document.querySelector('.home-fab-row');
    const sole = document.getElementById('evening-exit');
    const sr = sole.getBoundingClientRect();
    const out = {
      filaVia: getComputedStyle(row).display === 'none',
      sole: getComputedStyle(sole).display !== 'none' && sr.width > 0,
      centroSole: Math.round(sr.left + sr.width/2),
      meta: Math.round(window.innerWidth/2),
    };
    document.body.classList.remove('evening-mode');
    return out;
  });
  ok('di sera la fila si toglie', diSera.filaVia, diSera);
  ok('e resta il solo sole', diSera.sole, diSera);
  ok('in basso al centro, non in un angolo',
     Math.abs(diSera.centroSole - diSera.meta) < 2, diSera);

  // Col pannello Impostazioni aperto la fila sparisce: e' un foglio che sale
  // dal fondo, e i tondi gli finirebbero sopra gli ultimi comandi.
  const conImpostazioni = await page.evaluate(()=>{
    document.body.classList.add('settings-open');
    const via = getComputedStyle(document.querySelector('.home-fab-row')).display === 'none';
    document.body.classList.remove('settings-open');
    return via;
  });
  ok('e con le Impostazioni aperte pure', conImpostazioni, conImpostazioni);

  await page.evaluate(()=> window.goHome());
  await page.waitForTimeout(400);

  console.log('\n── e sotto gli angoli dell\'intestazione il fondo e\' lo stesso ──');
  // Le intestazioni sono arrotondate in basso, e dietro i due angoli si vedeva
  // il fondo del body — sabbia chiara — invece di quello della schermata: due
  // tacche piu' chiare ai lati, che si notano proprio perche' stanno ai bordi.
  const fondi = await page.evaluate(()=>{
    const quali = ['screen-scene','screen-idee','screen-refs','screen-stats','screen-project'];
    const scroll = { 'screen-scene':'.scene-scroll', 'screen-idee':'.idee-scroll',
                     'screen-refs':'.refs-scroll', 'screen-stats':'.stats-scroll',
                     'screen-project':'.proj-scroll' };
    return quali.map(id=>{
      const sc = document.getElementById(id);
      const dentro = sc && sc.querySelector(scroll[id]);
      return {
        id,
        schermata: sc ? getComputedStyle(sc).backgroundColor : null,
        // Il fondo dello scroll puo' avere anche la grana: qui interessa il colore.
        contenuto: dentro ? getComputedStyle(dentro).backgroundColor : null,
      };
    });
  });
  ok('la schermata ha lo stesso fondo del suo contenuto',
     fondi.every(f=> f.schermata && f.contenuto && f.schermata === f.contenuto), fondi);
  // E DENTRO REFERENCES, LE STRISCE FISSE. Fra l'intestazione e la griglia ce ne
  // sono quattro — briciole, Artists/References, ricerca cartelle, barra della
  // scelta multipla — tutte fuori dallo scroll. Erano sabbia chiaro su fondo
  // carta: una fascia piu' chiara dietro l'interruttore, con lo stacco netto
  // sopra e sotto, e agli angoli tondi dell'intestazione un triangolino piu'
  // scuro. L'unico punto della schermata dove il fondo cambiava senza motivo.
  const strisce = await page.evaluate(()=>{
    const sotto = getComputedStyle(document.querySelector('.refs-scroll')).backgroundColor;
    const quali = ['.refs-breadcrumb','.refs-axis','.refs-tabs','#refs-folder-toolbar','.refs-scelta'];
    return quali.map(sel=>{
      const el = document.querySelector(sel);
      return { sel, fondo: el ? getComputedStyle(el).backgroundColor : null, sotto };
    });
  });
  ok('in References le strisce fisse hanno il fondo della pagina',
     strisce.every(x=> x.fondo === x.sotto), strisce);

  ok('e nessuna resta trasparente sul body',
     fondi.every(f=> f.schermata && !/rgba\(0, 0, 0, 0\)/.test(f.schermata)), fondi);

  console.log('\n── il quarto tondo porta alle Scene, e il taccuino e\' sceso in Impostazioni ──');
  // I cinque tondi sono per quello che si tocca ogni volta che si apre l'app.
  // Il taccuino si apre quando passa un pensiero — di rado, e da fermi — e per
  // questo e' sceso dov'erano gia' andate le Statistiche.
  const quarto = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.dune-btn'));
    return {
      etichette: b.map(x=> x.getAttribute('aria-label')),
      scene: b.some(x=> x.getAttribute('aria-label') === 'scenes'),
      idee: b.some(x=> x.getAttribute('aria-label') === 'ideas'),
      quanti: b.length,
    };
  });
  ok('nella barra c\'e\' Scene', quarto.scene, quarto);
  // IL GLIFO E' UNA TAVOLA, non l'icona "griglia" che mettono tutti: nella
  // barra c'e' gia' un rettangolo con dentro un disegno (References), e due
  // rettangoli generici accanto si scambiano. Una gabbia da fumetto invece dice
  // di cosa parla la sezione — ed e' quello che la Board mostra.
  const glifo = await page.evaluate(()=>{
    const b = document.querySelector('.dune-btn[aria-label="scenes"]');
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

  // LA FILA DEL MOUSE DEVE DIRE LE STESSE COSE. La barra-duna e' solo touch:
  // col mouse la navigazione sono i tondi in cima alla home, ed erano rimasti
  // indietro — tenevano ancora le Statistiche e non avevano le Scene. Dal
  // browser la sezione nuova semplicemente non esisteva.
  const colMouse = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.home-fab-row .home-fab'));
    // Sta FUORI dalle schermate, come la barra-duna: dentro #screen-home
    // spariva appena si andava da un'altra parte.
    const fuori = !document.getElementById('screen-home').contains(document.querySelector('.home-fab-row'));
    return {
      etichette: b.map(x=> x.getAttribute('aria-label')),
      scene: b.some(x=> x.getAttribute('aria-label') === 'scenes'),
      stats: b.some(x=> x.getAttribute('aria-label') === 'stats'),
      fuori,
    };
  });
  ok('col mouse le Scene ci sono', colMouse.scene, colMouse);
  ok('e la fila vive fuori dalla home, come la barra-duna', colMouse.fuori, colMouse);
  // Le Statistiche si guardano ogni tanto, non ogni giorno: stanno in cima
  // alle Impostazioni, sul telefono come col mouse.
  ok('e le Statistiche sono uscite anche da li\'', !colMouse.stats, colMouse);
  // Le stesse quattro destinazioni, nello stesso ordine. La barra-duna ha in
  // piu' la casa al centro, che col mouse e' il marchio in cima.
  ok('e le due navigazioni portano nelle stesse stanze',
     colMouse.etichette.join(' | ')
       === quarto.etichette.filter(x=> x !== 'home').join(' | '),
     { colMouse: colMouse.etichette, barra: quarto.etichette });

  await page.evaluate(()=> document.querySelector('.dune-btn[aria-label="scenes"]').click());
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


  console.log('\n── e la capsula del cronometro non si siede sopra i comandi ──');
  // COL MOUSE LA CAPSULA SCENDEVA AL CENTRO IN FONDO, dove la barra-duna non
  // c'e'. Ma li' c'e' la fila di tondi della home — sera, References, Scene,
  // Impostazioni — che a finestra bassa arriva proprio in fondo: misurato a
  // 1100x760, capsula 448-652 orizzontale e 694-740 verticale, tondi 430-670 e
  // 688-736. Sovrapposti in pieno, coi pulsanti sotto irraggiungibili.
  // Si torna alla home: i tondi sono suoi, e le prove qui sopra hanno lasciato
  // aperta un'altra schermata.
  await page.evaluate(()=> window.goHome());
  await page.waitForTimeout(500);
  const sovrapposizioni = [];
  for(const vp of [{width:1100,height:760},{width:900,height:640},{width:1400,height:900}]){
    await page.setViewportSize(vp);
    await page.waitForTimeout(350);         // il rilevamento del tocco si ricalcola
    const r = await page.evaluate((misura)=>{
      const caps = document.getElementById('tempo-capsula');
      caps.hidden = false;
      const c = caps.getBoundingClientRect();
      const coperti = Array.from(document.querySelectorAll('.home-fab, .home-new-add, button, a'))
        .filter(x=> !caps.contains(x))
        .filter(x=>{
          const q = x.getBoundingClientRect();
          return q.width > 0 && q.height > 0 &&
            !(q.right < c.left || q.left > c.right || q.bottom < c.top || q.top > c.bottom);
        })
        .map(x=> x.id || String(x.className).slice(0, 30));
      caps.hidden = true;
      return {
        misura,
        coperti,
        isTouch: document.body.classList.contains('is-touch'),
        capsula: [Math.round(c.left), Math.round(c.right), Math.round(c.top), Math.round(c.bottom)],
        fabVisibili: Array.from(document.querySelectorAll('.home-fab')).filter(x=> x.getBoundingClientRect().width > 0).length,
        // E deve restare dentro la finestra: spingerla a destra senza guardare
        // la porterebbe fuori dal bordo sugli schermi stretti.
        dentro: c.right <= window.innerWidth + 1 && c.left >= -1 && c.bottom <= window.innerHeight + 1,
      };
    }, vp.width + 'x' + vp.height);
    sovrapposizioni.push(r);
  }
  ok('col mouse la capsula non copre nessun comando',
     sovrapposizioni.every(r=> r.coperti.length === 0), sovrapposizioni);
  ok('e resta dentro la finestra a ogni misura',
     sovrapposizioni.every(r=> r.dentro), sovrapposizioni);

});
