// ── IL RITAGLIO — dalla tavola di un albo a un ritaglio nell'archivio ──
//
// Staccato da albums.js quando quel file ha passato le duemilaseicento righe.
// E' il gesto piu' lungo dell'app — si tira un riquadro sulla tavola, lo si
// aggiusta con le maniglie, si sceglie dove salvarlo e con quali tag — e non
// c'entra niente con il resto del lettore: quello apre uno ZIP e sfoglia
// pagine, questo ritaglia un'immagine e la manda nell'archivio.
//
// Verso il lettore restano pochi fili, tutti in sola lettura tranne uno: quale
// pagina si sta guardando, come si chiama l'albo, a che ingrandimento sta la
// tavola, l'elemento dell'immagine a schermo. L'unico che si scrive e' "sono
// in modalita' ritaglio", ed e' il lettore a tenerlo (lo guarda anche per
// decidere cosa fanno lo swipe e il tasto Esc).
import { haptic } from './state.js';
import { escAttr } from './testo.js';
import { actionMenu, promptModal } from './dialogs.js';
import {
  addRefBlob, getActiveFolderId, clipDestinations, clipCategories,
  getFolderName, rememberClipDest, tagSuggeriti,
} from './refs.js';
import {
  readerEl, readerImg, indiceCorrente, nomeAlbo, zoomCorrente, resetZoom,
  toast, clipMode, setClipMode,
} from './albums.js';

// ── RITAGLIO ────────────────────────────────────────────────────────────────
// Rettangolo di selezione sopra la pagina → crop a piena risoluzione dal blob
// originale → compressione → Frammento nella cartella corrente, con provenienza.
export function toggleClip(force){
  const next = (typeof force === 'boolean') ? force : !clipMode();
  setClipMode(next);
  // Lo zoom NON si azzera più entrando in ritaglio: il conto del crop usa le
  // posizioni reali a schermo di tavola e riquadro (getBoundingClientRect,
  // vedi renderedImageRect), che includono già scala e spostamento — quindi
  // funziona correttamente anche da zoomati, permettendo di ritagliare un
  // dettaglio piccolo con più precisione.
  const layer = readerEl().querySelector('.ar-cliplayer');
  const hint = readerEl().querySelector('.ar-clip-hint');
  const box = readerEl().querySelector('.ar-clipbox');
  readerEl().querySelector('.ar-clip').classList.toggle('active', clipMode());
  layer.hidden = !clipMode();
  hint.hidden = !clipMode();
  box.hidden = true;
  // "Riprova" sta nella barra in alto, fuori da .ar-clip-hint: uscendo dal
  // ritaglio non se ne va da solo insieme al resto, va spento qui.
  const retry = readerEl().querySelector('.ar-retry');
  if(retry) retry.hidden = true;
  // "Tutta la tavola" NON si nasconde qui, ed è la terza versione di questo
  // pulsante: prima stava nella capsula in basso (mandava a capo la riga e
  // traboccava sulla tavola), poi è salito accanto alle forbici ma compariva
  // solo dentro il ritaglio — cioè per salvare una tavola intera servivano
  // comunque due tocchi, e il primo era "entra in una modalità" che con
  // l'intenzione non c'entrava niente. Ora sta sempre lì: un tocco, e si
  // sceglie dove finisce.
  // Entrando o uscendo si riparte SEMPRE da foglio bianco: un riquadro
  // lasciato in sospeso non deve sopravvivere al giro successivo.
  if(readerEl()._clipReset) readerEl()._clipReset();
  // In ritaglio la navigazione non serve: via cursore e salti, resta l'avviso.
  // Spariva TUTTA la capsula, ma da quando forbici, "tutta la tavola" e
  // "Riprova" stanno li' dentro (vedi buildReaderDOM) portarsela via avrebbe
  // voluto dire togliere di mezzo proprio i comandi del ritaglio nel momento
  // in cui servono: adesso si nasconde solo la riga del cursore.
  const seek = readerEl().querySelector('.ar-seek-row');
  if(seek) seek.hidden = clipMode();
  readerEl().querySelector('.ar-prev').style.display = clipMode() ? 'none' : '';
  readerEl().querySelector('.ar-next').style.display = clipMode() ? 'none' : '';
  // Niente haptic('tap') qui: il pulsante ritaglia è un <button>, già coperto
  // dal tick diffuso su pointerdown (sound.js). Chiamarlo anche qui produceva
  // due suoni per un solo tocco — il gesto reale (pointerdown poi click) dura
  // spesso oltre i 70ms di soglia pensati per fondere i due, quindi entrambi
  // finivano per suonare.
}

// Rettangolo dell'immagine effettivamente renderizzata, in coordinate relative
// a `layer` (il livello di ritaglio, che copre tutto lo stage). Serve la
// posizione VERA a schermo di entrambi — non solo le dimensioni — perché la
// tavola è centrata nello stage (flexbox) e quasi mai ne ha le stesse
// proporzioni: c'è quindi uno scarto tra l'angolo dello stage e quello reale
// dell'immagine, oltre alle eventuali bande vuote di object-fit:contain. Con
// getBoundingClientRect (posizione reale) invece di clientWidth (solo
// dimensione) entrambi gli scarti vengono presi in conto.
// Esportata: la usa anche la rifilatura di un frammento (vedi rifila.js), che
// deve fare lo stesso conto — dove sta davvero l'immagine dentro il suo
// contenitore, e con che ingrandimento — per tradurre un riquadro disegnato
// col dito in pixel dell'originale.
export function renderedImageRect(img, layer){
  const ir = img.getBoundingClientRect();
  const lr = layer.getBoundingClientRect();
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if(!nw || !nh) return { x: ir.left - lr.left, y: ir.top - lr.top, w: ir.width, h: ir.height, scale: 1 };
  const scale = Math.min(ir.width / nw, ir.height / nh);
  const w = nw * scale, h = nh * scale;
  return {
    x: (ir.left - lr.left) + (ir.width - w) / 2,
    y: (ir.top - lr.top) + (ir.height - h) / 2,
    w, h, scale,
  };
}

