# Le prove

```
npm test                     # tutte le suite
node test/esegui.js lettore  # solo quelle il cui nome file contiene "lettore"
```

Serve `playwright` (`npm install`, oppure va bene anche quello installato
globalmente: il motore lo cerca in tutti e due i posti) e un Chromium — in
questo ambiente sta già in `/opt/pw-browsers`, quindi **non** si lancia mai
`playwright install`.

## Come sono fatte

Il punto di tutta l'impalcatura è uno solo: **le prove girano sul codice vero**.
`test/motore.js` alza un server statico sulla radice del repository, quindi
`js/albums.js`, `js/refs.js`, `css/albums.css` e il markup di `index.html` sono
quelli che finiscono in produzione, non copie. Se domani si cambia il lettore
senza aggiornare le prove, le prove se ne accorgono — è esattamente ciò che
serve.

Le uniche cose sostituite sono le dipendenze che parlerebbero con la rete
(Firebase, Cloudinary, Google Drive) o che aprirebbero finestre di sistema. La
sostituzione avviene con una **mappa di import** dentro le pagine di
`test/banco/`:

```html
<script type="importmap">
{ "imports": { "/js/drive.js": "/test/finti/drive.js" } }
</script>
```

Così il modulo sotto esame resta l'originale e cambia solo ciò che gli sta
intorno. Non c'è una copia parallela dell'app da tenere allineata a mano: era
il difetto della prima versione di queste prove, e le faceva passare su
qualcosa che non esisteva più.

Le pagine di banco che hanno bisogno di markup dell'app (la lightbox della
galleria, per esempio) se lo vanno a **prendere da `index.html`** con una
fetch, invece di riscriverlo: se il markup cambia, la prova segue.

## Le cartelle

| | |
|---|---|
| `motore.js` | server statico, avvio del browser, conteggio dei controlli |
| `esegui.js` | esegue le suite in sequenza e stampa il totale |
| `crea-albi.js` | genera gli albi `.cbz` di prova |
| `banco/` | le pagine HTML che montano l'app con le mappe di import |
| `finti/` | i moduli che sostituiscono rete e finestre di sistema |
| `suite/` | le prove vere e proprie |
| `fixtures/` | gli albi generati — **non stanno nel repository** |

Gli albi mancanti li rigenera `esegui.js` da solo al primo avvio.

## Il trucco che regge quasi tutto

In `pagine.cbz` la tavola numero *n* è un PNG largo esattamente *n* pixel.
Quindi `img.naturalWidth` **dice** quale pagina una cella sta mostrando: non
si legge un attributo che il codice stesso ha scritto (che confermerebbe solo
sé stesso), si guarda il pixel che l'utente vedrebbe. Serve a verificare la
cosa più delicata del lettore — che le tre celle del nastro vengano
*riciclate* e non ricreate, perché è il riciclo che permette al browser di
riusare la decodifica invece di rifarla ad ogni sfoglio.

Gli altri albi servono ad altro: `tavole.cbz` ha proporzioni da fumetto,
`alta.cbz` è vincolata in altezza (quindi lo zoom si sposta davvero),
`pesante.cbz` è una scansione vera a 2480×3508 per le misure di memoria.

## Scrivere una suite nuova

```js
const { suite } = require('../motore.js');

module.exports = () => suite("Nome che si legge nel resoconto",
  { banco: '/test/banco/lettore.html' },
  async ({ page, base, ok, sezione }) => {
    sezione('quello che si sta provando');
    ok('descrizione del controllo', condizione, datiUtiliSeFallisce);
  });
```

Il file va in `test/suite/` e `esegui.js` lo trova da solo. La pagina di banco
deve mettere `window.__ready = true` quando ha finito di montare: il motore
aspetta quello prima di cominciare.

## Due cose imparate a spese nostre

**Il doppio tocco viene ignorato entro un secondo da un tocco.** È una difesa
del lettore contro il `dblclick` sintetico che i browser generano da soli dopo
un tap. Nelle prove va rispettata: `waitForTimeout(1150)` prima di simulare un
doppio clic, altrimenti non succede niente e sembra un bug.

**Lo stato non si azzera da solo fra una sezione e l'altra.** Zoom, pan e
pagina corrente restano quelli che ha lasciato la sezione precedente, e una
prova che comincia dal presupposto sbagliato misura la cosa sbagliata senza
fallire. Dove conta, si riparte da una condizione dichiarata e verificata
(`ingrandita()` in `lettore-zoom.js` azzera lo zoom e lo rifà, controllando di
essere davvero dove crede).

## Controllare la sintassi di un modulo

`node --check js/qualcosa.js` **non basta**: Node legge un `.js` come CommonJS e
su un file pieno di `export` non si lamenta come farebbe il browser. Un `export`
finito per sbaglio dentro una funzione — che nel browser e' un errore secco e
lascia la pagina bianca — passa liscio.

Per controllare davvero, si legge come modulo:

    cp js/qualcosa.js /tmp/x.mjs && node --check /tmp/x.mjs
