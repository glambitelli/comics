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
    const arco = document.getElementById('tempo-arco');
    const g = document.getElementById('tempo-lancetta');
    const giro = parseFloat((arco.style.strokeDasharray || '0').split(/[\s,]+/)[0]) || 0;
    const gradi = parseFloat((g.getAttribute('transform') || 'rotate(0').replace('rotate(', '')) || 0;
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
    return { giro, gradi, acceso, cifre,
             dopo: document.getElementById('tempo-avvia').classList.contains('corre') };
  });
  ok('toccando il quadrante il cronometro parte', lancetta.acceso, lancetta);
  ok('e le cifre contano', /^00:0[0-9]$/.test(lancetta.cifre), lancetta);
  // Cento centesimi di giro sono trecentosessanta gradi: la lancetta e la
  // coda dell'arco devono indicare lo stesso punto del quadrante.
  ok('la lancetta punta dove finisce l\'arco',
     Math.abs(lancetta.gradi - lancetta.giro * 3.6) < 0.05, lancetta);
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
     senzaTask.riga && senzaTask.testo === 'STASERA', senzaTask);
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
    b.click(); await new Promise(r=> setTimeout(r, 200));
    return { prima, dopo, salvato, filtroAcceso, filtroSpento, interruttoreFuori,
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
