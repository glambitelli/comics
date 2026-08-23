# Inkflow — note per Claude

## Come lavoriamo

- **Si pubblica su `main`.** Il deploy su GitHub Pages parte da lì (vedi
  `.github/workflows/pages.yml`): finché il lavoro sta su un branch, Giovanni
  non lo vede sul telefono. Quindi: commit, merge su `main`, push.
- **Ogni volta che si tocca CSS o JS va alzata la versione della cache** in
  `sw.js` (`const CACHE = 'inkflow-static-vNNN'`), altrimenti il service worker
  continua a servire i file vecchi.
- **Si parla italiano**, nei commit e nei commenti del codice compresi. I
  messaggi di commit descrivono l'effetto per chi usa l'app, non il refactor
  ("Lettore: la tavola segue il dito durante lo swipe", non "rifattorizza il
  buffer delle pagine").
- **I commenti nel codice spiegano il PERCHÉ**, con i numeri misurati e la
  storia di cosa non funzionava prima. È lo stile del progetto: vanno mantenuti
  e aggiornati, non asciugati.

## Le prove

`npm test` esegue tutte le suite in `test/suite/` (circa 200 controlli, pochi
minuti). Girano su un Chromium vero e sul **codice del repository**, non su una
copia: se si tocca il lettore, la galleria, i suoni, lo scaricamento da Drive o
il ritaglio, si lancia `npm test` prima di pubblicare. Dettagli e come
scriverne di nuove: `test/README.md`.

La cartella `test/` non finisce sul sito: il workflow di Pages la esclude.

## Come chiudere ogni messaggio

Alla fine di **ogni** risposta, un resoconto brevissimo in due parti:

1. **Cosa ho fatto** — due o tre righe, non un elenco lungo.
2. **Come lo provi** — i passi concreti sul telefono o sul browser: dove
   andare, cosa toccare, cosa dovresti vedere. Se serve aspettare il deploy,
   dirlo.
3. **Il link**, sempre, in fondo: <https://glambitelli.github.io/comics/>.
   Anche quando sembra ovvio. Giovanni legge le risposte dal telefono e la
   differenza fra "vai su Inkflow" e un link da toccare e' se la prova la fa
   subito o la rimanda.
