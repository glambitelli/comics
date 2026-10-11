// Drive — la cartella dell'autore si trova anche se il nome non e' identico
//
// L'11 ottobre 2026 «YUKIMURA Makoto» c'era su Drive, accanto agli altri
// autori, e Inkflow diceva «Su Drive manca». La ricerca di Drive vuole il
// nome identico carattere per carattere: uno spazio in fondo, lo spazio
// speciale di certe tastiere, o nome e cognome invertiti, e non la trova.
// Ora, se il nome esatto non c'e', si confrontano i nomi come li legge una
// persona (nomeAOcchio in js/drive.js). Gira su js/drive.js vero, con le
// risposte di Drive finte.
const { suite } = require('../motore.js');

module.exports = () => suite("Drive — la cartella dell'autore si trova anche se il nome non e' identico", {"banco": "/test/banco/drive.html"}, async ({ page, ok, sezione }) => {

  // Drive finto: nella cartella radice ci sono queste cartelle, ognuna con un
  // PDF dentro. La ricerca per nome esatto si comporta come quella vera.
  // Ogni caso parte da una pagina nuova: drive.js si ricorda per tutta la
  // sessione le cartelle gia' trovate, e un caso erediterebbe quella di prima.
  const prova = async (cartelle, cerca) => { await page.reload(); await page.waitForFunction(() => window.__ready === true); return page.evaluate(async ({ cartelle, cerca }) => {
    window.fetch = async (url) => {
      const u = new URL(String(url));
      const q = u.searchParams.get('q') || '';
      const json = o => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });
      const esatto = /and name='((?:[^'\\]|\\.)*)'/.exec(q);
      if(/mimeType='application\/vnd.google-apps.folder'/.test(q)){
        const tutte = cartelle.map((n, i) => ({ id: 'c' + i, name: n }));
        if(esatto){
          const n = esatto[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
          return json({ files: tutte.filter(f => f.name === n) });
        }
        return json({ files: tutte });
      }
      const dentro = /'(c\d+)' in parents/.exec(q);
      if(dentro) return json({ files: [{ id: 'f-' + dentro[1], name: 'Vinland Saga 01.pdf', size: '1000', mimeType: 'application/pdf' }] });
      return json({ files: [] });
    };
    const r = await window.drive.listDriveAlbumsForFolder(cerca);
    return { stato: r.stato, file: (r.files || []).map(f => f.id + ':' + f.name) };
  }, { cartelle, cerca }); };

  sezione('il nome identico si trova come prima');
  let r = await prova(['KON Satoshi', 'YUKIMURA Makoto'], 'YUKIMURA Makoto');
  ok('trovata, e c\'e\' il PDF', r.stato === 'ok' && r.file[0] === 'f-c1:Vinland Saga 01.pdf', r);

  sezione('uno spazio in fondo al nome su Drive');
  r = await prova(['KON Satoshi', 'YUKIMURA Makoto '], 'YUKIMURA Makoto');
  ok('trovata lo stesso', r.stato === 'ok' && r.file[0] === 'f-c1:Vinland Saga 01.pdf', r);

  sezione('lo spazio "speciale" di certe tastiere');
  r = await prova(['YUKIMURA Makoto'], 'YUKIMURA Makoto');
  ok('trovata lo stesso', r.stato === 'ok' && r.file.length === 1, r);

  sezione('nome e cognome invertiti, maiuscole diverse, accenti');
  r = await prova(['Makoto Yukimura'], 'YUKIMURA Makoto');
  ok('ordine invertito: trovata', r.stato === 'ok' && r.file.length === 1, r);
  r = await prova(['MOEBIUS'], 'Mœbius'.replace('œ', 'oe'));
  ok('maiuscole diverse: trovata', r.stato === 'ok' && r.file.length === 1, r);
  r = await prova(['Hergé'], 'HERGE');
  ok('accento in piu\' su Drive: trovata', r.stato === 'ok' && r.file.length === 1, r);

  sezione('ma un nome diverso resta diverso');
  r = await prova(['KON Satoshi', 'OTOMO Katsuhiro'], 'YUKIMURA Makoto');
  ok('nessuna cartella: «Su Drive manca»', r.stato === 'senzaCartella', r);
  r = await prova(['YUKIMURA'], 'YUKIMURA Makoto');
  ok('solo il cognome non basta', r.stato === 'senzaCartella', r);
});
