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
});