export function wireClip(ov){
  const layer = ov.querySelector('.ar-cliplayer');
  const box = ov.querySelector('.ar-clipbox');
  const hintInstruct = ov.querySelector('.ar-clip-hint-instruct');
  const hintConfirm = ov.querySelector('.ar-clip-hint-confirm');
  const dests = ov.querySelector('.ar-clip-dests');
  const moreWrap = ov.querySelector('.ar-clip-more-wrap');
  const browseRow = ov.querySelector('.ar-clip-row-browse');
  const retryBtn = ov.querySelector('.ar-retry');
  const handles = Array.from(box.querySelectorAll('.ar-clip-handle'));
  const MIN_SIZE = 24; // dimensione minima del riquadro in px CSS, ridimensionando
  let sx = 0, sy = 0, drawing = false;
  // Il rettangolo del livello si misura all'inizio del gesto e si riusa: prima
  // veniva rimisurato ad ogni movimento (una misura forzata del layout per
  // evento), e il riquadro seguiva il dito a scatti.
  let lr = null;
  // Riquadro disegnato in attesa di conferma: rilasciare il dito non salva più
  // subito. Prima lo faceva, e "annulla" non poteva mai tornare indietro da un
  // ritaglio già fatto — poteva solo uscire dalla modalità PRIMA di disegnare.
  let pendingSel = null;
  let resizeCorner = null; // angolo in trascinamento, o null
  // Se il riquadro in attesa è stato messo lì dal pulsante "tutta la tavola" e
  // non dal dito. È l'unica cosa che distingue una TAVOLA da un RITAGLIO al
  // momento del salvataggio, e da lì dipende in quale dei due scaffali della
  // cartella finisce (vedi isTavola in refs.js).
  //
  // Si guarda l'INTENZIONE, non la geometria. Misurare quanto il riquadro
  // copre della pagina sarebbe stato più furbo e più sbagliato: un ritaglio a
  // tutta larghezza su una splash page verrebbe promosso a tavola senza che
  // nessuno l'abbia chiesto, e il confine "quanto è abbastanza" non lo si
  // indovina — è una soglia che un giorno tradisce.
  let tavolaIntera = false;

  // Pastiglie di destinazione: la prima è la cartella da cui stai leggendo
  // (i Ritagli dell'artista), poi le cartelle di Studio. Toccarne una salva
  // il ritaglio lì dentro. Si ricostruiscono ad ogni riquadro perché nel
  // frattempo puoi aver creato una nuova cartella di studio.
  // Quante scorciatoie stanno nella riga "Recenti". Da quando le categorie
  // hanno una riga tutta loro (vedi .ar-clip-row nel CSS) questa riga è larga
  // quanto la barra, non più il ritaglio di spazio fra "Riprova" e le
  // categorie: ce ne sta una in più. Oltre questo numero le ultime usate
  // scorrono, e la sfumatura di taglio cade sul bordo della capsula invece che
  // addosso alle categorie.
  const DEST_CHIPS_MAX = 4;
  const renderDests = ()=>{
    if(!dests) return;
    const shortcuts = clipDestinations();
    const cats = clipCategories();
    // Le due righe hanno senso solo se c'è davvero qualcosa da distinguere:
    // senza cartelle è un pulsante e basta, e un'etichetta "Recenti" sopra un
    // solo bottone di conferma sarebbe una didascalia che mente.
    if(hintConfirm) hintConfirm.classList.toggle('no-folders', !shortcuts.length && !cats.length);
    if(browseRow) browseRow.classList.toggle('no-cats', !cats.length);
    if(!shortcuts.length && !cats.length){
      // Nessuna cartella: il ritaglio resta non archiviato, come oggi.
      dests.innerHTML = '<button class="ar-clip-confirm-btn" data-act="confirmclip">✓ Salva frammento</button>';
      if(moreWrap) moreWrap.innerHTML = '';
      return;
    }
    // Scorciatoie: dove sei (default) e le ultime cartelle usate. È il caso
    // normale — si lavora su pochi studi per volta — e si risolve con un tocco.
    dests.innerHTML = shortcuts.slice(0, DEST_CHIPS_MAX).map(d=>{
      const cls = d.isCurrent ? 'ar-clip-dest is-current' : 'ar-clip-dest';
      const label = d.isCurrent ? ('✓ ' + escAttr(d.name)) : escAttr(d.name);
      const title = d.isCurrent
        ? 'Salva tra i frammenti di ' + escAttr(d.name)
        : 'Salva in ' + escAttr(d.category || '') + ' › ' + escAttr(d.name);
      return `<button class="${cls}" data-act="confirmclip" data-dest="${escAttr(d.id)}" title="${title}">${label}</button>`;
    }).join('');
    // Categorie: ancorate al bordo destro, non scorrono via. Una voce per
    // categoria a prescindere da quante cartelle contenga, così la riga ha la
    // stessa forma con due artisti e con cinquanta — e da lì si raggiunge
    // qualunque sottocartella, anche una mai usata.
    if(moreWrap){
      // "References" sta sulla riga delle categorie perche' E' una categoria,
      // solo fatta di tag invece che di cartelle: sceglierla vuol dire "questo
      // non lo archivio sotto un autore, lo archivio per cosa mostra". Il
      // ritaglio non eredita la cartella da cui stai leggendo (vedi
      // exportCropAndSave) — ma la provenienza se la porta dietro lo stesso,
      // quindi da dove viene non si perde comunque.
      moreWrap.innerHTML =
        `<button class="ar-clip-dest ar-clip-cat ar-clip-tag" data-act="tagdest" title="Salva fra i riferimenti, con un tag">References ›</button>`
        + cats.map((c,i)=>
        `<button class="ar-clip-dest ar-clip-cat" data-act="catdest" data-cat="${i}" title="Sfoglia ${escAttr(c.category)}">${escAttr(c.category)} ›</button>`
      ).join('');
      moreWrap._cats = cats;
    }
    // Se le scorciatoie non ci stanno tutte, l'ultima viene tagliata di netto
    // dallo scroll. Una sfumatura sul bordo (solo quando c'è davvero altro da
    // scorrere) la fa leggere come "continua qui" invece che come un difetto.
    // Prima quel taglio cadeva a filo delle categorie, che stavano sulla stessa
    // riga: sfumatura e pastiglie tratteggiate si accavallavano, e non si
    // capiva più dove finivano le cartelle recenti e dove cominciavano le
    // categorie. Ora le due file stanno su righe distinte e la sfumatura muore
    // sul bordo della capsula, dove non tocca niente.
    dests.classList.toggle('has-more', dests.scrollWidth > dests.clientWidth + 1);
    if(moreWrap) moreWrap.classList.toggle('has-more', moreWrap.scrollWidth > moreWrap.clientWidth + 1);
  };

  // Sottocartelle di una categoria, per raggiungerne una qualunque.
  // Scegliendo "References" si sceglie un TAG, e il tag e' la destinazione:
  // il ritaglio si salva subito dopo, con un tocco solo come per le cartelle.
  ov._clipTagDests = (anchorEl)=>{
    const suggeriti = tagSuggeriti(8);
    const actions = suggeriti.map(t=>({
      label: t, icon: 'tag',
      onSelect: ()=>{ if(ov._clipConfirm) ov._clipConfirm({ tag: t }); },
    }));
    actions.push({
      label: 'Nuovo tag…', icon: 'piu',
      onSelect: async ()=>{
        const t = await promptModal('Nuovo tag', '', 'es. folla che cammina');
        if(!t) return;
        if(ov._clipConfirm) ov._clipConfirm({ tag: t });
      },
    });
    actionMenu(anchorEl, actions);
  };

  ov._clipCatDests = (anchorEl, idx)=>{
    const cats = (moreWrap && moreWrap._cats) || [];
    const c = cats[idx];
    if(!c || !c.folders.length) return;
    actionMenu(anchorEl, c.folders.map(f=>({
      label: f.name,
      onSelect: ()=>{ if(ov._clipConfirm) ov._clipConfirm(f.id); },
    })));
  };

  // Riporta il ritaglio a foglio bianco. Serve perché lo stato del riquadro
  // vive QUI dentro, in variabili di chiusura (pendingSel, drawing,
  // resizeCorner) che nessuno di fuori può azzerare: uscendo dal ritaglio
  // restavano com'erano, e con loro la barra delle destinazioni. Riaprendo,
  // al posto di "trascina un riquadro" ricompariva la conferma di un ritaglio
  // che non esisteva più.
  ov._clipReset = ()=>{
    pendingSel = null;
    drawing = false;
    tavolaIntera = false;
    resizeCorner = null;
    box.hidden = true;
    _anticipo = null;
    showConfirm(false);
  };

  // ── PREPARAZIONE ANTICIPATA ──
  // Fra il momento in cui il riquadro è disegnato e il momento in cui si tocca
  // la destinazione passa almeno un secondo: si legge la barra, si decide dove
  // mettere il ritaglio, si mira alla pastiglia. In quel secondo il telefono
  // non fa niente, e subito dopo lo si tiene fermo mezzo secondo buono a
  // disegnare il canvas e comprimerlo — un lavoro che dipende SOLO dal
  // riquadro, che a quel punto è già deciso. Quindi si comincia subito: alla
  // conferma il file è quasi sempre già lì e la preparazione sparisce
  // dall'attesa.
  //
  // La chiave è la geometria del riquadro più la pagina: se si aggiusta una
  // maniglia il lavoro fatto non vale più e si ricomincia. Il ritardo evita di
  // rifarlo ad ogni pixel mentre la maniglia è ancora in movimento.
  const ANTICIPO_MS = 260;
  let _anticipo = null;      // { chiave, promessa }
  let _anticipoT = null;
  const chiaveSel = sel => [indiceCorrente(), Math.round(sel.left), Math.round(sel.top),
                            Math.round(sel.width), Math.round(sel.height)].join('|');
  const anticipaRitaglio = ()=>{
    clearTimeout(_anticipoT);
    _anticipo = null;
    _anticipoT = setTimeout(()=>{
      if(!pendingSel) return;
      const img = readerImg();
      if(!img) return;
      const g = geometriaRitaglio(img, pendingSel, layer);
      if(!g) return;
      // La promessa non viene mai attesa qui: se il ritaglio finisce nel
      // cestino (Riprova, uscita dal ritaglio) resta un lavoro buttato, ed è
      // il prezzo — piccolo — di averlo pronto quando invece serve.
      _anticipo = {
        chiave: chiaveSel(pendingSel),
        promessa: preparaRitaglio(img, g.cx, g.cy, g.cw, g.ch).catch(()=> null),
      };
    }, ANTICIPO_MS);
  };

  const showConfirm = (on)=>{
    if(hintInstruct) hintInstruct.hidden = on;
    if(hintConfirm) hintConfirm.hidden = !on;
    // "Riprova" sta in alto insieme alle forbici, non in mezzo alle
    // destinazioni: ridisegnare il riquadro è un comando SUL RITAGLIO, mentre
    // la capsula in basso risponde a una domanda sola — dove finisce. Infilato
    // in coda alle categorie sembrava una pastiglia avanzata, e per giunta
    // rubava larghezza proprio alla fila che ne ha più bisogno.
    if(retryBtn) retryBtn.hidden = !on;
    if(on){ renderDests(); aggiornaManiglie(); anticipaRitaglio(); }
    // Le maniglie di resize hanno senso SOLO nello stato "in attesa di
    // conferma": durante il disegno iniziale coprirebbero il gesto sulla
    // superficie, e a riquadro chiuso non c'è nulla da ridimensionare.
    box.classList.toggle('pending', on);
  };

  const syncPendingSelFromBox = (forza)=>{
    if(!pendingSel && !forza) return;
    pendingSel = {
      left: parseFloat(box.style.left), top: parseFloat(box.style.top),
      width: parseFloat(box.style.width), height: parseFloat(box.style.height),
    };
    anticipaRitaglio();
  };

  const start = (px, py)=>{
    pendingSel = null;
    // Il dito ha ricominciato a disegnare: qualunque cosa ci fosse prima —
    // compresa la tavola intera messa dal pulsante — non conta più.
    tavolaIntera = false;
    showConfirm(false);
    lr = layer.getBoundingClientRect();
    sx = px - lr.left; sy = py - lr.top;
    drawing = true;
    box.hidden = false;
    box.style.left = sx + 'px'; box.style.top = sy + 'px';
    box.style.width = '0px'; box.style.height = '0px';
  };
  const move = (px, py)=>{
    if(!drawing) return;
    const r = lr || (lr = layer.getBoundingClientRect());
    const cx = Math.max(0, Math.min(px - r.left, r.width));
    const cy = Math.max(0, Math.min(py - r.top, r.height));
    box.style.left = Math.min(sx, cx) + 'px';
    box.style.top = Math.min(sy, cy) + 'px';
    box.style.width = Math.abs(cx - sx) + 'px';
    box.style.height = Math.abs(cy - sy) + 'px';
  };
  const end = ()=>{
    if(!drawing) return; drawing = false;
    const bw = parseFloat(box.style.width), bh = parseFloat(box.style.height);
    if(bw < 12 || bh < 12){ box.hidden = true; toast('Trascina un riquadro più grande sulla pagina.', true); return; }
    // Il riquadro RESTA a schermo: si decide con "Conferma" o "Riprova" — o
    // si aggiusta trascinando gli angoli prima di confermare.
    pendingSel = { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: bw, height: bh };
    showConfirm(true);
  };

  // ── RIDIMENSIONAMENTO (dopo il rilascio, prima della conferma) ──
  // Ogni maniglia trascina SÉ STESSA tenendo fermo il lato (o l'angolo)
  // opposto: è quello il punto di ancoraggio, non il centro — così si può sia
  // allargare che restringere da qualunque parte senza che il riquadro
  // "salti".
  //
  // Gli ANGOLI muovono due lati insieme, le MEDIANE uno solo: tirare il lato
  // destro non deve toccare l'altezza. Il nome della maniglia dice già quali
  // assi controlla — 'nw' entrambi, 'e' solo l'orizzontale, 'n' solo il
  // verticale — quindi basta chiederglielo invece di rifare sempre tutti e due
  // i conti come prima, quando le maniglie erano solo agli angoli.
  const resizeMove = (px, py)=>{
    if(!resizeCorner) return;
    const r = lr || (lr = layer.getBoundingClientRect());
    const cx = Math.max(0, Math.min(px - r.left, r.width));
    const cy = Math.max(0, Math.min(py - r.top, r.height));
    const curLeft = parseFloat(box.style.left), curTop = parseFloat(box.style.top);
    const curW = parseFloat(box.style.width), curH = parseFloat(box.style.height);
    const muoveX = resizeCorner.includes('e') || resizeCorner.includes('w');
    const muoveY = resizeCorner.includes('n') || resizeCorner.includes('s');

    let left = curLeft, width = curW;
    if(muoveX){
      const anchorX = resizeCorner.includes('w') ? curLeft + curW : curLeft;
      left = Math.min(anchorX, cx); width = Math.abs(cx - anchorX);
      if(width < MIN_SIZE){ width = MIN_SIZE; left = cx <= anchorX ? anchorX - MIN_SIZE : anchorX; }
    }
    let top = curTop, height = curH;
    if(muoveY){
      const anchorY = resizeCorner.includes('n') ? curTop + curH : curTop;
      top = Math.min(anchorY, cy); height = Math.abs(cy - anchorY);
      if(height < MIN_SIZE){ height = MIN_SIZE; top = cy <= anchorY ? anchorY - MIN_SIZE : anchorY; }
    }
    // Clamp finale: se il minimo sconfina fuori dal layer, rientra senza
    // cambiare le dimensioni (l'ancora resta comunque il vincolo primario).
    left = Math.max(0, Math.min(left, r.width - width));
    top = Math.max(0, Math.min(top, r.height - height));

    box.style.left = left + 'px'; box.style.top = top + 'px';
    box.style.width = width + 'px'; box.style.height = height + 'px';
    aggiornaManiglie();
  };

  // Su un lato corto la mediana finirebbe addosso ai due angoli, e tre
  // bersagli sovrapposti in venti pixel non li centra nessuno: sotto una certa
  // lunghezza quella mediana sparisce e restano gli angoli.
  const LATO_MIN_MEDIANA = 76;
  const aggiornaManiglie = ()=>{
    const w = parseFloat(box.style.width) || 0, h = parseFloat(box.style.height) || 0;
    box.classList.toggle('senza-mediane-h', w < LATO_MIN_MEDIANA);
    box.classList.toggle('senza-mediane-v', h < LATO_MIN_MEDIANA);
  };
  const resizeEnd = ()=>{
    if(!resizeCorner) return;
    resizeCorner = null;
    syncPendingSelFromBox();
  };
  handles.forEach(h=>{
    const corner = h.dataset.corner;
    h.addEventListener('mousedown', e=>{
      e.preventDefault(); e.stopPropagation(); // non deve riavviare un nuovo disegno
      lr = layer.getBoundingClientRect();
      resizeCorner = corner;
    });
    h.addEventListener('touchstart', e=>{
      e.stopPropagation();
      lr = layer.getBoundingClientRect();
      resizeCorner = corner;
    }, { passive:true });
  });
  window.addEventListener('mousemove', e=>{ if(resizeCorner) resizeMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup', resizeEnd);
  window.addEventListener('touchmove', e=>{
    if(!resizeCorner) return;
    resizeMove(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive:false });
  window.addEventListener('touchend', resizeEnd, { passive:true });

  // ── SPOSTAMENTO (trascinando il riquadro stesso) ──
  // Gli angoli ridimensionano, il corpo sposta: si può inquadrare il dettaglio
  // giusto senza ridisegnare tutto da capo quando il riquadro ha già la
  // dimensione voluta ma è posizionato male.
  let moving = false, mvDX = 0, mvDY = 0;
  const moveStart = (px, py)=>{
    lr = layer.getBoundingClientRect();
    // Scarto tra il punto afferrato e l'angolo del riquadro: senza, il
    // riquadro salterebbe col suo angolo sotto il dito al primo movimento.
    mvDX = (px - lr.left) - parseFloat(box.style.left);
    mvDY = (py - lr.top) - parseFloat(box.style.top);
    moving = true;
    box.classList.add('grabbing');
  };
  const moveTo = (px, py)=>{
    if(!moving) return;
    const r = lr || (lr = layer.getBoundingClientRect());
    const w = parseFloat(box.style.width), h = parseFloat(box.style.height);
    // Il riquadro resta dentro la pagina: trascinandolo oltre il bordo si
    // ferma invece di uscire e portarsi via una porzione vuota.
    const left = Math.max(0, Math.min((px - r.left) - mvDX, r.width - w));
    const top  = Math.max(0, Math.min((py - r.top) - mvDY, r.height - h));
    box.style.left = left + 'px';
    box.style.top = top + 'px';
    aggiornaManiglie();
  };
  const moveEnd = ()=>{
    if(!moving) return;
    moving = false;
    box.classList.remove('grabbing');
    syncPendingSelFromBox();
  };
  box.addEventListener('mousedown', e=>{
    if(!box.classList.contains('pending')) return;
    if(e.target.closest('.ar-clip-handle')) return; // l'angolo ridimensiona
    e.preventDefault(); e.stopPropagation();
    moveStart(e.clientX, e.clientY);
  });
  box.addEventListener('touchstart', e=>{
    if(!box.classList.contains('pending')) return;
    if(e.target.closest('.ar-clip-handle')) return;
    e.stopPropagation();
    moveStart(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive:true });
  window.addEventListener('mousemove', e=>{ if(moving) moveTo(e.clientX, e.clientY); });
  window.addEventListener('mouseup', moveEnd);
  window.addEventListener('touchmove', e=>{
    if(!moving) return;
    moveTo(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive:false });
  window.addEventListener('touchend', moveEnd, { passive:true });

  // Richiamate dal tap su "Riprova"/"✓ Conferma" (vedi il click delegato più sopra).
  // ── TUTTA LA TAVOLA ──
  // Ritagliare una pagina intera era possibile ma scomodo: bisognava tirare il
  // riquadro fino agli angoli senza sbordare, e sbordando si prendeva
  // "Riquadro fuori dalla pagina". È anche il caso più frequente quando si
  // archivia una tavola che piace tutta, non un pannello. Qui il riquadro si
  // disegna da solo esattamente sull'immagine — bande nere escluse — e si va
  // dritti alla scelta della destinazione.
  ov._clipTutta = ()=>{
    const img = readerImg();
    if(!img) return;
    // Da ingranditi la tavola sborda dallo schermo: il riquadro "tutta la
    // tavola" finirebbe per metà fuori dal livello, e pur salvando comunque la
    // pagina intera (geometriaRitaglio riporta i conti dentro l'originale) si
    // vedrebbe un rettangolo tagliato — sembrerebbe che stia per salvare solo
    // il pezzo visibile. Si torna a 1x senza animazione: la misura del
    // rettangolo va presa subito dopo, e una transizione in corso la
    // falserebbe.
    if(zoomCorrente() > 1.02) resetZoom();
    const r = renderedImageRect(img, layer);
    box.hidden = false;
    box.style.left = r.x + 'px';
    box.style.top = r.y + 'px';
    box.style.width = r.w + 'px';
    box.style.height = r.h + 'px';
    pendingSel = { left: r.x, top: r.y, width: r.w, height: r.h };
    drawing = false;
    tavolaIntera = true;
    haptic('tap');
    showConfirm(true);
  };

  ov._clipRetry = ()=>{
    pendingSel = null;
    tavolaIntera = false;
    box.hidden = true;
    clearTimeout(_anticipoT);
    _anticipo = null;
    showConfirm(false);
  };
  // `scelta` e' l'id di una cartella (le pastiglie di sempre) OPPURE
  // { tag } quando si e' passati da "References". Un solo parametro invece di
  // due perche' sono alternative, non opzioni che si sommano: un ritaglio o lo
  // archivi sotto un autore o lo archivi per cosa mostra.
  ov._clipConfirm = async (scelta)=>{
    // Se il riquadro è a schermo ma la selezione in memoria si è persa — un
    // gesto interrotto dal sistema, il menu lungo di Android che ruba il
    // touchend — si riparte da quello che si VEDE invece di non fare niente.
    // Un pulsante che non risponde e non spiega è la cosa peggiore qui: si
    // aveva già disegnato, e non si capisce cosa manchi.
    if(!pendingSel && !box.hidden) syncPendingSelFromBox(true);
    if(!pendingSel) return;
    const sel = pendingSel;
    // Il lavoro anticipato vale solo se riguarda ESATTAMENTE questo riquadro:
    // un'ultima maniglia spostata un attimo prima di confermare lo rende
    // vecchio, e salvare quello vecchio sarebbe un ritaglio sbagliato.
    const pronto = (_anticipo && _anticipo.chiave === chiaveSel(sel)) ? _anticipo.promessa : null;
    // Letto PRIMA di azzerarlo: da qui in poi si passa dai await del
    // caricamento, e nel frattempo toggleClip lo rimette a false.
    const tavola = tavolaIntera;
    clearTimeout(_anticipoT);
    _anticipo = null;
    pendingSel = null;
    tavolaIntera = false;
    showConfirm(false);
    // Risolta ORA e non alla creazione del lettore: il ritaglio deve usare la
    // tavola effettivamente a schermo, non il buffer diventato nel frattempo
    // quello nascosto.
    const img = readerImg();
    if(!img) return;
    await commitClip(img, sel, layer, scelta, pronto, tavola);
    box.hidden = true;
  };

  layer.addEventListener('mousedown', e=>{
    if(box.classList.contains('pending')) return; // in questo stato solo le maniglie disegnano
    e.preventDefault(); start(e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', e=>{ if(drawing) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', ()=>{ if(drawing) end(); });
  layer.addEventListener('touchstart', e=>{
    if(box.classList.contains('pending')) return;
    start(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive:true });
  layer.addEventListener('touchmove', e=>{ move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive:false });
  layer.addEventListener('touchend', end, { passive:true });
  // Android, tenendo premuto su un'immagine, apre il suo menu ("salva
  // immagine", "cerca con Lens") e si PRENDE il gesto: arriva un touchcancel e
  // il touchend non arriva mai. Senza questa riga il riquadro restava a metà,
  // disegnato ma mai confermato, e il tocco successivo non capiva più niente.
  layer.addEventListener('touchcancel', ()=>{ if(drawing) end(); }, { passive:true });
  // E il menu, mentre si ritaglia, è sempre e solo un incidente: non si sta
  // salvando un'immagine dal web, si sta tirando un riquadro. Fuori dal
  // ritaglio resta dov'era. Quanto vada tenuto premuto perché compaia lo
  // decide Android e non è regolabile dalla pagina: si può solo lasciarlo
  // passare o fermarlo, e qui va fermato.
  layer.addEventListener('contextmenu', e=> e.preventDefault());
}

// Dal riquadro sullo schermo alle coordinate dentro la tavola a piena
// risoluzione (tolte le bande nere ai lati).
function geometriaRitaglio(img, sel, layer){
  const rect = renderedImageRect(img, layer);
  const relX = sel.left - rect.x, relY = sel.top - rect.y;
  const cx = Math.max(0, relX / rect.scale);
  const cy = Math.max(0, relY / rect.scale);
  const cw = Math.min(img.naturalWidth  - cx, sel.width  / rect.scale);
  const ch = Math.min(img.naturalHeight - cy, sel.height / rect.scale);
  if(cw < 4 || ch < 4) return null;
  return { cx, cy, cw, ch };
}

// Ritaglia il rettangolo selezionato dalla pagina a piena risoluzione.
async function commitClip(img, sel, layer, scelta, pronto, tavola){
  const g = geometriaRitaglio(img, sel, layer);
  if(!g){ toast('Riquadro fuori dalla pagina, riprova.', true); toggleClip(false); return; }

  // Si ritaglia DALLA TAVOLA GIÀ A SCHERMO. Prima si rileggeva la pagina
  // dall'archivio e la si decodificava una seconda volta da zero, solo per
  // ritagliarne un rettangolo: su una tavola da qualche migliaio di pixel
  // quella decodifica è la parte più lenta di tutto il ritaglio, ed era
  // completamente inutile — l'immagine identica, già decodificata, era lì
  // davanti. L'elemento a schermo è a piena risoluzione (il conto del crop
  // usa già il suo naturalWidth/naturalHeight), quindi il risultato non
  // cambia di un pixel.
  const done = exportCropAndSave(img, g.cx, g.cy, g.cw, g.ch, scelta, pronto, tavola);
  // La modalità ritaglio si chiude SUBITO: il caricamento su Cloudinary
  // prosegue in sottofondo e si annuncia da solo col banner. Prima l'intera
  // interfaccia restava bloccata per tutta la durata della rete.
  toggleClip(false);
  await done;
}

// Serve ancora alla copertina dello scaffale (makeCoverBlob), che parte da un
// Blob e non da un'immagine già a schermo.
export function blobToImage(blob){
  return new Promise((res, rej)=>{
    const url = URL.createObjectURL(blob);
    const im = new Image();
    im.onload = ()=>{ res(im); };
    im.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('img')); };
    im.src = url;
    im._objurl = url;
  });
}

// Il lato lungo del ritaglio che viene salvato.
//
// Era 2000, ed è sceso a 1600 dopo aver misurato dove se ne va il tempo di un
// ritaglio. Su una tavola scansionata (tratto + retini, il caso peggiore per
// la compressione), ritagliandone circa metà:
//
//   2000px → codifica ~800-1000 ms, 1038 KB da spedire
//   1600px → codifica ~300-480 ms,   728 KB da spedire
//
// Cioè meno della metà del tempo di codifica e un terzo di byte in meno sulla
// rete, che su 4G è la parte più lunga di tutte. C'è anche un effetto
// nascosto: a 2000px il primo tentativo sfondava spesso CLIP_MAX_BYTES e
// faceva scattare la ricodifica qui sotto — una seconda codifica intera, da
// capo. A 1600 non succede mai, quindi il giro è sempre uno solo.
//
// Cosa si perde: niente di visibile. Il ritaglio si guarda in galleria, dove
// Cloudinary lo riserve comunque ridimensionato e ricompresso (cldResize con
// q_auto/f_auto); 1600px sul lato lungo restano più di quanti pixel abbia lo
// schermo su cui lo si guarda, anche ingrandendolo.
//
// COME FINISCE, misurato poi sul telefono vero (Xiaomi, 5G), che è l'unico
// posto dove la domanda ha senso: preparazione 0,0s — sparita del tutto
// grazie alla compressione anticipata, vedi anticipaRitaglio — spedizione
// 0,0s, e 1,2s di attesa del server (Cloudinary che elabora, Firestore che
// scrive). Quindi da qui in avanti: spedire meno byte non serve più a niente,
// il tempo che resta è tutto dall'altra parte del filo. Se un giorno quel
// secondo desse fastidio, l'unica strada è dichiarare il ritaglio salvato
// prima che il server risponda — che vuol dire dire "fatto" a scatola chiusa,
// ed è un prezzo diverso da tutti quelli pagati finora.
const CLIP_MAX_DIM = 1600;
const CLIP_MAX_BYTES = 1400000;

// Il tempo di un ritaglio è quasi tutto CARICAMENTO: disegnare e comprimere
// sono decimi di secondo, spedire un megabyte e mezzo su 4G sono secondi. Il
// solo modo di accorciarlo davvero è spedire meno byte, ed è quello che fa il
// WebP: a parità di resa pesa il 30-40% in meno del JPEG, quindi mezzo mega
// invece di uno e mezzo. Il formato con cui i ritagli vengono poi SERVITI non
// cambia di niente — ci pensa f_auto di Cloudinary (vedi cldResize in
// refs.js), che consegna a ciascun browser il formato più leggero che sa
// leggere, qualunque cosa gli abbiamo caricato.
//
// Il controllo si fa su un canvas di UN pixel e una volta sola: farlo sul
// canvas del ritaglio significherebbe codificare due volte un'immagine da due
// megapixel per scoprire una cosa che non cambia mai.
let _webpOk = null;
function supportaWebp(){
  if(_webpOk !== null) return _webpOk;
  try{
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    _webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }catch(e){ _webpOk = false; }
  return _webpOk;
}

// Disegna il crop su canvas (con cap dimensionale) e lo comprime. Solo lavoro
// locale: nessuna rete. Torna { blob, w, h, encode } — `encode` serve al
// ripiego in JPEG, che riparte dallo stesso canvas senza ridisegnarlo.
// Esportata per lo stesso motivo: qui c'e' tutta la parte che non si vuole
// riscrivere due volte — il tetto alle dimensioni, la scelta fra WebP e JPEG,
// e la qualita' che scende finche' il file non sta sotto il peso massimo.
export async function preparaRitaglio(sourceImg, cx, cy, cw, ch){
  const im = sourceImg;
  if(!im || !im.naturalWidth) return null;

  let w = Math.round(cw), h = Math.round(ch);
  if(w > CLIP_MAX_DIM || h > CLIP_MAX_DIM){
    if(w >= h){ h = Math.round(h * CLIP_MAX_DIM / w); w = CLIP_MAX_DIM; }
    else { w = Math.round(w * CLIP_MAX_DIM / h); h = CLIP_MAX_DIM; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Niente revoke dell'URL qui: questa immagine è la tavola VISUALIZZATA, non
  // una copia usa-e-getta. Revocarla la farebbe sparire dallo schermo.
  ctx.drawImage(im, cx, cy, cw, ch, 0, 0, w, h);

  const webp = supportaWebp();
  const tipo = webp ? 'image/webp' : 'image/jpeg';
  // 0.82 in WebP rende quanto 0.88 in JPEG, pesando molto meno.
  let quality = webp ? 0.82 : 0.88;
  const encode = (t, q)=> new Promise(res=> canvas.toBlob(res, t, q));
  let blob = await encode(tipo, quality);
  while(blob && blob.size > CLIP_MAX_BYTES && quality > 0.5){
    quality = Math.max(0.5, quality - 0.1);
    blob = await encode(tipo, quality);
  }
  if(!blob) return null;
  return { blob, w, h, webp, encode };
}

// Prende il ritaglio già pronto (o lo prepara adesso) e lo consegna a refs.js,
// che lo carica su Cloudinary e scrive il Frammento con provenienza
// { opera, pagina }.
//
// `pronto` è la preparazione avviata mentre si sceglieva la destinazione (vedi
// anticipaRitaglio in wireClip): se c'è, qui non si aspetta niente.
async function exportCropAndSave(sourceImg, cx, cy, cw, ch, scelta, pronto, tavola){
  // Una cartella o un tag: vedi ov._clipConfirm.
  const tag = (scelta && typeof scelta === 'object' && scelta.tag) ? scelta.tag : null;
  const destFolderId = (typeof scelta === 'string' && scelta) ? scelta : null;
  toast(tavola ? 'Salvataggio della tavola…' : 'Ritaglio in corso…', false, true);

  // Provenienza e destinazione lette ORA, non dopo l'upload: da quando il
  // caricamento prosegue in sottofondo si può già voltare pagina mentre è in
  // corso, e indiceCorrente() sarebbe quello nuovo — il frammento si porterebbe dietro il
  // numero di pagina sbagliato.
  const sourceFolderId = getActiveFolderId();
  // Col tag scelto il ritaglio NON eredita la cartella dell'artista da cui stai
  // leggendo: sono due modi alternativi di archiviare, e infilarlo anche sotto
  // l'autore vorrebbe dire vederlo comparire in un posto che non hai scelto.
  // La provenienza pero' resta scritta qui sotto, quindi da dove viene non si
  // perde in nessun caso.
  const folderId = tag ? null : (destFolderId || sourceFolderId);
  const provenance = {
    opera: nomeAlbo(),
    pagina: indiceCorrente() + 1,
    folderId: sourceFolderId || null,   // cartella artista di origine
  };

  // L'anticipo è una SCORCIATOIA, non un requisito: se per qualunque motivo non
  // ha prodotto niente — la tavola non ancora decodificata quando è partito, un
  // gesto di sistema che ha interrotto tutto a metà — si prepara adesso invece
  // di arrendersi. Senza questa riga un'ottimizzazione poteva far fallire il
  // ritaglio in silenzio: si confermava, non si salvava niente, e la barra
  // restava lì come se nulla fosse.
  let preparato = pronto ? await pronto : null;
  if(!preparato) preparato = await preparaRitaglio(sourceImg, cx, cy, cw, ch);
  if(!preparato){ toast('Ritaglio fallito.', true); toggleClip(false); return; }
  const { blob, w, h, webp, encode } = preparato;

  // folderId e provenance sono stati catturati in cima, prima di qualunque
  // await: la provenienza viaggia SEMPRE col ritaglio, anche quando finisce
  // in una cartella di studio, così le mani archiviate in "Hands" continuano
  // a sapere di essere di Satoshi Kon, pagina 88.
  // Da qui in poi comanda la rete, ed è la parte lunga. Un banner fermo che
  // dice "Ritaglio in corso…" per qualche secondo fa sembrare l'app piantata:
  // con la percentuale che sale il tempo è lo stesso, ma si vede che sta
  // andando. Si arrotonda a multipli di 5 per non far tremolare la scritta ad
  // ogni pacchetto.
  let ultimo = -1;
  const avanzamento = (fatti, totale)=>{
    if(!totale) return;
    const pct = Math.min(99, Math.round(fatti / totale * 20) * 5);
    if(pct === ultimo) return;
    ultimo = pct;
    toast('Ritaglio in corso… ' + pct + '%', false, true);
  };

  const tags = tag ? [tag] : null;
  let id = await addRefBlob(blob, { folderId, source: 'clip', provenance, w, h, onProgress: avanzamento, tavola, tags });
  // Rete di sicurezza sul formato: se il caricamento non riesce col WebP si
  // riprova UNA volta in JPEG. Il preset di Cloudinary è fuori da questo
  // repository e potrebbe non accettarlo: meglio un ritaglio più pesante che
  // un ritaglio perso, e senza doverlo scoprire dall'utente.
  if(!id && webp){
    const ripiego = await encode('image/jpeg', 0.88);
    if(ripiego) id = await addRefBlob(ripiego, { folderId, source: 'clip', provenance, w, h, onProgress: avanzamento, tavola, tags });
  }
  if(id){
    haptic('done');
    // Solo le destinazioni scelte a mano: la cartella corrente è già in cima
    // per conto suo, e ricordarla spingerebbe giù gli studi davvero usati.
    if(destFolderId && destFolderId !== sourceFolderId) rememberClipDest(destFolderId);
    // Il messaggio dice anche IN QUALE DEI DUE SCAFFALI e' finita: una tavola
    // non compare fra i ritagli, e senza dirlo si va a cercarla dove non c'e'.
    const destName = destFolderId ? getFolderName(destFolderId) : null;
    const dove = tavola ? ' · Tavole' : '';
    toast(tag ? ('Salvato in ' + tag + ' \u2713')
              : destName ? ('Salvato in ' + destName + dove + ' \u2713')
              : (tavola ? 'Tavola salvata \u2713' : 'Frammento salvato \u2713'));
  }
  else { toast(tavola ? 'Salvataggio della tavola fallito.' : 'Salvataggio del frammento fallito.', true); }
}

