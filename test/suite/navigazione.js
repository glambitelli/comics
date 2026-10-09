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
                    stats:'.stats-header', projects:'.projects-header',
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
  const chiavi = ['home','refs','idee','stats','projects','progetto'].filter(k=> testate[k]);
  const uguali = campo => new Set(chiavi.map(k=> testate[k][campo])).size === 1;
  ok('stessa imbottitura su tutte', uguali('imbottitura'), testate);
  // LA HOME E' L'ECCEZIONE, dal 21 settembre 2026, e lo e' per un motivo: non
  // e' un foglio di carta come le altre, e' un tavolo di legno (vedi
  // css/scrivania.css). Una lastra bianca arrotondata appoggiata sul legno
  // sarebbe il pezzo di un'altra app. Quello che questa prova doveva
  // garantire pero' regge lo stesso, ed e' il motivo per cui e' nata: il
  // marchio non SALTA passando da una schermata all'altra, perche'
  // l'imbottitura resta identica su tutte e sei — lo controlla la riga qui
  // sopra. Gli angoli e il filo colorato restano uguali fra le cinque
  // schermate di carta.
  const carta = chiavi.filter(k=> k !== 'home');
  const ugualiCarta = campo => new Set(carta.map(k=> testate[k][campo])).size === 1;
  ok('stessi angoli in basso, fra le schermate di carta', ugualiCarta('angoli'), testate);
  ok('stesso filo colorato sotto', ugualiCarta('filo'), testate);
  ok('e la home invece non e\' un foglio: niente lastra bianca sul legno',
     testate.home.angoli === '0px' && /^0px/.test(testate.home.filo), testate.home);
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

  console.log('\n── dentro un progetto resta il marchio, e la targa scorre via ──');
  // Ferma in cima c'e' la STESSA intestazione di ogni altra schermata. Per un
  // po' era il contrario — il marchio spariva e restava appiccicata la targa
  // del progetto — e passando da References a "Kara" cambiava faccia proprio
  // la cosa che non si muove mai.
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
    // L'intestazione ferma deve essere la stessa di References: se un giorno
    // una delle due cambia misura o posizione, questa prova lo dice.
    const altrove = Math.round(document.querySelector('.refs-header').getBoundingClientRect().top);
    // La targa non e' piu' appiccicata: nessun position:sticky addosso.
    const incollata = getComputedStyle(document.querySelector('.proj-targa')).position;
    // Sotto lo scroll ci finisce solo il lavoro: l'intestazione sta fuori,
    // come in ogni altra sezione. Se qualcuno la rimette dentro, il marchio
    // ricomincia a scorrere via e questa prova lo dice prima di pubblicare.
    const fuori = !document.querySelector('.proj-scroll .proj-header');
    sc.scrollTop = 0;
    return { fermo, scorso, altrove, incollata, fuori, quantoHaScorso: 400 };
  });
  ok('fermi, il marchio e\' in cima', scorrendo.fermo.marchio === 0, scorrendo);
  ok('e scorrendo il marchio resta dov\'e\'',
     scorrendo.scorso.marchio === 0, scorrendo);
  ok('mentre la targa del progetto se ne va su',
     scorrendo.scorso.targa < scorrendo.fermo.targa - 300, scorrendo);
  ok('la targa non e\' piu\' incollata in cima',
     scorrendo.incollata !== 'sticky' && scorrendo.incollata !== 'fixed', scorrendo);
  ok('e l\'intestazione sta fuori dallo scroll', scorrendo.fuori, scorrendo);
  // Ferma nello stesso identico punto di References: e' il senso di tutto il
  // cambiamento, non un dettaglio.
  ok('nello stesso punto in cui sta nelle altre sezioni',
     scorrendo.scorso.marchio === scorrendo.altrove, scorrendo);

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
      projects: bottoni.filter(b=> /openProjects/.test(b.getAttribute('onclick')||''))
                    .map(b=> b.getAttribute('title')),
      nomeRefs: sub('screen-refs'), nomeProjects: sub('screen-projects'),
    };
  });
  ok('ogni pulsante ha un tooltip', nomi.senzaTitle.length === 0, nomi);
  ok('References si chiama come la sua sezione',
     nomi.refs.length === 2 && nomi.refs.every(t=> t === nomi.nomeRefs), nomi);
  ok('e Projects pure',
     nomi.projects.length === 2 && nomi.projects.every(t=> t === nomi.nomeProjects), nomi);

  console.log('\n── e col mouse i pulsanti si vedono da ogni schermata ──');
  // Stavano dentro #screen-home: da References o da Projects, col mouse, non
  // c'era piu' un modo di spostarsi che non fosse il tasto Indietro.
  // Il resto della suite gira a misura di telefono, dove comanda la barra-duna:
  // qui serve una finestra da mouse, e il rilevamento del tocco si ricalcola
  // con 200ms di ritardo (vedi main.js).
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.waitForTimeout(400);
  const dovunque = [];
  for(const [nome, id] of [['home','screen-home'], ['references','screen-refs'],
                           ['projects','screen-projects'], ['progetto','screen-project']]){
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
  // CINQUE, non piu' quattro: dal 21 settembre 2026 c'e' anche la casa, al
  // centro come sulla barra-duna. Prima col mouse si tornava a casa solo dal
  // marchio in cima — che nessuno sa di poter premere — o col tasto Indietro
  // del browser, che pero' esce di un livello alla volta.
  ok('con tutti e cinque i tondi', dovunque.every(d=> d.tondi === 5), dovunque);
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
    const quali = ['screen-projects','screen-idee','screen-refs','screen-stats','screen-project'];
    const scroll = { 'screen-projects':'.projects-scroll', 'screen-idee':'.idee-scroll',
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

  console.log('\n── il quarto tondo porta a Projects, e il taccuino e\' sceso in Impostazioni ──');
  // I cinque tondi sono per quello che si tocca ogni volta che si apre l'app.
  // Il taccuino si apre quando passa un pensiero — di rado, e da fermi — e per
  // questo e' sceso dov'erano gia' andate le Statistiche. Le Scene invece non
  // hanno perso il tondo: se lo dividono coi progetti, che dal 19 settembre
  // 2026 non stanno piu' nella home.
  const quarto = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.dune-btn'));
    return {
      etichette: b.map(x=> x.getAttribute('aria-label')),
      projects: b.some(x=> x.getAttribute('aria-label') === 'projects'),
      scene: b.some(x=> x.getAttribute('aria-label') === 'scenes'),
      idee: b.some(x=> x.getAttribute('aria-label') === 'ideas'),
      quanti: b.length,
    };
  });
  ok('nella barra c\'e\' Projects', quarto.projects, quarto);
  ok('e le Scene non hanno piu\' un tondo loro', !quarto.scene, quarto);
  // IL GLIFO SONO DUE FOGLI SOVRAPPOSTI, e non la gabbia da fumetto di prima:
  // quella diceva "una tavola", cioe' una cosa sola, e qui dentro ci sono i
  // lavori al plurale. Nella barra c'e' gia' un rettangolo con dentro un
  // disegno (References): due fogli staccati non si confondono con quello.
  const glifo = await page.evaluate(()=>{
    const b = document.querySelector('.dune-btn[aria-label="projects"]');
    const svg = b.querySelector('svg');
    return {
      rettangoli: svg.querySelectorAll('rect').length,
      divisioni: svg.querySelectorAll('path').length,
      // Grande come gli altri glifi della barra: uno diverso si nota subito.
      lato: svg.getAttribute('width'),
    };
  });
  ok('il glifo sono due fogli: un rettangolo davanti e uno accennato dietro',
     glifo.rettangoli === 1 && glifo.divisioni === 1, glifo);
  ok('grande come gli altri', glifo.lato === '18', glifo);
  ok('e Idee non c\'e\' piu\'', !quarto.idee, quarto);
  ok('i tondi restano cinque', quarto.quanti === 5, quarto);

  // LA FILA DEL MOUSE DEVE DIRE LE STESSE COSE. La barra-duna e' solo touch:
  // col mouse la navigazione sono i tondi in cima alla home, ed erano rimasti
  // indietro — tenevano ancora le Statistiche. Dal browser le sezioni nuove
  // semplicemente non esistevano.
  const colMouse = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('.home-fab-row .home-fab'));
    // Sta FUORI dalle schermate, come la barra-duna: dentro #screen-home
    // spariva appena si andava da un'altra parte.
    const fuori = !document.getElementById('screen-home').contains(document.querySelector('.home-fab-row'));
    return {
      etichette: b.map(x=> x.getAttribute('aria-label')),
      projects: b.some(x=> x.getAttribute('aria-label') === 'projects'),
      stats: b.some(x=> x.getAttribute('aria-label') === 'stats'),
      fuori,
    };
  });
  ok('col mouse Projects c\'e\'', colMouse.projects, colMouse);
  ok('e la fila vive fuori dalla home, come la barra-duna', colMouse.fuori, colMouse);
  // Le Statistiche si guardano ogni tanto, non ogni giorno: stanno in cima
  // alle Impostazioni, sul telefono come col mouse.
  ok('e le Statistiche sono uscite anche da li\'', !colMouse.stats, colMouse);
  // LE STESSE CINQUE DESTINAZIONI, NELLO STESSO ORDINE — casa compresa.
  // Fino al 21 settembre 2026 la casa era solo sulla barra-duna, e questo
  // controllo la toglieva dal confronto: col mouse il modo di tornare al
  // tavolo era il marchio in cima, che non sembra un pulsante. Adesso le due
  // barre sono la stessa barra detta in due modi, e il confronto e' secco.
  ok('e le due navigazioni portano nelle stesse stanze',
     colMouse.etichette.join(' | ') === quarto.etichette.join(' | '),
     { colMouse: colMouse.etichette, barra: quarto.etichette });

  await page.evaluate(()=> document.querySelector('.dune-btn[aria-label="projects"]').click());
  await page.waitForTimeout(900);
  const suProjects = await page.evaluate(()=>({
    attiva: document.getElementById('screen-projects').classList.contains('active'),
    // Si atterra sui progetti, che sono la cosa per cui si torna qui ogni
    // giorno; le scene stanno sull'altro scaffale, a un tocco.
    scaffale: document.getElementById('projects-tab-progetti').classList.contains('active'),
    progettiVisti: !document.getElementById('projects-pane-progetti').hidden,
    sceneNascoste: document.getElementById('projects-pane-scene').hidden,
    // I due scaffali si chiamano per nome, col loro conto accanto.
    nomi: Array.from(document.querySelectorAll('#projects-vasca .seg-tab'))
            .map(b=> b.textContent.replace(/\s+/g,' ').trim()),
  }));
  ok('un tocco solo e si e\' in Projects', suProjects.attiva, suProjects);
  ok('si atterra sullo scaffale dei progetti',
     suProjects.scaffale && suProjects.progettiVisti && suProjects.sceneNascoste, suProjects);
  ok('e i due scaffali si chiamano Progetti e Scene',
     /^Progetti/.test(suProjects.nomi[0]) && /^Scene/.test(suProjects.nomi[1]), suProjects.nomi);

  // L'INTERRUTTORE. Un tocco e si passa alle scene, col modo di cominciarne
  // una gia' a schermo: e' il gesto per cui la sezione esiste.
  const suScene = await page.evaluate(async ()=>{
    document.getElementById('projects-tab-scene').click();
    await new Promise(r=> setTimeout(r, 400));
    return {
      scene: !document.getElementById('projects-pane-scene').hidden,
      progetti: document.getElementById('projects-pane-progetti').hidden,
      comincia: !!document.getElementById('scene-nuova'),
      // Il cursore bianco si sposta sul secondo posto.
      cursore: document.getElementById('projects-vasca').style.getPropertyValue('--i'),
    };
  });
  ok('l\'interruttore porta alle Scene', suScene.scene && suScene.progetti, suScene);
  ok('col modo di cominciare gia\' a schermo', suScene.comincia, suScene);
  ok('e il cursore si sposta sul secondo scaffale', suScene.cursore === '1', suScene);

  console.log('\n── e la home e\' rimasta in due: la citazione e il cronometro ──');
  // IL CUORE DEL RIASSETTO CHIESTO DA GIOVANNI IL 19 SETTEMBRE 2026. La home
  // faceva due mestieri nello stesso schermo — "mi siedo e comincio" e "dove
  // sono i miei lavori" — e sono due momenti diversi. Adesso fa il primo, e i
  // progetti stanno in Projects insieme alle scene.
  const casa = await page.evaluate(async ()=>{
    document.querySelector('.dune-btn[aria-label="home"]').click();
    await new Promise(r=> setTimeout(r, 400));
    const sc = document.getElementById('home-scroll');
    const cit = document.getElementById('home-quote');
    const q = document.getElementById('tempo-posto');
    const r = sc.getBoundingClientRect();
    return {
      attiva: document.getElementById('screen-home').classList.contains('active'),
      schede: sc.querySelectorAll('.project-card').length,
      piu: !!sc.querySelector('.home-new-add'),
      ricerca: !!sc.querySelector('#search-bar'),
      citazione: !!cit,
      quadrante: !!q && q.getBoundingClientRect().height > 40,
      // LA CITAZIONE STA IN CIMA e il QUADRANTE in mezzo: sono due posizioni
      // diverse e volute. Centrando tutto il blocco la frase del giorno
      // scendeva a mezzo schermo e non si leggeva piu' entrando.
      citazioneSopra: Math.round(cit.getBoundingClientRect().top - r.top),
      quadranteSopra: Math.round(q.getBoundingClientRect().top - r.top),
      alta: Math.round(r.height),
    };
  });
  ok('la home e\' attiva', casa.attiva, casa);
  ok('e non porta piu\' nessuna scheda di progetto', casa.schede === 0, casa);
  ok('ne\' il "+" per crearne uno', !casa.piu, casa);
  ok('ne\' il campo di ricerca', !casa.ricerca, casa);
  ok('restano la citazione e il cronometro', casa.citazione && casa.quadrante, casa);
  ok('la citazione sta in cima, subito sotto l\'intestazione',
     casa.citazioneSopra < 40, casa);
  // Era una cosa gia' chiesta quando il cronometro e' diventato il marchio
  // ("piu' grande e centrale"), e finche' sotto c'erano le schede non si
  // poteva fare.
  ok('e il cronometro sta al centro, non appeso sotto la frase',
     casa.quadranteSopra > casa.alta * 0.25, casa);

  // ── LA LANCETTA SEGUE L'ARCO ──
  // E' il punto della variante scelta il 19 settembre 2026: l'arco dice quanto
  // hai fatto, la lancetta dice DOVE sei arrivato, e se i due non coincidono
  // il quadrante mente. Il conto sta in disegnaTempo (main.js), che vive solo
  // nell'app vera: nel banco del cronometro non c'e', ed e' per questo che
  // questa prova sta qui e non in tempo.js.
  const lancetta = await page.evaluate(async ()=>{
    await window.tempoTocca();                 // parte
    await new Promise(r=> setTimeout(r, 1300));
    const g = document.getElementById('tempo-lancetta');
    const t = await import('/js/tempo.js');
    const secondi = t.secondiCorrenti();
    const gradi = parseFloat((g.style.transform || 'rotate(0').replace('rotate(', '')) || 0;
    const acceso = document.getElementById('tempo-avvia').classList.contains('corre');
    const cifre = document.getElementById('tempo-cifre').textContent;
    // SCARTARE CHIEDE CONFERMA, e qui non c'e' nessuno a premere: la promessa
    // di confirmModal non si risolverebbe mai e la prova resterebbe appesa
    // (successo davvero, scrivendola). Si lancia senza aspettarla e si preme
    // "Elimina" a mano, che e' poi quello che fa Giovanni.
    window.tempoScarta();
    await new Promise(r=> setTimeout(r, 400));
    const ok = document.getElementById('ink-confirm-ok');
    if(ok) ok.click();
    await new Promise(r=> setTimeout(r, 400));
    return { secondi, gradi, acceso, cifre,
             dopo: document.getElementById('tempo-avvia').classList.contains('corre') };
  });
  ok('toccando il quadrante il cronometro parte', lancetta.acceso, lancetta);
  ok('e le cifre contano', /^00:0[0-9]$/.test(lancetta.cifre), lancetta);
  // LA MEZZALUNA DEL TIMER (9 ottobre 2026): 0 in basso, 60 in alto, cioe'
  // da 180 a 360 gradi, tre gradi al minuto. La lancetta deve dire i minuti
  // che dicono le cifre.
  ok('la lancetta segna i minuti sulla mezzaluna',
     Math.abs(lancetta.gradi - (180 + (lancetta.secondi / 60 % 60) * 3)) < 0.2, lancetta);
  ok('e scartando la sessione il quadrante si spegne', !lancetta.dopo, lancetta);

  console.log('\n── la scrivania: quello che si vede sul tavolo e\' dato vero ──');
  // LA REGOLA DI QUESTA SCHERMATA. La mappa del mese non e' un ornamento a
  // tema RE3: il percorso azzurro sono i giorni in cui ti sei seduto a
  // disegnare, le croci rosse i giorni saltati, il riquadro giallo e' oggi.
  // Se il disegno e il registro delle ore (secondiPerGiorno in tempo.js)
  // smettessero di dire la stessa cosa, il tavolo racconterebbe una bugia —
  // ed e' la prima cosa che si vede aprendo l'app.
  const tavolo = await page.evaluate(async ()=>{
    document.querySelector('.dune-btn[aria-label="home"]').click();
    await new Promise(r=> setTimeout(r, 300));
    const t = await import('/js/tempo.js');
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    const oggi = new Date();
    const due = n => String(n).padStart(2, '0');
    const chiave = g => oggi.getFullYear() + '-' + due(oggi.getMonth()+1) + '-' + due(g);
    // Si semina il registro: due giorni fatti attaccati, uno saltato in mezzo,
    // e un giorno FUTURO con dentro delle ore (non puo' esistere, ma serve a
    // controllare che il disegno guardi la data e non solo la mappa).
    const m = new Map();
    const fatti = [];
    for(let g = 1; g <= oggi.getDate(); g++){ if(g % 3 !== 0){ m.set(chiave(g), 1800 + g); fatti.push(g); } }
    const ultimo = new Date(oggi.getFullYear(), oggi.getMonth()+1, 0).getDate();
    t.__seminaGiorni(m);
    const p1 = home.newProjectObj('Kara', 24); p1.id = 'pk';
    p1.microtask = 'Chiudere gli sfondi della tavola 7';
    st.setProjects([p1]);
    await window.__aggiornaScrivania();
    await new Promise(r=> setTimeout(r, 300));
    const mappa = document.getElementById('scriv-mappa');
    const svg = mappa.querySelector('svg');
    const percorsi = Array.from(svg.querySelectorAll('path'));
    const azzurri = percorsi.filter(p=> (p.getAttribute('stroke')||'').toLowerCase() === '#56a8dd');
    const croci = percorsi.filter(p=> (p.getAttribute('stroke')||'').toLowerCase() === '#a8352c');
    const big = document.getElementById('scriv-biglietto');
    return {
      giorniDelMese: ultimo, oggi: oggi.getDate(),
      // I giorni saltati sono quelli PRIMA di oggi: oggi non e' finito, e
      // sbarrarlo alle nove del mattino vorrebbe dire darti del pigro prima
      // che tu abbia avuto la giornata per smentirlo.
      saltati: Array.from({length:oggi.getDate()-1},(_,i)=> i+1).filter(g=> g % 3 === 0).length,
      oggiSaltato: oggi.getDate() % 3 === 0,
      croci: croci.length,
      tratti: azzurri.length,
      mese: (mappa.querySelector('.scriv-mese')||{}).textContent,
      // OGGI E' CERCHIATO A PENNARELLO GIALLO, non piu' col riquadrino pulito
      // che c'era prima: e' il segno che si fa su una mappa stampata.
      // Ogni segno e' passato due volte (vedi dueMani in scrivania.js),
      // quindi i tracciati gialli sono due.
      cerchioOggi: percorsi.filter(p=> (p.getAttribute('stroke')||'').toLowerCase() === '#f2c400').length,
      // IL RIQUADRO VERDE sulla serie piu' lunga di giorni di fila.
      riquadroSerie: percorsi.filter(p=> (p.getAttribute('stroke')||'').toLowerCase() === '#4fae3f').length,
      // E LE SCRITTE A MANO, con la loro inclinazione.
      appunti: Array.from(mappa.querySelectorAll('.scriv-nota')).map(x=>({
        testo: x.textContent, storta: /rotate/.test(x.style.transform) })),
      // Il biglietto c'e' perche' c'e' un microtask scritto, e porta il nome
      // del progetto.
      biglietto: big && !big.hidden ? big.textContent.replace(/\s+/g,' ').trim() : null,
    };
  });
  ok('la mappa porta il nome del mese', /^[A-Z]{5,}$/.test(tavolo.mese || ''), tavolo);
  ok('e oggi e\' cerchiato a pennarello', tavolo.cerchioOggi === 2, tavolo);
  // LA SERIE PIU' LUNGA E' CERCHIATA IN VERDE, come gli edifici sulla mappa di
  // Raccoon City, e c'e' scritto accanto quanti giorni sono.
  ok('la serie piu\' lunga e\' cerchiata in verde', tavolo.riquadroSerie === 2, tavolo);
  ok('e dice quanti giorni di fila sono',
     tavolo.appunti.some(a=> /\d+ giorni di fila/.test(a.testo)), tavolo.appunti);
  // LE SCRITTE STANNO STORTE, una per una: allineate sembravano etichette
  // stampate invece che appunti.
  ok('e gli appunti stanno storti', tavolo.appunti.length > 0
     && tavolo.appunti.every(a=> a.storta), tavolo.appunti);
  // UNA CROCE PER OGNI GIORNO SALTATO, e nessuna di piu': sbarrare un giorno
  // che deve ancora arrivare vorrebbe dire segnarlo come mancato.
  ok('una croce rossa per ogni giorno saltato, e solo per quelli passati',
     tavolo.croci === tavolo.saltati, tavolo);
  // E' il caso che si vede solo quando capita: se oggi e' un giorno senza ore,
  // la croce NON deve esserci comunque. Il conto qui sopra lo prova gia' nei
  // giorni giusti, questa riga lo dice per iscritto.
  ok('e oggi non prende mai la croce, anche se ancora non hai disegnato',
     !tavolo.oggiSaltato || tavolo.croci === tavolo.saltati, tavolo);
  ok('e il percorso azzurro c\'e\'', tavolo.tratti === 1, tavolo);
  ok('il biglietto di stasera porta il task e il progetto',
     /Chiudere gli sfondi della tavola 7/.test(tavolo.biglietto || '')
     && /KARA/.test(tavolo.biglietto || ''), tavolo);

  // SENZA UN TASK SCRITTO IL FOGLIO RESTA, con la sua riga da riempire — ma
  // senza niente scritto dentro. Spariva, e il tavolo perdeva l'oggetto
  // piccolo: restavano la mappa e il cronometro, cioe' due cose grandi e
  // nient'altro, e la gerarchia su cui la scrivania e' stata disegnata
  // (Giovanni, 21 settembre 2026) si sfasciava. Un foglietto che dicesse "non
  // hai ancora scritto il task" sarebbe pero' un rimprovero appeso al tavolo:
  // la riga vuota si capisce da sola.
  const senzaTask = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    const p = home.newProjectObj('Kara', 24); p.id = 'pk'; p.microtask = '';
    st.setProjects([p]);
    await window.__aggiornaScrivania();
    await new Promise(r=> setTimeout(r, 200));
    const b = document.getElementById('scriv-biglietto');
    const conProgetti = { c1: !b.hidden, riga: !!b.querySelector('.riga-vuota'),
                          testo: b.textContent.replace(/\s+/g,' ').trim() };
    // Senza nemmeno un progetto non c'e' niente da scrivere stasera: il foglio
    // sparisce. E' il tavolo di chi apre l'app la prima volta.
    st.setProjects([]);
    await window.__aggiornaScrivania();
    await new Promise(r=> setTimeout(r, 200));
    return Object.assign(conProgetti, { senzaNiente: b.hidden });
  });
  ok('senza un task scritto il foglio resta sul tavolo', senzaTask.c1, senzaTask);
  ok('con la riga da riempire, e niente scritto dentro',
     senzaTask.riga && senzaTask.testo === '', senzaTask);
  ok('ma senza nemmeno un progetto il foglio non c\'e\'', senzaTask.senzaNiente, senzaTask);

  // LA LAMPADA. Accende e spegne il tavolo, e la scelta resta: chi disegna di
  // notte non vuole rifarlo ad ogni apertura.
  const lampada = await page.evaluate(async ()=>{
    const b = document.getElementById('scriv-luce');
    const tavolo = document.querySelector('.scriv-tavolo');
    const filtro = ()=> getComputedStyle(tavolo).filter;
    const prima = document.body.classList.contains('luce-spenta');
    const filtroAcceso = filtro();
    b.click(); await new Promise(r=> setTimeout(r, 600));
    const dopo = document.body.classList.contains('luce-spenta');
    const filtroSpento = filtro();
    const salvato = localStorage.getItem('inkflow_scrivania_luce');
    // L'INTERRUTTORE NON SI SPEGNE CON IL RESTO: al buio e' l'unica cosa che
    // devi riuscire a trovare, quindi sta fuori dal contenitore che si smorza.
    const interruttoreFuori = !tavolo.contains(b);
    const luceSpento = getComputedStyle(b).filter;
    b.click(); await new Promise(r=> setTimeout(r, 600));   // la luce torna in 0,45s
    const luceAcceso = getComputedStyle(b).filter;
    return { prima, dopo, salvato, filtroAcceso, filtroSpento, interruttoreFuori, luceSpento, luceAcceso,
             tornata: document.body.classList.contains('luce-spenta') };
  });
  ok('la lampada si spegne', lampada.prima === false && lampada.dopo === true, lampada);
  ok('e la scelta si ricorda', lampada.salvato === 'spenta', lampada);
  ok('e si riaccende', lampada.tornata === false, lampada);
  // SPEGNE ANCHE LE COSE SUL TAVOLO, non solo il fondo. Prima la mappa restava
  // luminosa come se avesse luce propria, e un foglio di carta illuminato in
  // una stanza buia non esiste (Giovanni, 21 settembre 2026).
  ok('e al buio si smorza anche quello che sta sul tavolo',
     /none/i.test(lampada.filtroAcceso) && /brightness\(0?\.[0-5]/.test(lampada.filtroSpento),
     lampada);
  ok('ma l\'interruttore no: al buio devi poterlo trovare',
     lampada.interruttoreFuori, lampada);
  // PERO' NON RESTA ACCESO COME DI GIORNO. Da quando e' una foto (9 ottobre
  // 2026) in una stanza buia sembrava illuminato da sé: si smorza un filo
  // meno del tavolo, e torna pieno quando si riaccende.
  ok('e a luce spenta si smorza anche lui, un filo meno del tavolo',
     /brightness\(0?\.[4-6]/.test(lampada.luceSpento) && /none/i.test(lampada.luceAcceso), lampada);

  // E STA ALL'ANGOLO DELLO SCHERMO, non appeso al banco. Il banco e' largo al
  // massimo 860px e sta in mezzo alla pagina: col mouse l'interruttore gli
  // restava attaccato in fondo, cioe' a mezz'aria in mezzo al legno
  // (Giovanni, 21 settembre 2026: "mettiamolo proprio in basso a destra di
  // TUTTA la pagina"). Fisso vuol dire due cose insieme — che non scorre col
  // contenuto, e che lo trovi sempre nello stesso posto.
  const angolo = await page.evaluate(()=>{
    const b = document.getElementById('scriv-luce');
    const r = b.getBoundingClientRect();
    const st = getComputedStyle(b);
    const dune = document.querySelector('.dune-nav');
    const dr = dune ? dune.getBoundingClientRect() : null;
    return {
      fisso: st.position === 'fixed',
      daDestra: Math.round(window.innerWidth - r.right),
      daSotto: Math.round(window.innerHeight - r.bottom),
      // E NON SI SIEDE SULLA BARRA-DUNA: col dito quella occupa gli 88px in
      // fondo, e due cose nello stesso punto sono una sola cosa sbagliata.
      tocco: document.body.classList.contains('is-touch'),
      sullaDuna: !!(dr && getComputedStyle(dune).display !== 'none'
                    && r.bottom > dr.top + 4),
    };
  });
  ok('l\'interruttore e\' fisso all\'angolo in basso a destra della pagina',
     angolo.fisso && angolo.daDestra >= 8 && angolo.daDestra <= 40
     && angolo.daSotto >= 8, angolo);
  ok('e non si siede sopra la barra-duna', !angolo.sullaDuna, angolo);

  // ── SULLA HOME SI TOCCA UN OGGETTO SOLO: L'OROLOGIO ──
  // La storia di questo gesto, perche' e' cambiato due volte in due giorni.
  // All'inizio il tocco alternava avvio, pausa e ripresa, e per chiudere o
  // eliminare una sessione bisognava andarsene su un'altra schermata a
  // cercare la capsula del cronometro. Allora sotto il quadrante erano
  // comparsi due tondi, Fine ed Elimina — e Giovanni ha chiesto di toccare
  // UN OGGETTO SOLO (21 settembre 2026), quindi il tocco era diventato
  // avvio/chiusura. E li' stava il difetto: toccando per mettere in pausa il
  // quadrante si azzerava (22 settembre 2026). Mettere in pausa e chiudere
  // non sono la stessa intenzione, e la seconda non si disfa.
  // Adesso: il gesto leggero fa la cosa leggera, il gesto lungo apre le due
  // definitive scritte per esteso.
  const quadrante = await page.evaluate(async ()=>{
    const m = await import('/js/tempo.js');
    const b = document.getElementById('tempo-avvia');
    if(!b) return { manca: true };
    const soloLui = !document.getElementById('tempo-comandi')
                 && !document.getElementById('tempo-stop-home');
    const premi = ()=> b.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    // L'anello si guarda a meta' strada: a pressione compiuta e' gia' stato
    // tolto (lo toglie chi apre il menu), quindi cercarlo dopo vorrebbe dire
    // cercarlo quando ha appena finito il suo mestiere.
    const tieni = async (ms)=>{
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
      await new Promise(r=> setTimeout(r, 300));
      const anello = b.classList.contains('carica');
      await new Promise(r=> setTimeout(r, Math.max(0, ms - 300)));
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles:true }));
      return anello;
    };
    m.ferma();
    premi(); await new Promise(r=> setTimeout(r, 200));
    const partito = m.acceso();
    // UN ALTRO TOCCO METTE IN PAUSA, e il tempo accumulato resta: azzerare
    // qui vorrebbe dire buttare via una sessione con un tocco solo.
    premi(); await new Promise(r=> setTimeout(r, 150));
    const inPausa = m.inPausa() && m.acceso();
    premi(); await new Promise(r=> setTimeout(r, 150));
    const ripreso = m.acceso() && !m.inPausa();
    // DA FERMO la pressione lunga non apre niente: non c'e' niente da
    // chiudere e niente da buttare.
    m.ferma(); await new Promise(r=> setTimeout(r, 250));
    await tieni(950);
    await new Promise(r=> setTimeout(r, 150));
    const menuDaFermo = !!document.querySelector('.ink-action-menu');
    // MENTRE CORRE la pressione lunga apre le due definitive.
    premi(); await new Promise(r=> setTimeout(r, 200));
    const anello = await tieni(950);
    await new Promise(r=> setTimeout(r, 250));
    const menu = document.querySelector('.ink-action-menu');
    const voci = menu ? Array.from(menu.querySelectorAll('button,[role="menuitem"],div'))
      .map(x=> x.textContent.trim()).filter(Boolean) : [];
    // ELIMINA chiede prima: quei minuti non tornano.
    const bottoni = menu ? Array.from(menu.querySelectorAll('button')) : [];
    const elimina = bottoni.find(x=> /elimina/i.test(x.textContent));
    if(elimina) elimina.click();
    await new Promise(r=> setTimeout(r, 400));
    const chiede = !!document.querySelector('.modal-overlay.open #ink-confirm-ok');
    if(chiede) document.querySelector('.modal-overlay.open #ink-confirm-ok').click();
    await new Promise(r=> setTimeout(r, 400));
    return { soloLui, partito, inPausa, ripreso, menuDaFermo, anello,
             voci, chiede, spento: !m.acceso() };
  });
  ok('sulla home si tocca solo l\'orologio',
     !quadrante.manca && quadrante.soloLui, quadrante);
  ok('un tocco fa partire il cronometro',
     !quadrante.manca && quadrante.partito, quadrante);
  ok('un altro tocco mette in pausa, e non azzera',
     !quadrante.manca && quadrante.inPausa, quadrante);
  ok('e un terzo riprende', !quadrante.manca && quadrante.ripreso, quadrante);
  ok('da fermo tenere premuto non apre niente',
     !quadrante.manca && !quadrante.menuDaFermo, quadrante);
  ok('mentre corre, tenendo premuto l\'anello si stringe',
     !quadrante.manca && quadrante.anello, quadrante);
  ok('e la pressione lunga offre di chiudere o di eliminare',
     !quadrante.manca && quadrante.voci.some(t=> /chiudi e registra/i.test(t))
     && quadrante.voci.some(t=> /elimina la sessione/i.test(t)), quadrante.voci);
  ok('eliminare chiede prima, e poi spegne il cronometro',
     !quadrante.manca && quadrante.chiede && quadrante.spento, quadrante);

  // ── JOBS: IL TERZO SCAFFALE ──
  // Non e' un progetto con meno roba dentro: e' un lavoro su commissione,
  // dove lo script ce l'hai gia' e lo leggi altrove (Giovanni, 27 settembre
  // 2026). Quindi niente storia, niente atti: un titolo, quante tavole, e per
  // ogni tavola le immagini che ti servono sotto gli occhi.
  const jobs = await page.evaluate(async ()=>{
    await window.openProjects('jobs');
    await new Promise(r=> setTimeout(r, 600));
    const vede = n => { const el = document.getElementById('projects-pane-' + n);
                        return !!el && !el.hidden; };
    const scaffale = { jobs: vede('jobs'), progetti: vede('progetti'), scene: vede('scene'),
      linguetta: document.getElementById('projects-tab-jobs').classList.contains('active'),
      // Il cursore bianco deve sapere che le linguette sono tre: a due resta
      // largo mezza vasca e sulla terza finisce fuori posto.
      quante: getComputedStyle(document.getElementById('projects-vasca')).getPropertyValue('--n').trim() };
    const j = await import('/js/jobs.js');
    j.__seminaJobs([{ id:'j1', titolo:'Nemesis #3', tavole:6,
                      rif:{ '2':[{url:'https://x/a.png', refId:'r1'}],
                            '5':[{url:'https://x/b.png', refId:'r2'},
                                 {url:'https://x/c.png', refId:'r3'}] } }]);
    await new Promise(r=> setTimeout(r, 200));
    const card = document.querySelector('#jobs-lista .jobs-card');
    const scheda = card ? card.textContent.replace(/\s+/g,' ').trim() : null;
    card.click();
    await new Promise(r=> setTimeout(r, 400));
    const righe = Array.from(document.querySelectorAll('#job-corpo .job-riga'))
      .map(r=> r.textContent.replace(/\s+/g,' ').trim());
    // Se le righe non ci sono tutte si dice, invece di schiantarsi: una prova
    // che muore con "Cannot read properties of undefined" non racconta niente
    // a chi la legge sei mesi dopo.
    const quinta = document.querySelectorAll('#job-corpo .job-riga')[4];
    if(!quinta) return { scaffale, scheda, righe, manca:'la quinta riga' };
    quinta.click();   // Tavola 5
    await new Promise(r=> setTimeout(r, 300));
    const dentro = {
      titolo: document.getElementById('job-titolo').textContent.trim(),
      celle: document.querySelectorAll('#job-corpo .job-cella').length,
      piu: !!document.getElementById('job-piu'),
    };
    // Indietro scende di un livello: dalla tavola all'elenco delle tavole.
    const tornato = window.__indietroJob();
    await new Promise(r=> setTimeout(r, 250));
    return { scaffale, scheda, righe, dentro, tornato,
             dopoIndietro: document.getElementById('job-titolo').textContent.trim() };
  });
  ok('c\'e\' il terzo scaffale e si apre',
     jobs.scaffale.jobs && !jobs.scaffale.progetti && !jobs.scaffale.scene
     && jobs.scaffale.linguetta, jobs.scaffale);
  ok('e il cursore sa che le linguette sono tre',
     jobs.scaffale.quante === '3', jobs.scaffale);
  ok('la scheda di un lavoro dice titolo, tavole e quante ne hai preparate',
     /Nemesis #3/.test(jobs.scheda) && /6 tavole/.test(jobs.scheda)
     && /2 preparate/.test(jobs.scheda), jobs);
  // LE TAVOLE CI SONO TUTTE DALL'INIZIO: il lavoro sa quante sono, e chiedere
  // di "creare la tavola 7" prima di poterci mettere un'immagine sarebbe un
  // passaggio in piu' per una cosa che si sa gia'.
  ok('dentro il lavoro ci sono tutte le tavole',
     jobs.righe.length === 6 && /Tavola 1/.test(jobs.righe[0]), jobs.righe);
  ok('e ognuna dice quante immagini ha, o un trattino se e\' vuota',
     /2 rif\./.test(jobs.righe[4]) && /—/.test(jobs.righe[0]), jobs.righe);
  ok('aprendo una tavola si vedono le sue immagini e il piu\' per aggiungerne',
     !jobs.manca && jobs.dentro.titolo === 'Tavola 5' && jobs.dentro.celle === 2
     && jobs.dentro.piu, jobs);
  // TORNANDO A CASA DA UN LAVORO, il lavoro si spegne. Prima l'elenco delle
  // schermate da spegnere era scritto a mano e quella dei Jobs non c'era: la
  // home si accendeva sopra un lavoro ancora acceso, e le due si
  // sovrapponevano (Giovanni, 7 ottobre 2026).
  const aCasa = await page.evaluate(async ()=>{
    const j = await import('/js/jobs.js');
    j.__seminaJobs([{ id:'jh', titolo:'Prova', tavole:3, rif:{} }]);
    j.apriJob('jh');
    await new Promise(r=> setTimeout(r, 200));
    const prima = document.getElementById('screen-job').classList.contains('active');
    window.goHome();
    await new Promise(r=> setTimeout(r, 600));
    return { prima,
      lavoroSpento: !document.getElementById('screen-job').classList.contains('active'),
      accese: Array.from(document.querySelectorAll('.screen.active')).map(x=> x.id) };
  });
  ok('tornando a casa da un lavoro resta accesa solo la home',
     aCasa.prima && aCasa.lavoroSpento
     && aCasa.accese.length === 1 && aCasa.accese[0] === 'screen-home', aCasa);
  ok('e Indietro torna all\'elenco delle tavole, non fuori dal lavoro',
     !jobs.manca && jobs.tornato === true && jobs.dopoIndietro === 'Nemesis #3', jobs);

  // ── ELIMINARE DALL'ELENCO NON TI SBATTE A CASA ──
  // IL DIFETTO: eliminando un progetto dall'elenco l'app tornava alla home
  // (Giovanni, 25 settembre 2026, "per qualche ragione strana"). Di strano
  // non c'era niente ed era sempre: per riusare la conferma della scheda
  // aperta, l'elenco scriveva currentId col progetto da eliminare. Dopo
  // l'eliminazione c'e' un controllo — "ho appena cancellato la scheda che
  // stavo guardando?" — che serve a non lasciarti su una pagina che non
  // esiste piu': con currentId falsificato era sempre vero.
  const elimina = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    const proj = await import('/js/project.js');
    const a = home.newProjectObj('Da tenere', 10); a.id = 'pa';
    const b = home.newProjectObj('Da buttare', 10); b.id = 'pb';
    st.setProjects([a, b]);
    // SI ENTRA E SI ESCE da una scheda: e' il caso vero, quello in cui
    // currentId resta addosso anche dopo essere tornati indietro.
    proj.openProject('pa');
    await new Promise(r=> setTimeout(r, 300));
    await window.openProjects('progetti');
    await new Promise(r=> setTimeout(r, 400));
    const partenza = document.getElementById('screen-projects').classList.contains('active');
    // Si elimina L'ALTRO, dall'elenco.
    home.confirmDeleteProject('pb');
    await new Promise(r=> setTimeout(r, 200));
    document.getElementById('confirm-ok').click();
    await new Promise(r=> setTimeout(r, 700));
    return {
      partenza,
      restaNellElenco: document.getElementById('screen-projects').classList.contains('active'),
      finitoACasa: document.getElementById('screen-home').classList.contains('active'),
    };
  });
  ok('si parte dall\'elenco dei progetti', elimina.partenza, elimina);
  ok('eliminando dall\'elenco si resta nell\'elenco',
     elimina.restaNellElenco && !elimina.finitoACasa, elimina);

  // E L'ALTRO CASO DEVE CONTINUARE A FUNZIONARE: se cancelli la scheda che
  // stai guardando, restare li' vorrebbe dire restare su un progetto che non
  // esiste piu'. Quella e' l'unica volta in cui si torna a casa.
  const daDentro = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    const proj = await import('/js/project.js');
    const a = home.newProjectObj('Aperta', 10); a.id = 'pc';
    st.setProjects([a]);
    proj.openProject('pc');
    await new Promise(r=> setTimeout(r, 300));
    proj.confirmDeleteCurrent();
    await new Promise(r=> setTimeout(r, 200));
    document.getElementById('confirm-ok').click();
    await new Promise(r=> setTimeout(r, 800));
    return { aCasa: document.getElementById('screen-home').classList.contains('active') };
  });
  ok('ma cancellando la scheda aperta si torna a casa', daDentro.aCasa, daDentro);

  // ── NASCE UN PROGETTO, E SI SENTE ──
  // Era l'unico momento davvero importante della home che avveniva in
  // silenzio: il foglio si chiudeva e compariva una sfera nuova, senza che
  // niente dicesse "e' fatta" (Giovanni, 25 settembre 2026).
  // SI GUARDA LA VIBRAZIONE, non il suono: haptic() manda intenti diversi a
  // durate diverse — 18 per 'done', 9 per un tocco qualunque — quindi il
  // numero dice con che intento e' stato chiamato. Il suono vero e proprio
  // ha bisogno di un contesto audio sbloccato da un gesto, che in una prova
  // automatica non c'e' sempre; la vibrazione no.
  const nascita = await page.evaluate(async ()=>{
    const vibrate = [];
    const vero = navigator.vibrate;
    navigator.vibrate = v => { vibrate.push(v); return true; };
    const st = await import('/js/state.js');
    const quanti = st.projects.length;
    window.openNewModal();
    document.getElementById('new-title').value = 'Prova del suono';
    document.getElementById('new-tav').value = '12';
    await window.createProject();
    await new Promise(r=> setTimeout(r, 400));
    navigator.vibrate = vero;
    return { vibrate, quanti, adesso: st.projects.length };
  });
  ok('creare un progetto fa il suono della conferma',
     nascita.vibrate.includes(18), nascita);

  // ── ELIMINARE UNA SESSIONE NON SI SCRIVE PIU' ──
  // C'era "Sessione eliminata" per due secondi e mezzo. Serviva quando
  // eliminare era muto: senza, premere non sembrava fare niente. Adesso
  // scartare ha il suo suono e il quadrante torna a zero sotto gli occhi,
  // quindi scriverlo era ripetere tre volte la stessa cosa.
  const senzaScritta = await page.evaluate(async ()=>{
    const m = await import('/js/tempo.js');
    const esito = document.getElementById('tempo-esito');
    esito.textContent = '';
    m.avvia();
    await new Promise(r=> setTimeout(r, 200));
    window.tempoScarta();
    await new Promise(r=> setTimeout(r, 300));
    const ok = document.querySelector('.modal-overlay.open #ink-confirm-ok');
    if(ok) ok.click();
    await new Promise(r=> setTimeout(r, 500));
    return { testo: esito.textContent.trim(), acceso: m.acceso() };
  });
  ok('eliminare una sessione non lascia scritte sul tavolo',
     senzaScritta.testo === '' && senzaScritta.acceso === false, senzaScritta);

  // ── E IL QUADRANTE NON SI SPOSTA QUANDO ARRIVA L'ESITO ──
  // La riga che dice com'e' andata stava sotto il quadrante come riga
  // normale, quindi allargava la colonna: appena compariva "Sessione troppo
  // breve: non registrata" il quadrante saltava di sessanta pixel verso
  // sinistra, perche' sul tavolo la colonna e' appoggiata a destra. Dal
  // telefono si vedeva benissimo (Giovanni, 22 settembre 2026).
  const fermo = await page.evaluate(async ()=>{
    const dove = ()=> Math.round(document.getElementById('tempo-avvia').getBoundingClientRect().left);
    const esito = document.getElementById('tempo-esito');
    esito.textContent = '';
    await new Promise(r=> setTimeout(r, 80));
    const prima = dove();
    esito.textContent = 'Sessione troppo breve: non registrata';
    await new Promise(r=> setTimeout(r, 80));
    const dopo = dove();
    const r = esito.getBoundingClientRect();
    esito.textContent = '';
    return { prima, dopo, dentro: r.left >= 0 && r.right <= innerWidth };
  });
  ok('il quadrante non si sposta quando compare l\'esito',
     fermo.prima === fermo.dopo, fermo);
  ok('e la riga dell\'esito resta dentro lo schermo', fermo.dentro, fermo);

  // ── LA RADIOLINA ──
  // Giovanni disegna con la musica e la vuole sul tavolo (7 ottobre 2026).
  // Non suona YouTube e non e' un ripiego: tenere in riproduzione un player
  // di YouTube a schermo bloccato e' una funzione DEL BROWSER, che una
  // pagina non si puo' dare da sola, e separare l'audio dal video e' vietato
  // dai termini. Un <audio> normale invece suona a schermo bloccato e si fa
  // comandare dalla schermata di blocco: e' la cosa che serviva davvero.
  const radio = await page.evaluate(async ()=>{
    const r = await import('/js/radio.js');
    const box = document.getElementById('radio');
    if(!box) return { manca: true };
    r.montaRadio();
    const spenta = { stato: box.dataset.stato,
                     nome: document.getElementById('radio-nome').textContent.trim() };
    // Si semina un elenco senza passare da Drive: qui si prova il mobiletto,
    // non la rete.
    r.__seminaBrani([{ id:'a', name:'03 - Notturno.mp3' }, { id:'b', name:'04 - Pioggia.m4a' }]);
    await new Promise(x=> setTimeout(x, 100));
    const primo = document.getElementById('radio-nome').textContent.trim();
    r.avanti(1);
    await new Promise(x=> setTimeout(x, 150));
    const dopo = r.statoRadio();
    return { spenta, primo, dopo,
             tasti: ['radio-prec','radio-onoff','radio-succ'].every(i=> !!document.getElementById(i)) };
  });
  ok('la radiolina sta sul tavolo, coi suoi tre tasti',
     !radio.manca && radio.tasti, radio);
  // Da spenta e senza brani la fessura resta vuota: la scritta "Radio" era
  // un'etichetta in piu' su un walkman spento (Giovanni, 9 ottobre 2026).
  ok('da spenta la fessura del titolo e\' vuota',
     !radio.manca && radio.spenta.stato === 'spenta' && radio.spenta.nome === '', radio);
  // IL NOME SI LEGGE COME SU UNA RADIO: niente estensione e niente numero
  // d'ordine davanti. "03 - Notturno.mp3" su un vetrino largo cosi' sarebbe
  // tre quarti di rumore.
  ok('il vetrino dice il titolo pulito, senza numeri ne\' estensione',
     !radio.manca && radio.primo === 'Notturno', radio);
  // QUATTRO MODI DI NON SUONARE, e ognuno dice la cosa da fare. La prima
  // versione li chiamava tutti "Drive non risponde", e Giovanni se l'e'
  // trovato con la cartella appena creata (7 ottobre 2026): era vero solo in
  // uno dei quattro casi.
  const modi = await page.evaluate(async ()=>{
    const r = await import('/js/radio.js');
    const dice = st=>{ r.__metti(st); return document.getElementById('radio-nome').textContent.trim(); };
    const out = { scollegata: dice('scollegata'), senzaCartella: dice('senzaCartella'),
                  vuota: dice('vuota'), errore: dice('errore') };
    r.__metti('spenta');
    return out;
  });
  ok('da scollegata dice di collegare Drive', /collegare Drive/.test(modi.scollegata), modi);
  ok('senza cartella dice quale cartella manca', /Inkflow Radio/.test(modi.senzaCartella), modi);
  ok('con la cartella vuota lo dice', /vuota/.test(modi.vuota), modi);
  ok('e "non risponde" resta solo per l\'errore vero',
     modi.errore === 'Drive non risponde'
     && ![modi.scollegata, modi.senzaCartella, modi.vuota].some(t=> /non risponde/.test(t)), modi);
  // IL TASTO DI MEZZO CAMBIA FACCIA: play da ferma, pausa mentre suona.
  // Prima restava sempre un triangolo, e a radio accesa non c'era modo di
  // capire dal tasto cosa avrebbe fatto (Giovanni, 7 ottobre 2026).
  const faccia = await page.evaluate(async ()=>{
    const r = await import('/js/radio.js');
    const t = document.getElementById('radio-onoff');
    r.__metti('suona');  const suonando = { label: t.getAttribute('aria-label'), f: t.dataset.faccia,
                                            bobine: getComputedStyle(document.querySelector('.radio-bobina')).animationName };
    r.__metti('pausa');  const ferma = { label: t.getAttribute('aria-label'), f: t.dataset.faccia,
                                         bobine: getComputedStyle(document.querySelector('.radio-bobina')).animationName,
                                         ferme: getComputedStyle(document.querySelector('.radio-bobina')).animationPlayState,
                                         titolo: getComputedStyle(document.querySelector('.radio-nome')).animationName };
    r.__metti('spenta');
    return { suonando, ferma };
  });
  ok('mentre suona il tasto di mezzo e\' la pausa',
     faccia.suonando.label === 'Pausa' && faccia.suonando.f === 'pausa', faccia);
  ok('e da ferma torna play', faccia.ferma.label === 'Play' && faccia.ferma.f === 'play', faccia);
  // LE BOBINE GIRANO SOLO MENTRE SUONA: e' l'unico movimento del mobiletto,
  // e il modo in cui un lettore a cassette dice "sto andando".
  // IN PAUSA SI CONGELANO, NON SI AZZERANO. Togliere l'animazione le faceva
  // scattare indietro alla posizione di partenza (Giovanni, 8 ottobre 2026):
  // l'animazione resta, e si mette in pausa. Il titolo invece continua.
  ok('le bobine girano mentre suona, e in pausa si fermano dove sono',
     faccia.suonando.bobine === 'radio-gira' && faccia.ferma.bobine === 'radio-gira'
       && faccia.ferma.ferme === 'paused', faccia);
  ok('e in pausa il titolo continua a scorrere',
     faccia.ferma.titolo === 'radio-scorre', faccia);

  // I RUMORI DEL MECCANISMO. Ogni tasto ha il suo, tagliato dalla
  // registrazione di un lettore vero (9 ottobre 2026): play il motore che
  // parte, pausa lo stop, avanti e indietro lo scatto del tasto. Si guarda
  // quale file parte, intercettando play() degli elementi audio.
  const rumori = await page.evaluate(async ()=>{
    const r = await import('/js/radio.js');
    const sentiti = [];
    const vero = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(){
      if(/sfx\/walkman\//.test(this.src || '')) sentiti.push(this.src.split('/').pop());
      return Promise.resolve();
    };
    r.__seminaBrani([{id:'a',name:'Uno.mp3'},{id:'b',name:'Due.mp3'}]);
    const leggi = ()=> sentiti.splice(0);
    r.__metti('pausa');  document.getElementById('radio-onoff').click(); const daPausa = leggi();
    r.__metti('suona');  document.getElementById('radio-onoff').click(); const daSuona = leggi();
    document.getElementById('radio-succ').click(); const avanti = leggi();
    // MENTRE CARICA il tasto arancione non riparte dall'accensione: niente
    // cassetta, solo lo stop (e la richiesta di non partire quando arriva).
    // Era il difetto del 9 ottobre: dopo "avanti" il tasto arancione
    // rimetteva in play il brano vecchio.
    r.__metti('carico'); document.getElementById('radio-onoff').click(); const daCarico = leggi();
    HTMLMediaElement.prototype.play = vero;
    return { daPausa, daSuona, avanti, daCarico };
  });
  ok('e mentre carica il brano dopo, il tasto arancione fa lo stop e non rimette la cassetta',
     rumori.daCarico.includes('stop.mp3') && !rumori.daCarico.includes('cassetta.mp3'), rumori);
  ok('play fa partire il motore, pausa fa lo stop, avanti lo scatto del tasto',
     rumori.daPausa.includes('play.mp3') && rumori.daSuona.includes('stop.mp3')
       && rumori.avanti.includes('tasto.mp3'), rumori);
  ok('e il tasto avanti cambia brano',
     !radio.manca && radio.dopo.i === 1 && radio.dopo.titolo === 'Pioggia', radio);

  // ── IL WALKMAN NON SI SIEDE SULL'INTERRUTTORE ──
  // Messo a destra sotto il cronometro, sul telefono finiva sopra
  // l'interruttore della luce, che e' avvitato nell'angolo in basso a destra
  // (Giovanni, 7 ottobre 2026). Adesso sta a sinistra sotto il post-it. Si
  // misura su un telefono vero, perche' e' li' che lo spazio manca: e sul piu'
  // stretto che si usi ancora, 360 per 740.
  // E SOPRA LA BARRA-DUNA. Con la mappa e il biglietto fotografici (8 ottobre
  // 2026) il tavolo si e' allungato, e sul telefono di Giovanni — 412x773, con
  // la barra del browser aperta — il walkman finiva 90px sotto la barra. Il
  // caso peggiore e' con la frase del giorno, che sta su un cartiglio sotto la
  // mappa e la allunga di quattro righe: per questo la si mette sempre.
  const vecchia = page.viewportSize();
  const misureTavolo = [];
  for(const [w,h] of [[412,800],[412,773],[360,740]]){
    await page.setViewportSize({ width:w, height:h });
    misureTavolo.push(await page.evaluate(async (dim)=>{
      document.body.classList.add('is-touch');
      document.querySelectorAll('.screen').forEach(x=> x.classList.remove('active'));
      document.getElementById('screen-home').classList.add('active');
      const st = await import('/js/state.js'); const home = await import('/js/home.js');
      const p1 = home.newProjectObj('Kara', 24); p1.id='pw'; p1.microtask='Chiudere gli sfondi della tavola 7';
      st.setProjects([p1]);
      document.getElementById('home-quote').innerHTML =
        '<div>"Chi vuole sapere qualcosa di me — come artista, l\'unica cosa che conti — guardi con attenzione i miei quadri e cerchi di riconoscervi ciò che sono e ciò che voglio."</div><div>— Gustav Klimt</div>';
      await window.__aggiornaScrivania();
      await new Promise(r=> setTimeout(r, 400));
      const R = sel=>{ const e=document.querySelector(sel).getBoundingClientRect(); return {x:e.left,y:e.top,r:e.right,b:e.bottom,w:e.width}; };
      const tocca = (a,c)=> a.x<c.r && c.x<a.r && a.y<c.b && c.y<a.b;
      const wk = R('#radio'), lu = R('#scriv-luce'), pi = R('#scriv-biglietto');
      // SUL POST-IT SI', SULLE SCRITTE NO. Dall'8 ottobre il walkman sale
      // apposta sull'angolo del biglietto (la home non scorre piu' e gli
      // oggetti si accavallano), ma il compito e il nome del progetto devono
      // restare leggibili: si guarda quelle due righe, non il foglio intero.
      // Si guarda PUNTO PER PUNTO cosa c'e' in cima, non i riquadri: il
      // walkman e' inclinato, e il riquadro di un oggetto storto e' molto piu'
      // grande dell'oggetto — toccherebbe le scritte anche quando non le
      // copre. Si provano l'inizio e la fine di ogni riga del compito e il
      // centro dell'etichetta del progetto.
      const coperte = [];
      const prova = (x, y, dove)=>{
        const e = document.elementFromPoint(x, y);
        if(e && e.closest('#radio')) coperte.push(dove);
      };
      const bb = document.querySelector('#scriv-biglietto b');
      if(bb){
        [...bb.getClientRects()].forEach((q,i)=>{
          prova(q.left + 4, q.top + q.height/2, 'riga ' + (i+1) + ' inizio');
          prova(q.right - 4, q.top + q.height/2, 'riga ' + (i+1) + ' fine');
        });
      }
      const em = document.querySelector('#scriv-biglietto em');
      if(em){ const q = em.getBoundingClientRect(); prova(q.left + q.width/2, q.top + q.height/2, 'progetto'); }
      const tasti = R('.radio-tasti');
      return { dim, sullInterruttore: tocca(wk, lu), sulPostit: coperte.length > 0, coperte,
               tastiSottoLaBarra: Math.round(tasti.b - R('#dune-nav').y),
               scorre: (s=> s.scrollHeight - s.clientHeight)(document.getElementById('home-scroll')),
               scorrimento: getComputedStyle(document.getElementById('home-scroll')).overflowY,
               // Si misura IN FONDO allo scorrimento: sul 360x740 la home
               // scorre di qualche pixel (lo spazio manca davvero), e quello
               // che conta e' che il walkman si possa portare sopra la barra.
               sottoLaBarra: await (async ()=>{
                 const hs = document.getElementById('home-scroll');
                 hs.scrollTop = 99999; await new Promise(r=> setTimeout(r, 60));
                 const v = Math.round(document.getElementById('radio').getBoundingClientRect().bottom - R('#dune-nav').y);
                 hs.scrollTop = 0; return v; })(),
               // IL POST-IT RESTA COM'ERA: largo il 52% del tavolo, al massimo 214px.
               // Si misura offsetWidth, la larghezza del foglio da dritto: il
               // riquadro di getBoundingClientRect e' quello del foglio RUOTATO
               // di 1,4 gradi, che si allarga di un quarantesimo dell'altezza.
               // Col biglietto fotografico (7 ottobre) il testo e' sceso di 5px
               // per non finire sulla piega, e quel riquadro e' passato da 196 a
               // 199 senza che il foglio si fosse allargato di un pixel.
               postit: document.getElementById('scriv-biglietto').offsetWidth,
               // Sul telefono e' al 44%: e' stato ristretto l'8 ottobre per
               // far posto a un walkman piu' grande (vedi scrivania.css).
               attesa: Math.round(Math.min(214, document.querySelector('.scriv-riga').getBoundingClientRect().width * (innerWidth <= 520 ? .44 : .52))),
               walkman: Math.round(wk.w) };
    }, w+'x'+h));
  }
  await page.setViewportSize(vecchia);
  await page.evaluate(()=> document.body.classList.remove('is-touch'));
  ok('il walkman non si siede sull\'interruttore della luce',
     misureTavolo.every(t=> !t.sullInterruttore), misureTavolo);
  ok('e non copre quello che c\'e\' scritto sul biglietto', misureTavolo.every(t=> !t.sulPostit), misureTavolo);
  // Il walkman PUO' finire in parte dietro la barra: e' appoggiato sul bordo
  // della scrivania (composizione dell'8 ottobre). I suoi tasti no: devono
  // restare sopra la barra, se no non si accende la radio.
  ok('e sul telefono i tasti del walkman restano sopra la barra in fondo, anche con la frase del giorno',
     misureTavolo.every(t=> t.tastiSottoLaBarra <= 0), misureTavolo);
  // E SUL TELEFONO LA HOME NON SCORRE, MAI. Prima un margine pensato per gli
  // elenchi la faceva scorrere di qualche pixel, poi la frase del giorno che
  // sul telefono vero andava a capo una riga in piu': ogni volta tornava la
  // barra di scorrimento sul lato (Giovanni, 8 ottobre 2026, "non ci deve
  // stare nella home nessun tipo di scorrimento"). Adesso lo scorrimento e'
  // spento e gli oggetti si accavallano; la prova usa la frase piu' lunga che
  // si sia vista, cinque righe sul telefono.
  ok('e sul telefono la home non scorre, nemmeno con una frase lunga',
     misureTavolo.every(t=> t.scorrimento === 'hidden' || t.scorre <= 0), misureTavolo);
  ok('e il post-it resta largo com\'era', misureTavolo.every(t=> Math.abs(t.postit - t.attesa) <= 3), misureTavolo);

  // NIENTE TANGENTI. Il biglietto di stasera aveva il bordo sinistro a quattro
  // pixel da quello del foglio della mappa: due bordi QUASI allineati sono
  // peggio di due allineati — si legge come un errore di un pixel invece che
  // come una scelta (Giovanni, 21 settembre 2026). O combaciano, o si vede che
  // stanno a distanza.
  const tangente = await page.evaluate(async ()=>{
    const st = await import('/js/state.js');
    const home = await import('/js/home.js');
    const p = home.newProjectObj('Kara', 24); p.id='pk'; p.microtask='Chiudere gli sfondi';
    st.setProjects([p]);
    await window.__aggiornaScrivania();
    await new Promise(r=> setTimeout(r, 250));
    const f = document.querySelector('.scriv-foglio').getBoundingClientRect();
    const b = document.getElementById('scriv-biglietto').getBoundingClientRect();
    return { foglio: Math.round(f.left), biglietto: Math.round(b.left),
             scarto: Math.round(b.left - f.left) };
  });
  ok('il biglietto non e\' a filo col bordo del foglio',
     tangente.scarto > 18, tangente);

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
  // ── LA CAPSULA DEL CRONOMETRO ──
  // Mentre il cronometro gira, in basso a destra compare una capsula col tempo
  // che scorre. SULLA HOME NON SI VEDE, dal 21 settembre 2026: li' c'e' il
  // quadrante, che mostra lo stesso numero piu' grande — la capsula sarebbe
  // una seconda lettura della stessa cosa a dieci centimetri, e sul tavolo
  // sarebbe anche un oggetto che non c'entra con gli altri.
  // Sulle ALTRE schermate invece c'e', e li' non deve sedersi sopra niente che
  // si tocchi: un tasto coperto da un altro e' un tasto che non si puo'
  // premere. E' quello che questa prova guarda, ed e' il caso vero — prima
  // guardava la home, dove la capsula non compare piu'.
  const suHome = await page.evaluate(async ()=>{
    window.goHome();
    await new Promise(r=> setTimeout(r, 300));
    await window.tempoTocca();
    await new Promise(r=> setTimeout(r, 400));
    const caps = document.getElementById('tempo-capsula');
    const corre = document.getElementById('tempo-avvia').classList.contains('corre');
    const nascosta = caps.hidden;
    // e sulle altre schermate invece si vede
    await window.openProjects();
    await new Promise(r=> setTimeout(r, 500));
    const altrove = !caps.hidden;
    window.goHome();
    await new Promise(r=> setTimeout(r, 300));
    window.tempoScarta();
    await new Promise(r=> setTimeout(r, 400));
    const ok = document.getElementById('ink-confirm-ok');
    if(ok) ok.click();
    await new Promise(r=> setTimeout(r, 400));
    return { corre, nascosta, altrove };
  });
  ok('il cronometro parte davvero', suHome.corre, suHome);
  ok('sulla home la capsula non si vede: il quadrante e\' gia\' li\'',
     suHome.nascosta, suHome);
  ok('ma dalle altre schermate si vede', suHome.altrove, suHome);

  const sovrapposizioni = [];
  for(const vp of [{width:1100,height:760},{width:900,height:640},{width:1400,height:900}]){
    await page.setViewportSize(vp);
    await page.waitForTimeout(350);         // il rilevamento del tocco si ricalcola
    const r = await page.evaluate((misura)=>{
      // Si misura su una schermata in cui la capsula compare DAVVERO.
      document.querySelectorAll('.screen.active').forEach(x=> x.classList.remove('active'));
      document.getElementById('screen-projects').classList.add('active');
      const caps = document.getElementById('tempo-capsula');
      caps.hidden = false;
      const c = caps.getBoundingClientRect();
      const coperti = Array.from(document.querySelectorAll('.home-fab, .dune-btn, .seg-tab, button, a'))
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
     sovrapposizioni.every(x=> x.coperti.length === 0), sovrapposizioni);
  ok('e resta dentro la finestra a ogni misura',
     sovrapposizioni.every(r=> r.dentro), sovrapposizioni);

});
