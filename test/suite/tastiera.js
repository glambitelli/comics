// La tastiera del telefono non deve coprire quello che si sta scrivendo
//
// Il difetto: si toccava "+" per aggiungere un artista, si alzava la tastiera e
// il modulo "Nuovo artista" restava dov'era — centrato rispetto allo schermo
// INTERO, di cui la tastiera copriva la meta' bassa. Il campo COGNOME finiva
// sotto i tasti: si scriveva alla cieca, senza vedere una lettera.
//
// La tastiera non rimpicciolisce la pagina, le si siede sopra: la finestra
// "vera" (innerHeight) resta alta uguale, e un foglio con position:fixed non
// se ne accorge. Quello che si accorge e' visualViewport, che dice quanta
// pagina si vede ancora. Qui si simula la tastiera restringendo proprio
// visualViewport — cioe' l'unico segnale che il browser da' davvero.
const { suite } = require('../motore.js');

module.exports = () => suite("Tastiera — i moduli restano sopra i tasti", {"banco": "/test/banco/tavole.html"}, async ({ page, ok, sezione }) => {

  // Alza/abbassa la tastiera finta: visualViewport.height diventa quella
  // dichiarata e parte l'evento che il browser manda in quel momento.
  const tastiera = (altezza)=> page.evaluate(h=>{
    const vv = window.visualViewport;
    if(h === null){ delete vv.height; }
    else Object.defineProperty(vv, 'height', { value:h, configurable:true });
    vv.dispatchEvent(new Event('resize'));
  }, altezza);
  const misura = ()=> page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    const foglio = ov && ov.firstElementChild;
    const campo = ov && ov.querySelector('.field-input');
    const r = ov ? ov.getBoundingClientRect() : null;
    const rf = foglio ? foglio.getBoundingClientRect() : null;
    const rc = campo ? campo.getBoundingClientRect() : null;
    return {
      velo: r ? { top:Math.round(r.top), basso:Math.round(r.bottom) } : null,
      foglio: rf ? { top:Math.round(rf.top), basso:Math.round(rf.bottom) } : null,
      campo: rc ? { top:Math.round(rc.top), basso:Math.round(rc.bottom) } : null,
      scorre: ov ? ov.scrollHeight > ov.clientHeight + 1 : null,
      variabile: getComputedStyle(document.documentElement).getPropertyValue('--vv-h').trim(),
    };
  });
  const chiudi = ()=> page.evaluate(()=>{
    const ov = document.querySelector('.modal-overlay.open');
    if(ov) ov.querySelector('.btn-cancel').dispatchEvent(new MouseEvent('click',{bubbles:true}));
  });

  sezione('senza tastiera la variabile e\' lo schermo intero');
  const riposo = await page.evaluate(()=>({
    vv: getComputedStyle(document.documentElement).getPropertyValue('--vv-h').trim(),
    schermo: window.visualViewport.height + 'px',
  }));
  ok('--vv-h vale l\'altezza visibile', riposo.vv === riposo.schermo, riposo);

  sezione('alzando la tastiera, il modulo "Nuovo artista" resta sopra i tasti');
  await page.evaluate(c=>{ window.seminaCartelle(c); }, [
    { id:'a1', category:'Artists', cognome:'Otomo', nome:'Katsuhiro', name:'Otomo Katsuhiro' },
  ]);
  await page.waitForTimeout(250);
  // 380px di finestra visibile su 915: e' all'incirca quello che resta con la
  // tastiera di Android alzata.
  await tastiera(380);
  await page.evaluate(()=>{ window.promptNewFolder('Artists'); });   // non si attende: resta aperto
  await page.waitForTimeout(250);
  const conTastiera = await misura();
  ok('la variabile segue la tastiera', conTastiera.variabile === '380px', conTastiera);
  ok('il velo finisce dove cominciano i tasti',
     conTastiera.velo && conTastiera.velo.basso <= 381, conTastiera);
  ok('il foglio sta tutto nella parte che si vede',
     conTastiera.foglio && conTastiera.foglio.top >= 0 && conTastiera.foglio.basso <= 380,
     conTastiera);
  ok('e il campo da riempire e\' sopra i tasti, non sotto',
     conTastiera.campo && conTastiera.campo.basso <= 380 && conTastiera.campo.top >= 0,
     conTastiera);

  sezione('e se lo spazio non basta, il foglio si scorre');
  // Schermo cortissimo (telefono piccolo in orizzontale, o tastiera con la
  // barra dei suggerimenti): il modulo non ci sta. Non deve venire tagliato —
  // deve poterselo scorrere, altrimenti il secondo campo e i pulsanti
  // diventano irraggiungibili.
  await tastiera(200);
  await page.waitForTimeout(150);
  const stretto = await misura();
  ok('il velo si stringe fino allo spazio rimasto',
     stretto.velo && stretto.velo.basso <= 201, stretto);
  ok('e quello che non ci sta si raggiunge scorrendo', stretto.scorre === true, stretto);

  sezione('abbassando la tastiera si torna com\'era');
  await tastiera(null);
  await page.waitForTimeout(150);
  const dopo = await misura();
  ok('il velo torna a coprire tutto',
     dopo.velo && dopo.velo.basso > 800, dopo);
  ok('e il foglio si ricentra', dopo.foglio && dopo.foglio.top > 200, dopo);
  await chiudi();

  sezione('la stessa regola vale per gli altri fogli in cui si scrive');
  // Editor delle idee e scriptment sono a tutto schermo e sono POSTI IN CUI SI
  // SCRIVE: se restano alti quanto lo schermo, la riga del cursore finisce
  // sotto i tasti esattamente come il campo del cognome.
  const fogli = await page.evaluate(async ()=>{
    const css = await Promise.all(['/css/idee.css','/css/scriptment.css','/css/modals.css']
      .map(u=> fetch(u).then(r=>r.text())));
    const regola = (testo, sel)=>{
      const i = testo.indexOf(sel + '{');
      return i < 0 ? '' : testo.slice(i, testo.indexOf('}', i));
    };
    return {
      idee: regola(css[0], '.idea-editor'),
      script: regola(css[1], '.scriptment-overlay'),
      modali: regola(css[2], '.modal-overlay'),
    };
  });
  ok('l\'editor delle idee si misura sulla parte visibile',
     /--vv-h/.test(fogli.idee), fogli.idee);
  ok('e cosi\' lo scriptment', /--vv-h/.test(fogli.script), fogli.script);
  ok('e i modali, tutti quanti', /--vv-h/.test(fogli.modali), fogli.modali);
  // Nessuno dei tre deve essere rimasto ancorato allo schermo intero: e'
  // proprio inset:0 il pezzo che ignorava la tastiera.
  ok('nessuno resta attaccato a inset:0',
     ![fogli.idee, fogli.script, fogli.modali].some(r=> /inset:\s*0/.test(r)), fogli);

});
