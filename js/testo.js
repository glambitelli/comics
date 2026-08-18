// ── TESTO SCRITTO DA CHI USA L'APP ──
//
// Un titolo di progetto, il nome di un artista, un tag, una riga di idea: sono
// tutte cose che finiscono dentro innerHTML, e nessuna di loro e' HTML. Basta
// una "<" — "Kara <3" — perche' il browser si metta a cercare un tag che non
// esiste e la scheda si mangi il resto della riga.
//
// La funzione esisteva gia' in SEI moduli, copiata sei volte con sei nomi
// (esc, escAttr, escHtml, escHtmlStats…), e in home.js non c'era affatto: il
// titolo del progetto era l'unico pezzo di testo scritto da te che entrava
// nella pagina senza passare da nessuna parte. Qui c'e' una volta sola.
//
// Adesso le copie sono sparite tutte e otto e i moduli importano da qui. Se un
// giorno serve di nuovo, la si aggiunge QUI: una funzione di sicurezza copiata
// in giro e' otto posti dove una svista diventa un buco, e sette dove la
// correzione non arriva.
export function esc(s){
  return (s == null ? '' : String(s))
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// Per un attributo scritto fra apici singoli — o per un nome che finisce
// dentro un onclick inline, cioe' dentro una stringa JavaScript dentro un
// attributo HTML. Li' l'apostrofo di "l'attesa" basta a rompere tutto.
export function escAttr(s){
  return esc(s).replace(/'/g, '&#39;');
}
