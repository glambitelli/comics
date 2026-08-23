// Scene — la struttura visiva di una scena breve
//
// La regola che questa suite difende sopra tutte le altre e' la prima: MAI IL
// VUOTO IN BLOCCO. Una scena nuova mostra un riquadro solo, e il secondo nasce
// quando il primo ha qualcosa dentro. Se un giorno qualcuno "sistemasse" il
// render disegnando dodici caselle in un colpo — che e' la cosa piu' naturale
// da scrivere — la sezione smetterebbe di funzionare per quello per cui e'
// stata fatta, e nessun errore lo direbbe. Lo dice questa prova.
const { suite } = require('../motore.js');

module.exports = () => suite("Scene — un riquadro per volta, cento caratteri",
  { banco: '/test/banco/scene.html' }, async ({ page, ok, sezione }) => {

  const stato = ()=> page.evaluate(()=>{
    const card = Array.from(document.querySelectorAll('.scene-card'));
    return {
      n: card.length,
      titoli: card.map(c=> c.querySelector('b').textContent),
      sottotitoli: card.map(c=>{ const s = c.querySelector('.scene-card-testo span'); return s ? s.textContent : null; }),
      vuoto: !!document.querySelector('.scene-vuoto'),
    };
  });
  const riquadri = ()=> page.evaluate(()=> Array.from(document.querySelectorAll('#scena-beat .beat')).map(b=>({
    n: b.querySelector('.beat-n').textContent,
    testo: b.querySelector('textarea').value,
    invito: b.querySelector('textarea').placeholder,
    nuovo: b.classList.contains('beat-nuovo'),
    conta: b.querySelector('.beat-conta').hidden ? null : b.querySelector('.beat-conta').textContent,
  })));
  // Le scene nuove entrano in CIMA all'elenco, quindi "la prima scheda" non e'
  // la prima scena creata: si apre quella che si vuole cercandola per titolo.
  const apriPerTitolo = async (titolo)=>{
    await page.evaluate(t=>{
      const card = Array.from(document.querySelectorAll('.scene-card'))
        .find(c=> c.querySelector('b').textContent === t);
      card.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    }, titolo);
    await page.waitForTimeout(450);
  };
  // Si scrive nell'ultimo riquadro, che e' sempre quello vuoto in coda.
  const scriviNel = async (indice, testo)=>{
    await page.evaluate(([i,t])=>{
      const ta = document.querySelectorAll('#scena-beat .beat textarea')[i];
      ta.focus(); ta.value = t;
      ta.dispatchEvent(new Event('input', {bubbles:true}));
    }, [indice, testo]);
    await page.waitForTimeout(80);
  };

  sezione('a schermata vuota non c\'e\' niente da riempire');
  let s = await stato();
  ok('nessuna scena', s.n === 0, s);
  ok('e lo stato vuoto lo dice in tre parole', s.vuoto, s);
  const invito = await page.evaluate(()=> document.getElementById('scene-nuova').textContent.trim());
  ok('c\'e\' un solo modo di cominciare, e dice quale', /nuova scena/i.test(invito), invito);

  sezione('una scena nuova si apre da sola, e mostra UN riquadro solo');
  // Il cuore di tutto: mai una griglia vuota. Dodici caselle che aspettano sono
  // l'immagine che fa chiudere l'app.
  await page.evaluate(()=> document.getElementById('scene-nuova').click());
  await page.waitForTimeout(450);
  const aperta = await page.evaluate(()=>({
    foglio: document.getElementById('scena').classList.contains('open'),
    titolo: document.getElementById('scena-titolo').value,
    invito: document.getElementById('scena-titolo').placeholder,
  }));
  ok('il foglio della scena si apre nello stesso tocco', aperta.foglio, aperta);
  ok('il titolo non e\' una domanda da sbrigare: e\' vuoto', aperta.titolo === '', aperta);
  ok('e dice come si chiamera\' se non lo scrivi', /senza titolo/i.test(aperta.invito), aperta);
  // NIENTE TASTIERA ALL'APERTURA. Il cursore ci andava da solo, nel primo
  // riquadro vuoto: aprendo una scena che esiste gia' si vuole prima
  // GUARDARLA, e la tastiera che sale si mangia meta' schermo proprio mentre il
  // foglio sta ancora salendo.
  const fuocoIniziale = await page.evaluate(()=>{
    const a = document.activeElement;
    return { dentro: !!(a && a.closest && a.closest('#scena')), tag: a ? a.tagName : null };
  });
  ok('nessun campo prende il cursore da solo', !fuocoIniziale.dentro, fuocoIniziale);
  let r = await riquadri();
  ok('c\'e\' UN SOLO riquadro', r.length === 1, r);
  ok('ed e\' quello vuoto in coda', r[0].nuovo === true && r[0].testo === '', r);
  ok('con dentro la domanda giusta', r[0].invito === 'Cosa si vede?', r);
  ok('il contatore non c\'e\': non serve a chi ha appena cominciato', r[0].conta === null, r);

  sezione('compilato il primo, appare il secondo');
  await scriviNel(0, 'Il ladro entra dalla finestra, di spalle');
  r = await riquadri();
  ok('adesso i riquadri sono due', r.length === 2, r);
  ok('il primo e\' diventato un beat vero', r[0].nuovo === false && r[0].n === '1', r);
  ok('e sotto ne e\' nato uno vuoto, numero due', r[1].nuovo === true && r[1].n === '2' && r[1].testo === '', r);
  ok('mai due vuoti insieme', r.filter(x=>x.nuovo).length === 1, r);

  sezione('e il testo scritto non viene ridisegnato sotto le dita');
  // Promuovere il riquadro ridisegnando tutto sarebbe la scrittura piu' corta,
  // e porterebbe via il cursore a meta' della parola che si sta battendo.
  const fuoco = await page.evaluate(()=>{
    const ta = document.activeElement;
    return { dentroUnBeat: !!(ta && ta.closest && ta.closest('#scena-beat')),
             valore: ta && ta.value };
  });
  ok('il cursore e\' rimasto nel riquadro che si stava scrivendo',
     fuoco.dentroUnBeat && /ladro entra/.test(fuoco.valore||''), fuoco);

  sezione('il terzo nasce come il secondo, e non prima');
  await scriviNel(1, 'Primo piano della mano sul davanzale');
  r = await riquadri();
  ok('tre riquadri, due pieni e uno vuoto', r.length === 3 && r.filter(x=>x.nuovo).length === 1, r);
  ok('numerati di seguito', r.map(x=>x.n).join(',') === '1,2,3', r);

  sezione('cento caratteri, e il contatore compare solo in vista del fondo');
  await scriviNel(2, 'a'.repeat(65));
  r = await riquadri();
  ok('a sessantacinque caratteri il contatore tace', r[2].conta === null, r);
  await scriviNel(2, 'b'.repeat(72));
  r = await riquadri();
  ok('a settantadue compare', r[2].conta === '72/100', r);
  const tetto = await page.evaluate(()=>{
    const ta = document.querySelectorAll('#scena-beat .beat textarea')[2];
    return ta.getAttribute('maxlength');
  });
  ok('e il limite lo tiene il campo stesso, non un avviso', tetto === '100', tetto);

  sezione('svuotare un riquadro equivale a buttarlo');
  // Stesso patto del taccuino. Succede USCENDO dal riquadro e non mentre si
  // cancella: sparire sotto le dita a meta' di una riscrittura sarebbe
  // insopportabile.
  await scriviNel(2, '');
  r = await riquadri();
  ok('mentre si cancella il riquadro resta dov\'e\'', r.length === 4, r);
  await page.evaluate(()=> document.activeElement.blur());
  await page.waitForTimeout(120);
  r = await riquadri();
  ok('uscendo, il riquadro vuoto sparisce', r.length === 3, r);
  ok('e restano i due beat scritti piu\' il vuoto in coda',
     r[0].nuovo === false && r[1].nuovo === false && r[2].nuovo === true, r);

  sezione('e col dito nessun foglio ha la sua freccia');
  // Stessa regola del lettore degli albi e dei frammenti a schermo intero:
  // il tasto Indietro chiude, sta sotto il pollice ed e' li' da
  // sempre, mentre una freccia nell'angolo in alto a sinistra e' il punto piu'
  // lontano dalla mano che regge il telefono. Le due chiusure passano dalla
  // stessa strada — la cronologia — quindi nessuna fa qualcosa che l'altra non
  // farebbe.
  const frecce = await page.evaluate(()=>{
    const quali = ['scena-chiudi','sceltarif-chiudi','schizzo-chiudi'];
    document.body.classList.add('is-touch');
    const conDito = quali.map(id=> getComputedStyle(document.getElementById(id)).display);
    document.body.classList.remove('is-touch');
    const colMouse = quali.map(id=> getComputedStyle(document.getElementById(id)).display);
    return { quali, conDito, colMouse };
  });
  ok('col dito spariscono tutte', frecce.conDito.every(d=> d === 'none'), frecce);
  ok('col mouse restano tutte', frecce.colMouse.every(d=> d !== 'none'), frecce);

  sezione('il titolo si scrive quando viene, e finisce nell\'elenco');
  await page.evaluate(()=>{
    const t = document.getElementById('scena-titolo');
    t.value = 'La finestra sul cortile';
    t.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.evaluate(()=> document.getElementById('scena-chiudi').click());
  await page.waitForTimeout(250);
  s = await stato();
  ok('chiusa la scena si torna all\'elenco', s.n === 1, s);
  ok('col titolo scritto', s.titoli[0] === 'La finestra sul cortile', s);
  // NON un conteggio ("2 beat"): un numero dice quanto si e' fatto, e quanto si
  // e' fatto qui non interessa a nessuno. La prima immagine invece dice di che
  // scena si tratta.
  ok('e sotto il PRIMO BEAT, non un conteggio',
     /ladro entra/.test(s.sottotitoli[0]||'') && !/\bbeat\b/i.test(s.sottotitoli[0]||''), s);

  sezione('una scena senza titolo si chiama da sola');
  await page.evaluate(()=> document.getElementById('scene-nuova').click());
  await page.waitForTimeout(450);
  await page.evaluate(()=> document.getElementById('scena-chiudi').click());
  await page.waitForTimeout(250);
  s = await stato();
  ok('sono due scene', s.n === 2, s);
  ok('e quella nuova ha un nome suo', s.titoli.includes('Scena senza titolo'), s);
  ok('senza niente sotto, perche\' non c\'e\' ancora niente da vedere',
     s.sottotitoli.filter(x=>x===null).length === 1, s);

  sezione('e da nessuna parte c\'e\' una parola da ufficio');
  // Niente progetti, obiettivi, task, progressi, percentuali. E' la regola di
  // tono della sezione, ed e' facile perderla aggiungendo una funzione alla
  // volta: qui si guarda tutto il testo a schermo in una volta sola.
  const parole = await page.evaluate(()=>{
    const t = [document.getElementById('screen-scene'), document.getElementById('scena')]
      .map(e=> e.textContent + ' ' + Array.from(e.querySelectorAll('[placeholder]')).map(x=>x.placeholder).join(' '))
      .join(' ');
    return t.toLowerCase();
  });
  for(const p of ['progetto','progress','obiettivo','task','completat','%']){
    ok('non compare la parola "' + p + '"', !parole.includes(p), parole.slice(0, 200));
  }

  sezione('nessuna barra, nessuna soglia');
  const misure = await page.evaluate(()=>({
    barre: document.querySelectorAll('#screen-scene progress, #scena progress, #scena .barra, #scena [role="progressbar"]').length,
  }));
  ok('non c\'e\' nessuna barra di completamento', misure.barre === 0, misure);

  sezione('e quello che si scrive finisce davvero in archivio');
  const scritte = await page.evaluate(()=>{
    const s = window.__scritture || [];
    // La scena che interessa e' quella col titolo, non l'ultima scritta: le
    // scene nuove entrano in cima all'elenco, quindi l'ultima scrittura e'
    // quella vuota creata dopo.
    const ultima = s.filter(x=> x.col === 'scene' && x.data && x.data.titolo).pop();
    return {
      collezione: (s[0]||{}).col,
      quante: s.filter(x=> x.col === 'scene').length,
      beat: ultima && ultima.data && (ultima.data.beat||[]).map(b=> b.testo),
      titolo: ultima && ultima.data && ultima.data.titolo,
    };
  });
  ok('si scrive nella collezione "scene"', scritte.collezione === 'scene', scritte);
  ok('e il documento porta il titolo scritto', scritte.titolo === 'La finestra sul cortile', scritte);
  ok('e i beat, in ordine, senza il riquadro vuoto in coda',
     Array.isArray(scritte.beat) && scritte.beat.length === 2 &&
     /ladro entra/.test(scritte.beat[0]) && /davanzale/.test(scritte.beat[1]), scritte);

  sezione('il tasto Indietro chiude la scena, non la schermata');
  // Le due chiusure passano dalla stessa strada — la cronologia — cosi' il
  // tasto del telefono e la freccia a schermo fanno la stessa identica cosa.
  await apriPerTitolo('La finestra sul cortile');
  ok('la scena si riapre toccandola in elenco',
     await page.evaluate(()=> document.getElementById('scena').classList.contains('open')), null);
  ok('e nemmeno riaprendone una che esiste gia\' si alza la tastiera',
     await page.evaluate(()=>{
       const a = document.activeElement;
       return !(a && a.closest && a.closest('#scena'));
     }), null);
  const riaperta = await riquadri();
  ok('e ritrova i suoi beat, piu\' il vuoto in coda',
     riaperta.length === 3 && /ladro entra/.test(riaperta[0].testo), riaperta);
  await page.goBack();
  await page.waitForTimeout(250);
  ok('un passo indietro chiude la scena',
     await page.evaluate(()=> !document.getElementById('scena').classList.contains('open')), null);

  sezione('i beat si riordinano tenendoli premuti');
  // IL GESTO VERO, dito compreso. La prova di prima chiamava la funzione a mano
  // e diceva che tutto andava bene mentre sul telefono non succedeva niente: la
  // presa partiva dentro il campo di testo, e li' tenere premuto e' il gesto con
  // cui Android comincia a SELEZIONARE — lente e maniglie comprese. Adesso la
  // presa parte da tutto il resto della scheda, e questa prova ci si appoggia
  // davvero.
  await apriPerTitolo('La finestra sul cortile');
  await page.evaluate(()=>{
    const s = window.scene.scenaAperta();
    s.beat = [{id:'a',testo:'uno'},{id:'b',testo:'due'},{id:'c',testo:'tre'}];
    window.scene.renderBeat();
  });
  await page.waitForTimeout(250);
  const trascinato = await page.evaluate(async ()=>{
    // Si prende dalla VIGNETTA, che e' quasi meta' scheda: e' da li' che il
    // dito afferra, non dal testo.
    const card = document.querySelectorAll('#scena-beat .beat')[0];
    const presa = card.querySelector('.beat-mini');
    const r = presa.getBoundingClientRect();
    const x = r.left + r.width/2, y0 = r.top + r.height/2;
    const t = yy => [new Touch({identifier:1, target:presa, clientX:x, clientY:yy})];
    presa.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:t(y0),targetTouches:t(y0)}));
    await new Promise(r=> setTimeout(r,600));
    const sollevata = card.classList.contains('trascinata');
    for(let i=1;i<=8;i++){
      const yy = y0 + i*30;
      presa.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:t(yy),targetTouches:t(yy)}));
      await new Promise(r=> setTimeout(r,20));
    }
    presa.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[]}));
    presa.dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r,350));
    return {
      sollevata,
      ordine: window.scene.scenaAperta().beat.map(b=> b.testo),
      // Mollando il dito sulla vignetta non si deve aprire anche la scelta di
      // un riferimento: il browser manda comunque un click.
      scelta: document.getElementById('sceltarif').classList.contains('open'),
      // E i numeri seguono le schede, se no dopo uno spostamento la scena si
      // legge in un ordine e si numera in un altro.
      numeri: Array.from(document.querySelectorAll('#scena-beat .beat-n')).map(x=> x.textContent),
    };
  });
  ok('tenendo premuta la vignetta la scheda si solleva', trascinato.sollevata, trascinato);
  ok('e spostandola cambia l\'ordine',
     trascinato.ordine.join(',') === 'due,uno,tre', trascinato);
  ok('senza aprire la scelta di un riferimento', !trascinato.scelta, trascinato);
  ok('e i numeri seguono le schede',
     trascinato.numeri.slice(0,3).join(',') === '1,2,3', trascinato);

  sezione('e il menu del browser non si intromette');
  // Tenere premuto su un'IMMAGINE apre il menu di Chrome — "apri immagine",
  // "scarica immagine", "cerca con Lens" — mezzo secondo dopo l'inizio della
  // pressione, cioe' un attimo dopo che la scheda si e' sollevata: il gesto se
  // lo prendeva lui, e al posto di spostare una scheda si apriva un pannello di
  // sistema che non c'entra niente.
  const menuBrowser = await page.evaluate(()=>{
    const card = document.querySelector('#scena-beat .beat');
    const vignetta = card.querySelector('.beat-mini');
    const ta = card.querySelector('textarea');
    const prova = el=>{
      const ev = new MouseEvent('contextmenu', {bubbles:true, cancelable:true});
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    return {
      sullaVignetta: prova(vignetta),
      // Dentro il campo di testo il menu del browser e' quello del testo, ed e'
      // roba sua: non glielo si toglie.
      sulTesto: prova(ta),
    };
  });
  ok('sulla vignetta il menu del browser e\' fermato', menuBrowser.sullaVignetta, menuBrowser);
  ok('ma sul testo resta il suo', !menuBrowser.sulTesto, menuBrowser);

  sezione('ma dal testo la presa non parte');
  // Dentro un campo di testo tenere premuto e' del sistema: e' il gesto con cui
  // si seleziona. Provare a rubarglielo vuol dire perdere tutti e due.
  const dalTesto = await page.evaluate(async ()=>{
    const card = document.querySelectorAll('#scena-beat .beat')[0];
    const ta = card.querySelector('textarea');
    const r = ta.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + 8;
    const t = ()=> [new Touch({identifier:1, target:ta, clientX:x, clientY:y})];
    ta.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:t(),targetTouches:t()}));
    await new Promise(r=> setTimeout(r,700));
    const sollevata = card.classList.contains('trascinata');
    ta.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],targetTouches:[]}));
    return sollevata;
  });
  ok('la scheda resta dov\'e\'', !dalTesto, dalTesto);

  sezione('la card fantasma e\' una CARD, non un pulsante "+"');
  // La differenza non e' estetica: un "+" chiede di decidere di aggiungere
  // qualcosa, una card gia' pronta chiede solo di scrivere. Deve essere
  // tratteggiata (si vede che non e' ancora niente), avere dentro la domanda, e
  // aprire la tastiera al tocco — cioe' contenere un campo vero.
  const fantasma = await page.evaluate(()=>{
    const box = document.querySelector('#scena-beat .beat-nuovo');
    const ta = box.querySelector('textarea');
    const st = getComputedStyle(box);
    const tutti = document.getElementById('scena-beat').textContent;
    return {
      tratteggiata: st.borderTopStyle === 'dashed',
      campo: ta ? ta.tagName : null,
      invito: ta ? ta.placeholder : null,
      // Larga quanto le altre: e' una card della fila, non un bottoncino.
      larga: Math.round(box.getBoundingClientRect().width),
      largaAltre: Math.round(document.querySelector('#scena-beat .beat:not(.beat-nuovo)').getBoundingClientRect().width),
      piu: /\+/.test(tutti),
    };
  });
  ok('e\' tratteggiata', fantasma.tratteggiata, fantasma);
  ok('col campo dentro, cosi\' toccandola si scrive e basta', fantasma.campo === 'TEXTAREA', fantasma);
  ok('e la domanda sempre quella', fantasma.invito === 'Cosa si vede?', fantasma);
  ok('larga quanto le altre card', fantasma.larga === fantasma.largaAltre, fantasma);
  ok('e da nessuna parte c\'e\' un "+" da premere', !fantasma.piu, fantasma);

  sezione('sotto la card fantasma lo spazio non resta deserto');
  // Con due beat restava mezzo schermo vuoto: e' la pagina bianca vista da
  // un'altra parte, e demotiva prima di cominciare.
  const sagome = await page.evaluate(()=>{
    const cont = document.getElementById('scena-beat');
    const s = Array.from(cont.querySelectorAll('.beat-sagoma'));
    const ultima = cont.querySelector('.beat-nuovo');
    return {
      quante: s.length,
      // Dopo la card fantasma, non prima e non in mezzo ai beat.
      dopo: s.every(x=> x.compareDocumentPosition(ultima) & Node.DOCUMENT_POSITION_PRECEDING),
      // Non si toccano e non contengono niente.
      mute: s.every(x=> !x.textContent.trim() && getComputedStyle(x).pointerEvents === 'none'),
      // Sbiadite: sono un accenno, non due card da riempire.
      sbiadite: s.every(x=> parseFloat(getComputedStyle(x).opacity) < 0.5),
      // E non entrano nel riordino: quello prende solo le .beat.
      fuoriDalGesto: s.every(x=> !x.classList.contains('beat')),
    };
  });
  ok('ci sono due sagome accennate', sagome.quante === 2, sagome);
  ok('dopo la card fantasma', sagome.dopo, sagome);
  ok('mute e non toccabili', sagome.mute, sagome);
  ok('appena accennate', sagome.sbiadite, sagome);
  ok('e fuori dal riordino', sagome.fuoriDalGesto, sagome);

  sezione('la card e\' ribaltata: il disegno e\' il protagonista');
  // Prima la card era un campo di testo con un quadratino da 42px in un angolo e
  // una matita dentro: una fila di righe bianche in cui il disegno era
  // un'opzione da scovare. Adesso la vignetta occupa mezza card ed E' il punto
  // d'ingresso al disegno — un bersaglio cosi' non ha bisogno di un'icona che
  // spieghi che si puo' toccare.
  const carta = await page.evaluate(()=>{
    const b = document.querySelector('#scena-beat .beat');
    const mini = b.querySelector('.beat-mini');
    const corpo = b.querySelector('.beat-corpo');
    const rb = b.getBoundingClientRect(), rm = mini.getBoundingClientRect(), rc = corpo.getBoundingClientRect();
    return {
      quota: +(rm.width / rb.width).toFixed(3),
      forma: +(rm.width / rm.height).toFixed(2),
      aSinistra: rm.left < rc.left,
      alta: Math.round(rb.height),
      // La miniatura E' il pulsante del disegno.
      apreIlDisegno: mini.hasAttribute('data-schizzo'),
      // E la vecchia matita d'angolo non c'e' piu' da nessuna parte.
      matita: document.querySelectorAll('#scena-beat .beat-schizzo').length,
      // Vuota: tratteggiata, come la card fantasma. Si vede che non c'e' ancora
      // niente, senza che nessuno lo scriva.
      vuotaTratteggiata: getComputedStyle(mini).borderTopStyle === 'dashed',
    };
  });
  ok('la miniatura occupa fra il 40 e il 45% della card',
     carta.quota >= 0.40 && carta.quota <= 0.45, carta);
  ok('in proporzione 4:3, formato vignetta', Math.abs(carta.forma - 4/3) < 0.05, carta);
  ok('e sta a sinistra, col testo a destra', carta.aSinistra, carta);
  ok('toccandola si apre il disegno', carta.apreIlDisegno, carta);
  ok('la matita nell\'angolo non c\'e\' piu\'', carta.matita === 0, carta);
  ok('vuota e\' tratteggiata', carta.vuotaTratteggiata, carta);
  ok('e la card si riempie da sola: non e\' piu\' una riga', carta.alta >= 100, carta);

  sezione('e un filo verticale infila le card una nell\'altra');
  // Una fila di card e' un elenco; le stesse card infilate su un filo sono una
  // sequenza — che e' quello che una scena e'.
  const spina = await page.evaluate(()=>{
    const leggi = el => getComputedStyle(el, '::after');
    const prima = document.querySelector('#scena-beat .beat:not(.beat-nuovo)');
    const fantasma = document.querySelector('#scena-beat .beat-nuovo');
    return {
      suUnaCard: leggi(prima).content !== 'none' && parseFloat(leggi(prima).height) > 0,
      sottile: parseFloat(leggi(prima).width) <= 2,
      // Si interrompe DOPO la card fantasma: sotto non c'e' piu' niente di
      // scritto, e un filo che continuasse nel vuoto prometterebbe qualcosa.
      nonDopoLaFantasma: leggi(fantasma).display === 'none',
    };
  });
  ok('il filo c\'e\' sotto le card', spina.suUnaCard, spina);
  ok('ed e\' sottile, non una barra', spina.sottile, spina);
  ok('e si ferma dopo la card fantasma', spina.nonDopoLaFantasma, spina);

  sezione('ogni beat si puo\' disegnare invece che scrivere');
  // Per chi disegna e' la strada piu' naturale, quindi ha la stessa dignita'
  // della tastiera: la matita sta dentro OGNI riquadro, card fantasma compresa.
  const matite = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('#scena-beat .beat'));
    return {
      tutte: b.every(x=> !!x.querySelector('.beat-mini[data-schizzo]')),
      anchePerLaFantasma: !!document.querySelector('#scena-beat .beat-nuovo .beat-mini[data-schizzo]'),
    };
  });
  ok('la vignetta da disegnare c\'e\' in ogni riquadro', matite.tutte, matite);
  ok('anche nella card fantasma', matite.anchePerLaFantasma, matite);

  await page.evaluate(()=> document.querySelector('#scena-beat .beat-nuovo [data-schizzo]').click());
  await page.waitForTimeout(400);
  const scelta = await page.evaluate(()=>({
    aperta: document.getElementById('sceltarif').classList.contains('open'),
    disegna: !!document.querySelector('#sceltarif-griglia [data-disegna]'),
    // "Togli" solo quando c'e' qualcosa da togliere.
    togli: !document.getElementById('sceltarif-togli').hidden,
  }));
  ok('toccando la vignetta si apre l\'archivio', scelta.aperta, scelta);
  ok('con dentro anche "Disegnalo"', scelta.disegna, scelta);
  ok('e "Togli" spento, perche\' non c\'e\' niente da togliere', !scelta.togli, scelta);

  await page.evaluate(()=> document.querySelector('#sceltarif-griglia [data-disegna]').click());
  await page.waitForTimeout(400);
  const foglio = await page.evaluate(()=>{
    const f = document.getElementById('schizzo');
    return {
      aperto: f.classList.contains('open'),
      // Un tratto solo, niente colori, niente gomma: ogni strumento in piu' e'
      // una decisione da prendere prima di cominciare a disegnare.
      strumenti: Array.from(f.querySelectorAll('button')).map(b=> b.id),
      colori: f.querySelectorAll('input[type=color], .colore').length,
    };
  });
  ok('il foglio da disegno si apre', foglio.aperto, foglio);
  ok('con annulla e pulisci, e nient\'altro',
     foglio.strumenti.join(',') === 'schizzo-chiudi,schizzo-annulla,schizzo-pulisci', foglio);
  ok('nessun colore da scegliere', foglio.colori === 0, foglio);

  // Si disegna col mouse: Playwright genera veri eventi pointer, che e' quello
  // che il foglio ascolta.
  const box = await page.evaluate(()=>{
    const r = document.getElementById('schizzo-tela').getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  });
  await page.mouse.move(box.x - 40, box.y - 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 8 });
  await page.mouse.move(box.x + 50, box.y - 10, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(120);
  const tratto = await page.evaluate(()=>({
    annullaAcceso: !document.getElementById('schizzo-annulla').disabled,
    // Il foglio non e' piu' bianco: qualcosa e' stato dipinto davvero.
    dipinto: (()=>{
      const c = document.getElementById('schizzo-tela');
      const d = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      let scuri = 0;
      for(let i=0;i<d.length;i+=4) if(d[i] < 120) scuri++;
      return scuri;
    })(),
  }));
  ok('il tratto finisce sul foglio', tratto.dipinto > 50, tratto);
  ok('e "annulla" si accende', tratto.annullaAcceso, tratto);

  await page.evaluate(()=> document.getElementById('schizzo-chiudi').click());
  await page.waitForTimeout(700);
  // Chiuso il foglio si torna alla scelta, che resta aperta: si vede la
  // miniatura appena fatta e "Togli" che si e' acceso. Da li' si esce a mano.
  const tornati = await page.evaluate(()=>({
    scelta: document.getElementById('sceltarif').classList.contains('open'),
    togli: !document.getElementById('sceltarif-togli').hidden,
  }));
  ok('chiuso il disegno si torna alla scelta', tornati.scelta, tornati);
  ok('e adesso "Togli" c\'e\'', tornati.togli, tornati);
  await page.evaluate(()=> document.getElementById('sceltarif-chiudi').click());
  await page.waitForTimeout(400);
  const dopoDisegno = await page.evaluate(()=>{
    const b = Array.from(document.querySelectorAll('#scena-beat .beat'));
    const s = window.scene.scenaAperta();
    return {
      chiuso: !document.getElementById('schizzo').classList.contains('open'),
      // La card fantasma su cui si e' disegnato e' diventata un beat vero, e
      // sotto ne e' nata un'altra: esattamente come scrivendoci dentro.
      conDisegno: s.beat.filter(x=> window.scene.rifiDi(x).length).length,
      senzaTesto: s.beat.filter(x=> window.scene.rifiDi(x).length && !(x.testo||'').trim()).length,
      fantasmaInCoda: b[b.length-1].classList.contains('beat-nuovo'),
      miniatura: !!document.querySelector('#scena-beat .beat-mini.pieno img'),
    };
  });
  ok('chiudendo, il foglio si chiude e il disegno si salva', dopoDisegno.chiuso, dopoDisegno);
  ok('la card fantasma e\' diventata un beat', dopoDisegno.conDisegno === 1, dopoDisegno);
  ok('un beat con SOLO il disegno e\' un beat pieno', dopoDisegno.senzaTesto === 1, dopoDisegno);
  ok('e sotto e\' nata la card fantasma nuova', dopoDisegno.fantasmaInCoda, dopoDisegno);
  ok('nel riquadro compare la miniatura', dopoDisegno.miniatura, dopoDisegno);

  sezione('e nella vignetta ci si collega un riferimento dell\'archivio');
  // E' la cosa che serve davvero, ed e' la stessa che si fa coi progetti — un
  // riferimento visivo attaccato a qualcosa da disegnare — solo dall'altro
  // capo: li' si parte dall'immagine e si sceglie il progetto, qui si parte dal
  // beat e si sceglie l'immagine.
  await page.evaluate(()=> window.seminaRif(6));
  await page.evaluate(()=> document.querySelector('#scena-beat .beat-nuovo [data-schizzo]').click());
  await page.waitForTimeout(500);

  // SI ENTRA DALLE CARTELLE, non da una parete di miniature in ordine di data:
  // le cartelle sono gia' il modo in cui l'archivio e' organizzato, e cercare
  // scorrendo tutto e' l'attrito che questa sezione evita ovunque.
  // SI ASCOLTANO TUTTE E DUE LE COLLEZIONI. Le Scene leggevano le immagini
  // senza leggere le cartelle: un'immagine sa in quale cartella sta, ma il NOME
  // della cartella e' nell'altra collezione, e senza quella ogni gruppo cadeva
  // sul ripiego "Senza cartella" — sei cartelle senza nome a schermo.
  const ascolti = await page.evaluate(()=> window.__ascolti || []);
  ok('si ascoltano le immagini', ascolti.includes('refs'), ascolti);
  ok('e anche le cartelle, se no non hanno un nome', ascolti.includes('refFolders'), ascolti);

  const cartelle = await page.evaluate(()=>({
    quante: document.querySelectorAll('#sceltarif-griglia [data-cartella]').length,
    categorie: Array.from(document.querySelectorAll('.sceltarif-categoria')).map(x=> x.textContent),
    senzaNome: Array.from(document.querySelectorAll('.sceltarif-nome'))
      .filter(x=> /senza cartella/i.test(x.textContent)).length,
    // Nessuna immagine sciolta a schermo: prima si sceglie dove guardare.
    immaginiSubito: document.querySelectorAll('#sceltarif-griglia [data-rif]').length,
    nomi: Array.from(document.querySelectorAll('.sceltarif-nome')).map(x=> x.textContent),
    // Un mosaico di quattro invece di un nome e basta: una cartella di
    // riferimenti si riconosce da cosa c'e' dentro.
    conMosaico: Array.from(document.querySelectorAll('[data-cartella]'))
      .every(x=> x.querySelectorAll('.sceltarif-mosaico img').length > 0),
    quanteDentro: Array.from(document.querySelectorAll('.sceltarif-quante')).map(x=> x.textContent),
  }));
  ok('si aprono le cartelle, non i frammenti', cartelle.quante === 2 && cartelle.immaginiSubito === 0, cartelle);
  ok('coi nomi veri dell\'archivio', cartelle.nomi.sort().join(',') === 'MANI,OTOMO', cartelle);
  ok('e nessuna che ripiega su "Senza cartella"', cartelle.senzaNome === 0, cartelle);
  // Raggruppate per categoria come nell'archivio: e' li' che si e' deciso come
  // sta insieme questa roba, e ritrovarla ordinata in un altro modo vorrebbe
  // dire impararla due volte.
  ok('raggruppate per categoria', cartelle.categorie.join(',') === 'Artists,Study', cartelle);
  ok('e un assaggio di cosa c\'e\' dentro', cartelle.conMosaico, cartelle);
  ok('e quante ce ne sono', cartelle.quanteDentro.sort().join(',') === '2,4', cartelle);

  await page.evaluate(()=>{
    const c = Array.from(document.querySelectorAll('[data-cartella]'))
      .find(x=> /OTOMO/.test(x.textContent));
    c.click();
  });
  await page.waitForTimeout(300);
  const archivio = await page.evaluate(()=>({
    tessere: document.querySelectorAll('#sceltarif-griglia [data-rif]').length,
    dove: (document.getElementById('sceltarif-dove')||{}).textContent,
    // In proporzione da vignetta, come nella card: si sceglie
    // guardando la forma che avra' una volta collegata.
    forma: (()=>{
      const r = document.querySelector('#sceltarif-griglia [data-rif]').getBoundingClientRect();
      return +(r.width / r.height).toFixed(2);
    })(),
    perRiga: (()=>{
      const t = Array.from(document.querySelectorAll('#sceltarif-griglia [data-rif]'));
      const cima = Math.round(t[0].getBoundingClientRect().top);
      return t.filter(x=> Math.abs(x.getBoundingClientRect().top - cima) < 3).length;
    })(),
  }));
  // Dentro OTOMO ci sono quattro immagini, di cui una segnata come tavola:
  // nella scheda Frammenti se ne vedono tre.
  ok('entrando si vedono i suoi frammenti', archivio.tessere === 3, archivio);
  // Anche qui il muretto: le tessere non hanno tutte la stessa altezza, si
  // incastrano. Con riquadri uguali venti ritagli diventavano venti quadratini
  // indistinguibili.
  // Le stesse misure di .refs-grid: se un giorno cambiano la', questa prova lo
  // dice prima che le due schermate comincino a somigliarsi solo un po'.
  // Il numero di colonne dipende da quanto e' larga la schermata, e le due non
  // sono larghe uguali: quello che deve coincidere e' la REGOLA — stesso spazio
  // fra le tessere, stessa larghezza minima, stessa forma quadrata.
  // Gli 8px di spazio e i 78 di larghezza minima sono quelli di .refs-grid in
  // refs.css. Scritti qui perche' la griglia dell'archivio, in questo banco, non
  // e' a schermo e non si puo' misurare: se un giorno cambiano li', questa prova
  // cade e ricorda che vanno cambiati anche nella scelta.
  const stesseMisure = await page.evaluate(()=>{
    const st = getComputedStyle(document.getElementById('sceltarif-griglia'));
    const col = st.gridTemplateColumns.split(' ').map(parseFloat).filter(n=> !isNaN(n));
    return { gap: st.gap, larga: Math.round(Math.min(...col)) };
  });
  ok('stesso spazio fra le tessere dell\'archivio', stesseMisure.gap === '8px', stesseMisure);
  ok('e tessere larghe almeno quanto le sue', stesseMisure.larga >= 78, stesseMisure);
  ok('e la barra dice dove si e\'', /OTOMO/.test(archivio.dove||''), archivio);
  // LE STESSE MINIATURE DELL'ARCHIVIO: quadrate e fitte. E' la stessa roba
  // guardata dall'altra parte, e passare dall'archivio alla scelta non deve
  // sembrare di cambiare app.
  ok('in tessere quadrate, come nell\'archivio', Math.abs(archivio.forma - 1) < 0.06, archivio);
  ok('e fitte, non due per riga', archivio.perRiga >= 3, archivio);

  sezione('e dentro una cartella ci sono le due schede dell\'archivio');
  // Dentro un autore ci sono i frammenti e ci sono le tavole, e sono due cose
  // che si cercano in momenti diversi.
  const schede = await page.evaluate(()=>({
    visibili: !document.getElementById('sceltarif-tab').hidden,
    voci: Array.from(document.querySelectorAll('#sceltarif-tab [data-tab]')).map(x=> x.textContent.trim()),
    attiva: (document.querySelector('#sceltarif-tab .active')||{}).dataset?.tab,
  }));
  ok('le schede ci sono', schede.visibili, schede);
  ok('e dicono quante ce ne sono per parte',
     schede.voci.join('|') === 'Frammenti 3|Tavole 1', schede);
  ok('si parte dai frammenti', schede.attiva === 'ritagli', schede);
  const suTavole = await page.evaluate(async ()=>{
    document.querySelector('#sceltarif-tab [data-tab="tavole"]').click();
    await new Promise(r=> setTimeout(r, 250));
    return {
      tessere: document.querySelectorAll('#sceltarif-griglia [data-rif]').length,
      attiva: (document.querySelector('#sceltarif-tab .active')||{}).dataset?.tab,
    };
  });
  ok('passando a Tavole si vede solo quella', suTavole.tessere === 1, suTavole);
  ok('e la scheda si accende', suTavole.attiva === 'tavole', suTavole);
  await page.evaluate(async ()=>{
    document.querySelector('#sceltarif-tab [data-tab="ritagli"]').click();
    await new Promise(r=> setTimeout(r, 250));
  });

  sezione('la ricerca invece taglia trasversale');
  // Quando si cerca le cartelle spariscono: si vede tutto quello che
  // corrisponde, ovunque stia.

  await page.evaluate(()=>{
    const c = document.getElementById('sceltarif-cerca');
    c.value = 'mani';
    c.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.waitForTimeout(250);
  const cercate = await page.evaluate(()=>({
    trovate: document.querySelectorAll('#sceltarif-griglia [data-rif]').length,
    cartelle: document.querySelectorAll('#sceltarif-griglia [data-cartella]').length,
  }));
  ok('trova anche fuori dalla cartella in cui si era', cercate.trovate === 3, cercate);
  ok('e mentre si cerca le cartelle si tolgono di mezzo', cercate.cartelle === 0, cercate);
  await page.evaluate(()=>{
    const c = document.getElementById('sceltarif-cerca');
    c.value = '';
    c.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.waitForTimeout(250);

  sezione('e se ne collega piu\' di uno: una pila, non uno solo');
  // Un'inquadratura si costruisce guardando piu' cose insieme — la posa da una
  // parte, la luce da un'altra, l'ambiente da una terza — e tenerne una sola
  // voleva dire scegliere quale buttare. Quindi la scelta NON si chiude al
  // primo tocco: se ne prendono quanti servono e si esce quando si e' finito.
  const primoTocco = await page.evaluate(async ()=>{
    document.querySelectorAll('#sceltarif-griglia [data-rif]')[0].click();
    await new Promise(r=> setTimeout(r, 400));
    const s = window.scene.scenaAperta();
    const ultimo = s.beat[s.beat.length-1];
    return {
      restaAperta: document.getElementById('sceltarif').classList.contains('open'),
      beat: s.beat.length,
      pila: window.scene.rifiDi(ultimo).length,
      rif: (window.scene.rifiDi(ultimo)[0]||{}).refId,
      senzaTesto: !(ultimo.testo||'').trim(),
      // La tessera scelta si vede che e' scelta.
      spuntata: document.querySelectorAll('#sceltarif-griglia .presa').length,
      fantasmaInCoda: (()=>{
        const bb = document.querySelectorAll('#scena-beat .beat');
        return bb[bb.length-1].classList.contains('beat-nuovo');
      })(),
    };
  });
  ok('scegliendo, la scelta resta aperta', primoTocco.restaAperta, primoTocco);
  ok('la card fantasma diventa un beat', primoTocco.pila === 1, primoTocco);
  ok('e si ricorda da quale riferimento arriva', /^rif/.test(primoTocco.rif||''), primoTocco);
  ok('un beat di solo riferimento, senza una parola, e\' valido', primoTocco.senzaTesto, primoTocco);
  ok('la tessera scelta porta la sua spunta', primoTocco.spuntata === 1, primoTocco);
  ok('e sotto e\' nata la card fantasma nuova', primoTocco.fantasmaInCoda, primoTocco);

  const dueTre = await page.evaluate(async ()=>{
    const t = document.querySelectorAll('#sceltarif-griglia [data-rif]');
    t[1].click(); await new Promise(r=> setTimeout(r, 250));
    t[2].click(); await new Promise(r=> setTimeout(r, 250));
    const s = window.scene.scenaAperta();
    const b = s.beat[s.beat.length-1];
    const q = document.querySelectorAll('#scena-beat .beat[data-id]');
    const mini = q[q.length-1].querySelector('.beat-mini');
    return {
      pila: window.scene.rifiDi(b).map(x=> x.refId),
      spuntate: document.querySelectorAll('#sceltarif-griglia .presa').length,
      // A schermo: i fogli sovrapposti e il numero che dice quante sono.
      fogli: mini.querySelectorAll('.pila-foglio').length,
      conta: (mini.querySelector('.pila-conta')||{}).textContent,
      // Sfalsati, non uno sopra l'altro esatto: si deve vedere che sono piu' di
      // uno anche senza leggere il numero.
      sfalsati: (()=>{
        const f = mini.querySelectorAll('.pila-foglio');
        if(f.length < 2) return false;
        const a = f[0].getBoundingClientRect(), c = f[1].getBoundingClientRect();
        return Math.abs(a.left - c.left) > 2 || Math.abs(a.top - c.top) > 2;
      })(),
    };
  });
  ok('la pila arriva a tre', dueTre.pila.length === 3, dueTre);
  ok('e tutte e tre sono spuntate', dueTre.spuntate === 3, dueTre);
  ok('a schermo i fogli sono sovrapposti', dueTre.fogli === 3, dueTre);
  ok('sfalsati, cosi\' si vede che sono piu\' di uno', dueTre.sfalsati, dueTre);
  ok('col numero di quante sono in tutto', dueTre.conta === '3', dueTre);

  sezione('e la pila resta TUTTA dentro il riquadro');
  // Il guaio da cui nasce questa prova: i fogli erano posizionati in assoluto
  // dentro un pulsante che non era un contesto di posizionamento, quindi si
  // ancoravano alla CARD — si spalmavano per tutta la sua larghezza, ruotati,
  // coprendo il testo. A schermo la scheda sembrava rotta.
  const dentro = await page.evaluate(()=>{
    const q = document.querySelectorAll('#scena-beat .beat[data-id]');
    const card = q[q.length-1];
    const mini = card.querySelector('.beat-mini');
    const rm = mini.getBoundingClientRect();
    const rc = card.getBoundingClientRect();
    const testo = card.querySelector('textarea').getBoundingClientRect();
    const fogli = Array.from(mini.querySelectorAll('.pila-foglio')).map(f=> f.getBoundingClientRect());
    const conta = mini.querySelector('.pila-conta').getBoundingClientRect();
    const fuori = f => f.left < rm.left - 1 || f.right > rm.right + 1 ||
                       f.top < rm.top - 1 || f.bottom > rm.bottom + 1;
    return {
      fogliFuori: fogli.filter(fuori).length,
      contaFuori: fuori(conta),
      // E il riquadro resta al posto suo dentro la card, largo meno di meta'.
      quota: +(rm.width / rc.width).toFixed(3),
      // Il testo non viene coperto da niente: comincia dove finisce la vignetta.
      testoLibero: testo.left >= rm.right - 1,
    };
  });
  ok('nessun foglio esce dal riquadro', dentro.fogliFuori === 0, dentro);
  ok('nemmeno il numerino', !dentro.contaFuori, dentro);
  ok('il riquadro resta largo meno di meta\' card',
     dentro.quota >= 0.40 && dentro.quota <= 0.45, dentro);
  ok('e il testo accanto non viene coperto', dentro.testoLibero, dentro);

  sezione('e ritoccandone una la si toglie');
  // Stesso gesto nei due sensi: non c'e' un secondo posto dove andare a
  // sganciare quello che si e' attaccato.
  const ritocco = await page.evaluate(async ()=>{
    document.querySelectorAll('#sceltarif-griglia [data-rif]')[1].click();
    await new Promise(r=> setTimeout(r, 350));
    const s = window.scene.scenaAperta();
    const b = s.beat[s.beat.length-1];
    return {
      pila: window.scene.rifiDi(b).map(x=> x.refId),
      spuntate: document.querySelectorAll('#sceltarif-griglia .presa').length,
    };
  });
  ok('quella ritoccata esce dalla pila', ritocco.pila.length === 2, ritocco);
  ok('e perde la spunta', ritocco.spuntate === 2, ritocco);

  sezione('riaprendo una vignetta piena si vedono SOLO le sue immagini');
  // Toccare una vignetta gia' piena e' quasi sempre "fammi rivedere cosa avevo
  // messo qui": si sta disegnando e si vogliono guardare le proprie referenze,
  // non ricominciare a sceglierne. Prima si riapriva il catalogo intero, e per
  // rivedere le proprie tre bisognava ricercarle una per una.
  await page.evaluate(()=>{
    const s = window.scene.scenaAperta();
    const b = s.beat[s.beat.length-1];
    b.rifs = [{url:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',refId:'rif0'},
              {url:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',refId:'rif1'}];
    window.scene.renderBeat();
    const bb = document.querySelectorAll('#scena-beat .beat[data-id]');
    bb[bb.length-1].querySelector('[data-schizzo]').click();
  });
  await page.waitForTimeout(500);
  const laPila = await page.evaluate(()=>{
    const g = document.getElementById('sceltarif-griglia');
    const mini = g.querySelectorAll('.pila-mini');
    const foglio = document.getElementById('sceltarif').getBoundingClientRect();
    return {
      vista: window.scene.vistaScelta(),
      quante: mini.length,
      // Niente catalogo: nessuna cartella, nessuna tessera dell'archivio.
      cartelle: g.querySelectorAll('[data-cartella]').length,
      tessere: g.querySelectorAll('[data-rif]').length,
      // MINIATURE, non immagini a tutta pagina: a tutta larghezza se ne vedeva
      // una per schermata. Sono quelle dell'archivio, quadrate e fitte.
      quota: mini.length ? +(mini[0].getBoundingClientRect().width / foglio.width).toFixed(2) : 0,
      sullaStessaRiga: mini.length > 1 &&
        Math.abs(mini[0].getBoundingClientRect().top - mini[1].getBoundingClientRect().top) < 3,
      // La ricerca sparisce: qui non c'e' niente da cercare, ci sono le tue.
      cerca: !document.getElementById('sceltarif-cerca').hidden,
      dove: (document.getElementById('sceltarif-dove')||{}).textContent,
      aggiungi: !!g.querySelector('[data-archivio]'),
      // Nessuna ✕ appiccicata all'angolo di ognuna: si sceglie tenendo premuto,
      // come dappertutto nell'app.
      crocette: g.querySelectorAll('[data-via]').length,
    };
  });
  ok('si atterra sulla pila del beat', laPila.vista === 'pila', laPila);
  ok('e ci sono solo le sue immagini', laPila.quante === 2, laPila);
  ok('senza una riga di catalogo', laPila.cartelle === 0 && laPila.tessere === 0, laPila);
  ok('sono miniature, non immagini a tutta pagina', laPila.quota < 0.35, laPila);
  ok('e stanno affiancate, non una per schermata', laPila.sullaStessaRiga, laPila);
  ok('la ricerca si toglie di mezzo', !laPila.cerca, laPila);
  ok('e la barra dice cosa sono', /riferimenti/i.test(laPila.dove||''), laPila);
  ok('con il modo di aggiungerne altre', laPila.aggiungi, laPila);
  ok('senza una ✕ appiccicata su ognuna', laPila.crocette === 0, laPila);

  sezione('e le TAVOLE si guardano intere, non tagliate');
  // Un frammento e' un dettaglio e il quadrato lo incornicia: e' la scelta che
  // l'archivio fa da sempre, e qui si ripete. Una tavola no — la vignetta
  // d'apertura, il ballon in alto e la striscia in fondo sono proprio quello
  // che si cerca — quindi la tessera prende le proporzioni della SUA pagina e
  // l'immagine ci sta dentro tutta.
  await page.evaluate(()=> document.querySelector('[data-archivio]') ? null : null);
  const tavole = await page.evaluate(async ()=>{
    // Si torna nell'archivio, dentro OTOMO, sulla scheda delle tavole.
    const g = document.getElementById('sceltarif-griglia');
    if(g.querySelector('[data-archivio]')) g.querySelector('[data-archivio]').click();
    await new Promise(r=> setTimeout(r, 350));
    const c = Array.from(document.querySelectorAll('[data-cartella]'))
      .find(x=> /OTOMO/.test(x.textContent));
    if(c) c.click();
    await new Promise(r=> setTimeout(r, 350));
    document.querySelector('#sceltarif-tab [data-tab="tavole"]').click();
    await new Promise(r=> setTimeout(r, 400));
    const t = document.querySelector('#sceltarif-griglia [data-rif]');
    const im = t.querySelector('img');
    const rt = t.getBoundingClientRect(), ri = im.getBoundingClientRect();
    return {
      taglio: getComputedStyle(im).objectFit,
      naturale: +(im.naturalWidth / im.naturalHeight).toFixed(2),
      tessera: +(rt.width / rt.height).toFixed(2),
      dentro: ri.width <= rt.width + 1 && ri.height <= rt.height + 1,
    };
  });
  ok('la tavola non e\' tagliata', tavole.taglio === 'contain', tavole);
  ok('e la tessera prende la forma della sua pagina',
     Math.abs(tavole.tessera - tavole.naturale) < 0.06, tavole);
  ok('cosi\' ci sta tutta dentro', tavole.dentro, tavole);
  // Si torna dov'erano le prove che seguono.
  await page.evaluate(async ()=>{
    document.querySelector('#sceltarif-tab [data-tab="ritagli"]').click();
    await new Promise(r=> setTimeout(r, 250));
  });
  await page.goBack();
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(300);

  sezione('e nessuna miniatura esce dalla sua tessera');
  // La prova nasce da una schermata piena di immagini sovrapposte e traboccanti.
  // La causa era il muretto: una griglia CSS piazza gli elementi per righe e il
  // cursore non torna mai indietro, quindi le tessere alte scavalcavano tutto.
  // Qui si misura la geometria vera — nessuna coppia che si sovrappone, nessuna
  // immagine piu' grande della tessera che la contiene — con immagini di forme
  // molto diverse, che e' il caso in cui il difetto si vedeva.
  const geometria = await page.evaluate(async ()=>{
    const foto = (w,h)=>{
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#c05a3a'; x.fillRect(0,0,w,h);
      return c.toDataURL('image/png');
    };
    const s = window.scene.scenaAperta();
    const b = s.beat[s.beat.length-1];
    // Una pagina verticale, una striscia orizzontale, un quadrato, una doppia.
    b.rifs = [[70,100],[200,60],[80,80],[140,100],[60,190]]
      .map(([w,h],i)=> ({ url: foto(w,h), refId: 'rif'+i }));
    window.scene.renderBeat();
    const bb = document.querySelectorAll('#scena-beat .beat[data-id]');
    bb[bb.length-1].querySelector('[data-schizzo]').click();
    await new Promise(r=> setTimeout(r, 800));
    const t = Array.from(document.querySelectorAll('.pila-mini'));
    const r = t.map(x=> x.getBoundingClientRect());
    let sovrapposte = 0;
    for(let i=0;i<r.length;i++) for(let j=i+1;j<r.length;j++){
      const a = r[i], c = r[j];
      if(a.left < c.right - 1 && c.left < a.right - 1 &&
         a.top < c.bottom - 1 && c.top < a.bottom - 1) sovrapposte++;
    }
    return {
      quante: t.length,
      sovrapposte,
      // Ogni immagine sta dentro la sua tessera, ritagliata dal riquadro.
      traboccanti: t.filter(x=>{
        const rt = x.getBoundingClientRect(), ri = x.querySelector('img').getBoundingClientRect();
        return ri.width > rt.width + 1 || ri.height > rt.height + 1;
      }).length,
      // Tutte della stessa forma, quadrata: e' quello che tiene le righe
      // allineate e non lascia buchi.
      forme: [...new Set(r.map(x=> +(x.width / x.height).toFixed(2)))],
      // E allineate in righe vere: le tessere di una riga cominciano tutte alla
      // stessa altezza.
      righe: [...new Set(r.map(x=> Math.round(x.top)))].length,
    };
  });
  ok('ci sono tutte e cinque', geometria.quante === 5, geometria);
  ok('nessuna coppia si sovrappone', geometria.sovrapposte === 0, geometria);
  ok('nessuna immagine esce dalla sua tessera', geometria.traboccanti === 0, geometria);
  ok('e sono tutte quadrate, per quanto diverse siano le immagini',
     geometria.forme.length === 1 && Math.abs(geometria.forme[0] - 1) < 0.06, geometria);
  ok('incolonnate in righe vere', geometria.righe <= 2, geometria);
  // Rimesse com'erano, cosi' le prove che seguono ripartono da dove stavano.
  await page.evaluate(()=>{
    const s = window.scene.scenaAperta();
    const b = s.beat[s.beat.length-1];
    b.rifs = [{url:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',refId:'rif0'},
              {url:'data:image/gif;base64,R0lGODlhAQABAAAAACw=',refId:'rif1'}];
    window.scene.renderBeat();
  });
  await page.waitForTimeout(200);

  sezione('e toccandone una si apre la galleria dei frammenti');
  // La stessa dell'archivio — provenienza, tag, frecce — solo che le frecce
  // scorrono fra i riferimenti DI QUESTO BEAT: sfogliare la cartella da cui
  // erano stati presi, partendo da una miniatura aperta per guardarla, non e'
  // quello che si stava chiedendo.
  const galleria = await page.evaluate(async ()=>{
    document.querySelector('.pila-mini').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    await new Promise(r=> setTimeout(r, 500));
    const lb = document.getElementById('refs-lightbox');
    return {
      aperta: lb.classList.contains('open'),
      quale: lb.dataset.id,
      // Il contatore dice quante ne scorre: due, non tutta la cartella.
      contatore: (document.getElementById('refs-lightbox-counter')||{}).textContent,
    };
  });
  ok('si apre la galleria', galleria.aperta, galleria);
  ok('sulla miniatura toccata', galleria.quale === 'rif0', galleria);
  ok('e scorre fra i riferimenti del beat, non fra quelli della cartella',
     /\b2\b/.test(galleria.contatore || '') && !/\b[4-9]\b/.test(galleria.contatore || ''), galleria);
  // Indietro chiude la galleria e lascia aperta la scelta sotto: e' lo strato
  // piu' alto, e la catena in main.js e' ordinata per strati proprio per questo.
  await page.goBack();
  await page.waitForTimeout(350);
  const dopoGalleria = await page.evaluate(()=>({
    galleria: document.getElementById('refs-lightbox').classList.contains('open'),
    scelta: document.getElementById('sceltarif').classList.contains('open'),
    vista: window.scene.vistaScelta(),
  }));
  ok('Indietro chiude la galleria', !dopoGalleria.galleria, dopoGalleria);
  ok('e lascia la scelta dov\'era, sotto', dopoGalleria.scelta && dopoGalleria.vista === 'pila', dopoGalleria);

  sezione('da li\' si sceglie e si butta, come dappertutto');
  // Prima ogni miniatura aveva la sua ✕ nell'angolo: un bersaglio da
  // ventiquattro pixel, e per toglierne tre servivano tre tocchi centrati bene.
  // Adesso e' lo stesso gesto degli artisti e dei frammenti — si tiene premuto,
  // si spunta, si butta in blocco (vedi scelta.js).
  const scelte = await page.evaluate(async ()=>{
    const el = document.querySelector('.pila-mini');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const t = ()=> [new Touch({identifier:1, target:el, clientX:x, clientY:y})];
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:t(),targetTouches:t()}));
    await new Promise(r=>setTimeout(r,600));
    const durante = document.querySelectorAll('.pila-mini.scelta').length;
    el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],targetTouches:[]}));
    el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y}));
    await new Promise(r=>setTimeout(r,650));
    return {
      durante,
      dopo: document.querySelectorAll('.pila-mini.scelta').length,
      // Il tocco prolungato non apre la galleria sotto.
      galleria: document.getElementById('refs-lightbox').classList.contains('open'),
      // La barra in alto dice quante e diventa il cestino.
      dove: (document.getElementById('sceltarif-dove')||{}).textContent,
      pulsante: document.getElementById('sceltarif-togli').textContent.trim(),
      acceso: !document.getElementById('sceltarif-togli').hidden,
    };
  });
  ok('tenendo premuta una miniatura si comincia a scegliere', scelte.durante === 1, scelte);
  ok('e resta scelta quando il dito si stacca', scelte.dopo === 1, scelte);
  ok('senza aprire la galleria sotto', !scelte.galleria, scelte);
  ok('la barra dice quante ne hai prese', /1 scelta/.test(scelte.dove||''), scelte);
  ok('e il pulsante diventa il cestino', scelte.acceso && /^togli$/i.test(scelte.pulsante), scelte);

  const menoUna = await page.evaluate(async ()=>{
    document.getElementById('sceltarif-togli').click();
    await new Promise(r=> setTimeout(r, 400));
    const s = window.scene.scenaAperta();
    return {
      pila: window.scene.rifiDi(s.beat[s.beat.length-1]).map(x=> x.refId),
      miniature: document.querySelectorAll('.pila-mini').length,
      spuntate: document.querySelectorAll('.pila-mini.scelta').length,
      pulsante: document.getElementById('sceltarif-togli').hidden,
      dove: (document.getElementById('sceltarif-dove')||{}).textContent,
    };
  });
  ok('la scelta esce dalla pila', menoUna.pila.join(',') === 'rif1', menoUna);
  ok('e sparisce anche da qui', menoUna.miniature === 1, menoUna);
  ok('la selezione si azzera con lei', menoUna.spuntate === 0, menoUna);
  ok('il cestino si spegne', menoUna.pulsante, menoUna);
  ok('e la barra torna a dire cosa sono', /riferimenti/i.test(menoUna.dove||''), menoUna);

  sezione('e "Aggiungi" scende nell\'archivio');
  await page.evaluate(()=> document.querySelector('[data-archivio]').click());
  await page.waitForTimeout(350);
  const sceso = await page.evaluate(()=>({
    vista: window.scene.vistaScelta(),
    cartelle: document.querySelectorAll('#sceltarif-griglia [data-cartella]').length,
    cerca: !document.getElementById('sceltarif-cerca').hidden,
  }));
  ok('si arriva alle cartelle', sceso.vista === 'cartelle' && sceso.cartelle === 2, sceso);
  ok('e la ricerca torna', sceso.cerca, sceso);

  sezione('e la freccia risale un passo per volta');
  // Dentro una cartella Indietro torna all'elenco, e solo dal secondo passo
  // chiude: e' un livello di navigazione, e come tale costa un passo indietro.
  // Tre livelli, tre passi: una cartella, l'archivio, la pila del beat. E solo
  // dopo il foglio si chiude.
  await page.evaluate(()=>{
    const c = Array.from(document.querySelectorAll('[data-cartella]'))
      .find(x=> /OTOMO/.test(x.textContent));
    c.click();
  });
  await page.waitForTimeout(300);
  ok('si e\' dentro una cartella',
     await page.evaluate(()=> window.scene.vistaScelta()) === 'dentro', null);
  await page.goBack();
  await page.waitForTimeout(300);
  const passo1 = await page.evaluate(()=> window.scene.vistaScelta());
  ok('il primo passo torna alle cartelle', passo1 === 'cartelle', passo1);
  await page.goBack();
  await page.waitForTimeout(300);
  const passo2 = await page.evaluate(()=>({
    vista: window.scene.vistaScelta(),
    aperta: document.getElementById('sceltarif').classList.contains('open'),
  }));
  ok('il secondo torna ai riferimenti del beat',
     passo2.vista === 'pila' && passo2.aperta, passo2);
  await page.goBack();
  await page.waitForTimeout(300);
  ok('e il terzo chiude la scelta',
     await page.evaluate(()=> !document.getElementById('sceltarif').classList.contains('open')), null);
  // Il beat rimasto senza pila e senza testo se ne va alla prima uscita dal
  // riquadro, come tutti i vuoti: la regola vale anche qui.
  await page.evaluate(()=>{
    const t = document.querySelector('#scena-beat .beat-nuovo textarea');
    t.focus(); t.blur();
  });
  await page.waitForTimeout(200);

  sezione('e un beat di solo disegno non viene buttato via');
  // La potatura dei vuoti guarda il testo: senza questa regola, un beat
  // disegnato sparirebbe appena si esce dal riquadro accanto.
  await page.evaluate(()=>{
    const conta = ()=> window.scene.scenaAperta().beat.filter(b=> window.scene.rifiDi(b).length).length;
    window.__conImmagini = { prima: conta() };
    document.querySelector('#scena-beat .beat-nuovo textarea').focus();
    document.activeElement.blur();
    setTimeout(()=>{ window.__conImmagini.dopo = conta(); }, 50);
  });
  await page.waitForTimeout(150);
  const sopravvive = await page.evaluate(()=> window.__conImmagini);
  // Prima e dopo: quello che conta e' che uscendo dal riquadro accanto non ne
  // sparisca nessuno, non quanti fossero.
  ok('restano tutti dove sono', sopravvive.dopo === sopravvive.prima && sopravvive.dopo > 0, sopravvive);

  sezione('"sembrano piu\' vignette": un beat = una inquadratura');
  // "Prende il telefono, gira su se stesso e inizia a correre" non e' una
  // vignetta: sono tre. E' l'errore piu' facile da fare qui dentro — si scrive
  // come si racconta — e chi disegna se ne accorge solo dopo, davanti alla
  // tavola, quando quella riga non entra in un riquadro.
  const conta = ()=> page.evaluate(()=> document.querySelectorAll('#scena-beat .beat').length);
  const avviso = ()=> page.evaluate(()=>{
    const a = document.querySelector('#scena-beat .beat-avviso');
    if(!a) return null;
    const st = getComputedStyle(a);
    const card = a.closest('.beat');
    return {
      testo: a.querySelector('span').textContent,
      dentroLaCard: !!card,
      // Non e' un errore: niente rosso, niente bordo acceso.
      bordoCard: getComputedStyle(card).borderTopColor,
      separa: !!a.querySelector('[data-separa]'),
      zitto: !!a.querySelector('[data-zitto]'),
    };
  });
  const nBeatPrima = await conta();
  await scriviNel(2, 'prende il telefono, gira su se stesso e inizia a correre');
  await page.waitForTimeout(150);
  let a = await avviso();
  ok('l\'avviso compare', !!a, a);
  ok('e dice quello che c\'e\' da dire', /piu\' vignette/.test(a.testo||''), a);
  ok('sta dentro la card, sotto il testo', a.dentroLaCard, a);
  ok('con l\'azione per separarle', a.separa, a);
  ok('e il modo di farlo tacere', a.zitto, a);
  // NIENTE ALLARMI: nessuna finestra, nessun bordo rosso, e il salvataggio non
  // si ferma — la riga e' gia' in archivio mentre l'avviso e' a schermo.
  const niente = await page.evaluate(()=>({
    finestre: document.querySelectorAll('.modal-overlay.open').length,
    salvato: (window.scene.scenaAperta().beat.find(b=> /gira su se stesso/.test(b.testo||'')) ? true : false),
  }));
  ok('nessuna finestra si apre', niente.finestre === 0, niente);
  ok('e il testo e\' gia\' salvato lo stesso', niente.salvato, niente);

  sezione('e una riga sola non lo sveglia');
  await scriviNel(2, 'primo piano del telefono sul tavolo');
  await page.waitForTimeout(150);
  ok('su una inquadratura sola l\'avviso sparisce', (await avviso()) === null, null);
  // Nemmeno "mentre": due cose che succedono INSIEME stanno in una vignetta.
  await scriviNel(2, 'corre mentre guarda indietro');
  await page.waitForTimeout(150);
  ok('e "mentre" non e\' una sequenza: e\' una vignetta sola',
     (await avviso()) === null, null);

  sezione('toccando "Separa" la riga diventa tre beat');
  await scriviNel(2, 'prende il telefono, gira su se stesso e inizia a correre');
  await page.waitForTimeout(150);
  await page.evaluate(()=> document.querySelector('#scena-beat [data-separa]').click());
  await page.waitForTimeout(200);
  const separati = await page.evaluate(()=> window.scene.scenaAperta().beat.map(b=> b.testo));
  ok('i pezzi diventano beat distinti', separati.length === nBeatPrima + 1, separati);
  ok('e ognuno porta la sua azione',
     /prende il telefono/.test(separati[2]||'') &&
     /gira su se stesso/.test(separati[3]||'') &&
     /inizia a correre/.test(separati[4]||''), separati);
  ok('l\'avviso se ne va con la riga che l\'aveva chiamato',
     (await avviso()) === null, null);

  sezione('e la ✕ lo fa tacere per sempre su quel beat');
  await scriviNel(2, 'apre la porta, entra e chiude');
  await page.waitForTimeout(150);
  ok('l\'avviso torna su una riga nuova', !!(await avviso()), null);
  await page.evaluate(()=> document.querySelector('#scena-beat [data-zitto]').click());
  await page.waitForTimeout(150);
  ok('un tocco e sparisce', (await avviso()) === null, null);
  // E non torna: ne' riscrivendo, ne' riaprendo la scena. Un consiglio gia'
  // scartato che ricompare e' peggio del consiglio stesso.
  await page.evaluate(()=>{
    const ta = document.querySelectorAll('#scena-beat .beat textarea')[2];
    ta.value = 'apre la porta, entra e chiude piano';
    ta.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await page.waitForTimeout(150);
  ok('e non torna riscrivendo la stessa riga', (await avviso()) === null, null);
  await page.evaluate(()=> window.scene.renderBeat());
  await page.waitForTimeout(150);
  ok('nemmeno ridisegnando la scena', (await avviso()) === null, null);

  sezione('le scene abbandonate se ne vanno da sole');
  // Zero o un beat, e ferme da piu' di un giorno: via in silenzio, senza
  // conferme e senza cestino. Una lista di cose non fatte scoraggia l'apertura
  // dell'app piu' di quanto un archivio completo aiuti.
  await page.evaluate(()=> document.getElementById('scena-chiudi').click());
  await page.waitForTimeout(300);
  const pulizia = await page.evaluate(async ()=>{
    const IERI = Date.now() - 25*60*60*1000;
    const tutte = window.scene.tutteLeScene();
    // Una piena e vecchia, una vuota e vecchia, una vuota ma di adesso.
    const piena = tutte.find(s=> s.beat.length >= 2);
    piena.updatedAt = IERI;
    const vuote = tutte.filter(s=> s.beat.length <= 1);
    vuote.forEach((s,i)=>{ s.updatedAt = i === 0 ? IERI : Date.now(); });
    const prima = tutte.length;
    window.__cancellati = [];
    const via = await window.scene.spazzaScarti();
    return {
      prima, via,
      dopo: window.scene.tutteLeScene().length,
      cancellati: window.__cancellati.map(c=> c.col),
      pienaViva: window.scene.tutteLeScene().some(s=> s.id === piena.id),
      vecchiaVuotaVia: !window.scene.tutteLeScene().some(s=> s.id === vuote[0].id),
      nuovaVuotaViva: vuote.length < 2 || window.scene.tutteLeScene().some(s=> s.id === vuote[1].id),
    };
  });
  ok('la scena vuota e vecchia sparisce', pulizia.vecchiaVuotaVia, pulizia);
  ok('quella piena resta, per vecchia che sia', pulizia.pienaViva, pulizia);
  ok('e una vuota di oggi non si tocca', pulizia.nuovaVuotaViva, pulizia);
  ok('sparisce anche dall\'archivio, non solo da schermo',
     pulizia.cancellati.length === pulizia.via && pulizia.cancellati.every(c=> c === 'scene'), pulizia);
  ok('e non chiede niente a nessuno',
     await page.evaluate(()=> !document.querySelector('.modal-overlay.open')), null);
});
