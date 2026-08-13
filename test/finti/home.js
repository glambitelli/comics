// Finto home.js: idee.js gliene chiede una cosa sola, il costruttore di un
// progetto nuovo. Il vero home.js aggancia listener a elementi della schermata
// principale che nel banco non ci sono.
export function newProjectObj(title, numTav){
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2,5),
    title: title || 'Nuovo progetto',
    numTav: parseInt(numTav) || 10,
    scriptment: { text:'', font:'courier', size:13 },
    steps:{}, tavole:{}, createdAt: Date.now(),
  };
}
export function getScriptment(p){ return p.scriptment; }
