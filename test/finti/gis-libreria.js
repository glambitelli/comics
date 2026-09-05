// La libreria di Google (accounts.google.com/gsi/client), finta.
//
// NON E' UN FINTO DELLA MAPPA DI IMPORT come gli altri file qui dentro: quelli
// sostituiscono un modulo di js/, questo sostituisce uno <script> che l'app
// scarica da Google. Lo serve motore.js a tutte le prove, cosi' nessuna
// finisce davvero su accounts.google.com — sulla macchina che pubblica non
// c'e' rete verso Google, e senza questo la porta d'ingresso resterebbe li' ad
// aspettare un download che non arriva mai.
//
// Cosa si comanda dalla prova:
//   window.__gisAnnullato = true   → l'utente chiude la finestra di Google
//   window.__gisErrore = 'testo'   → Google risponde con un errore
//   window.__gisToken              → il token restituito (default TOKEN-DI-PROVA)
// e cosa si legge:
//   window.__gisRichieste          → quante volte si e' aperta la finestra
//   window.__gisScope              → gli scope chiesti dall'ultimo client
window.google = {
  accounts: {
    oauth2: {
      initTokenClient(cfg){
        window.__gisScope = cfg && cfg.scope;
        window.__gisClientId = cfg && cfg.client_id;
        return {
          callback: cfg && cfg.callback,
          error_callback: null,
          requestAccessToken(){
            window.__gisRichieste = (window.__gisRichieste || 0) + 1;
            const cliente = this;
            setTimeout(()=>{
              if(window.__gisAnnullato){
                if(cliente.error_callback) cliente.error_callback({ type:'popup_closed', message:'Finestra chiusa' });
                return;
              }
              if(window.__gisErrore){
                cliente.callback({ error: window.__gisErrore });
                return;
              }
              cliente.callback({
                access_token: window.__gisToken || 'TOKEN-DI-PROVA',
                expires_in: 3600,
              });
            }, 0);
          },
        };
      },
    },
  },
};
