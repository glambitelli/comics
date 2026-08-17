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
// I moduli che hanno ancora la loro copia si sposteranno qui uno per volta:
// il posto giusto dove metterla e' questo, e da qui non si muove piu'.
export function esc(s){
  return (s == null ? '' : String(s))
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
