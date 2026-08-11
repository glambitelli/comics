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

## Come chiudere ogni messaggio

Alla fine di **ogni** risposta, un resoconto brevissimo in due parti:

1. **Cosa ho fatto** — due o tre righe, non un elenco lungo.
2. **Come lo provi** — i passi concreti sul telefono o sul browser: dove
   andare, cosa toccare, cosa dovresti vedere. Se serve aspettare il deploy,
   dirlo.
