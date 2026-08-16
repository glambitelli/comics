// Citazioni della Home. Vivevano dentro stats.js: per una funzione di sei
// righe l'avvio doveva caricare e valutare i 40 KB delle statistiche, che
// servono solo quando apri quella schermata. Estratte qui, stats.js diventa
// caricabile al primo uso.
// ── CITAZIONI & TIPS VERIFICATI ──
// Fonti: Moebius "Breve manual para historietistas" (1996); Miyazaki "Starting Point";
// James Cameron (MasterClass, intervista Charlie Rose, Variety); Quentin Tarantino (interviste Creative Screenwriting, Far Out);
// Katsuhiro Otomo (Exploring Akira, Anime News Network, Paul Gravett, ScreenRant); Satoshi Kon (Midnight Eye, Animation Obsessive, All the Anime);
// Daisuke Igarashi (du9, Wikipedia, CartoonWiki, Anime News Network); John Carpenter (AZQuotes, BrainyQuote, Mental Floss);
// Sergio Leone (American Film 1984 via Scraps from the Loft, AZQuotes, Bookey);
// Chuck Jones ("Chuck Amuck", 1989 — la frase dei centomila disegni è di un suo
//   maestro, che Jones racconta nel libro; le altre sono sue);
// Pablo Picasso (attribuzioni diffuse: Wikiquote segnala "inspiration exists"
//   come non tracciata a una fonte primaria: restano frasi che gli si attribuiscono);
// Gustav Klimt ("Commento a un autoritratto inesistente", via Neue Galerie);
// Milt Kahl e Glen Keane (interviste raccolte da Animator Island e A-Z Quotes);
// Masamune Shirow (intervista SMCA, catalogo 1994);
// Naoki Urasawa (incontro a Japan House Los Angeles, gennaio 2019);
// Osamu Tezuka (raccolte Wikiquote / Lib Quotes)
const TIPS = [
  { text:"Prima di disegnare, liberati dei sentimenti profondi — odio, felicità, ambizione: bloccano la creatività.", author:"Moebius" },
  { text:"È fondamentale educare la mano: addestrala finché non obbedisce senza sforzo, così potrà esprimere pienamente le tue idee.", author:"Moebius" },
  { text:"Attenzione a cercare troppa perfezione o troppa velocità: sono pericolose tanto quanto i loro opposti.", author:"Moebius" },
  { text:"Conoscere la prospettiva è fondamentale: le sue regole servono a guidare — e a ipnotizzare — chi legge.", author:"Moebius" },
  { text:"In un vestito ci sono mille pieghe; devi sceglierne solo due o tre. Assicurati di scegliere quelle giuste.", author:"Moebius" },
  { text:"Viaggia, immergiti in ogni forma d'arte, musica, cultura e architettura: nutri la mente, nutri l'anima.", author:"Moebius" },
  { text:"La cosa più importante quando crei è sapere cosa vuoi dire. Devi avere un tema.", author:"Hayao Miyazaki" },
  { text:"Molti realizzano opere con un altissimo livello tecnico, ma con un'idea molto sfocata di cosa vogliono davvero dire.", author:"Hayao Miyazaki" },
  { text:"Se non osservi le persone reali, non puoi disegnarle davvero: non le hai mai guardate per bene.", author:"Hayao Miyazaki" },
  { text:"Traggo ispirazione dalla mia vita di tutti i giorni.", author:"Hayao Miyazaki" },
  // ── James Cameron ──
  { text:"Devi trovare una chiave per il cuore del pubblico: temi universali, espressi in modi nuovi e sorprendenti.", author:"James Cameron" },
  { text:"Parto sempre dal finale: mi chiedo se il punto d'arrivo saprà davvero emozionarmi.", author:"James Cameron" },
  { text:"Ci deve essere conflitto: i personaggi si rivelano attraverso il conflitto, il tradimento e la perdita.", author:"James Cameron" },
  { text:"Molti non realizzano i loro sogni perché ci pensano troppo, o sono troppo cauti per fare il salto.", author:"James Cameron" },
  // ── Quentin Tarantino ──
  { text:"Metto i personaggi nella stanza insieme e li lascio parlare: sono loro a fare la maggior parte del lavoro.", author:"Quentin Tarantino" },
  { text:"So dove deve arrivare la scena, ma non costruisco i dialoghi a tavolino per arrivarci.", author:"Quentin Tarantino" },
  { text:"L'obiettivo è far prendere fuoco alla conversazione tra i personaggi.", author:"Quentin Tarantino" },
  { text:"Prometti al pubblico, fin dalle prime battute, che sta per succedere qualcosa di interessante.", author:"Quentin Tarantino" },
  { text:"Ogni parola conta: a volte ciò che non viene detto è potente quanto ciò che si dice.", author:"Quentin Tarantino" },
  // ── Katsuhiro Otomo ──
  { text:"Il mio stile è nato osservando le persone vere intorno a me: cerco sempre di disegnare la verità, senza scivolare nella maniera.", author:"Katsuhiro Otomo" },
  { text:"Sono gli emarginati, quelli che non trovano posto da nessuna parte, i personaggi più interessanti da disegnare.", author:"Katsuhiro Otomo" },
  { text:"Il lavoro del fumettista è solitario: un fumetto, a differenza di un film, non lo puoi disegnare in tanti.", author:"Katsuhiro Otomo" },
  { text:"Certe imperfezioni le lascio apposta: è quasi un rito, ci metto dentro un incantesimo.", author:"Katsuhiro Otomo" },
  { text:"I posti più affollati e disordinati sono quelli che amo di più: sono onesti, perché non hanno nulla di artificiale.", author:"Katsuhiro Otomo" },
  // ── Satoshi Kon ──
  { text:"Nelle mie sceneggiature so sempre distinguere realtà e illusione: è il pubblico, poi, a doverle confondere.", author:"Satoshi Kon" },
  { text:"Non parto mai con un obiettivo preciso: voglio superare la mia stessa immaginazione e sorprendere prima di tutto me stesso.", author:"Satoshi Kon" },
  { text:"Le immagini finali sono sempre quelle che avevo visualizzato fin dall'inizio: vengo dalla pittura, penso già per disegni.", author:"Satoshi Kon" },
  { text:"Uno storyboard si costruisce tavola per tavola, ossessivamente: è un incubo, ma è l'unico modo che conosco per fare un film.", author:"Satoshi Kon" },
  { text:"Mi interessa il punto esatto in cui la realtà scivola nell'illusione, senza che lo spettatore se ne accorga.", author:"Satoshi Kon" },
  // ── Daisuke Igarashi ──
  { text:"Disegno tutto da solo, senza assistenti: prima la matita, poi il pennino, poi i dettagli — ogni fase ha il suo strumento.", author:"Daisuke Igarashi" },
  { text:"Ho iniziato a disegnare per un bosco di alberi secolari: volevo semplicemente restituire la loro bellezza.", author:"Daisuke Igarashi" },
  { text:"Il movimento del mare, i suoi suoni, ogni sua parte ti risucchia dentro: è quello che cerco di mettere in ogni tavola.", author:"Daisuke Igarashi" },
  { text:"Una singola immagine non basta mai a dire quello che voglio: sono i cambiamenti, il prima e il dopo, che contano davvero.", author:"Daisuke Igarashi" },
  { text:"Ho attraversato il Giappone disegnando ogni paesaggio che incontravo: è così che si allena davvero l'occhio.", author:"Daisuke Igarashi" },
  // ── John Carpenter ──
  { text:"Un film è fatto di pezzi di pellicola incollati insieme secondo un ritmo preciso, come una composizione musicale.", author:"John Carpenter" },
  { text:"Per rendere spaventoso Michael Myers l'ho fatto camminare come un uomo, non come un mostro: il quotidiano fa più paura dell'eccezionale.", author:"John Carpenter" },
  { text:"L'orrore è una lingua universale: tutto ciò che spaventa me, spaventa anche te. Per questo funziona sempre.", author:"John Carpenter" },
  { text:"Le regole del cinema restano le stesse da sempre: campo lungo, primo piano, struttura. Cambia solo la tecnologia intorno.", author:"John Carpenter" },
  { text:"I mostri nei miei film siamo sempre noi, con un cappello diverso: la parte di noi che vuole distruggere.", author:"John Carpenter" },
  // ── Sergio Leone ──
  { text:"Non sono un regista d'azione: sono un regista di gesti e silenzi, un oratore che parla per immagini.", author:"Sergio Leone" },
  { text:"Se dopo dieci minuti lo spettatore ha già capito tutto, ho fallito: cerco sempre la sorpresa, in ogni scena.", author:"Sergio Leone" },
  { text:"Ci sono i registi, e ci sono gli autori. Ho sempre pensato di essere più un autore che un regista.", author:"Sergio Leone" },
  { text:"Un film che parla solo agli intellettuali è come una ciambella senza l'impasto intorno: deve arrivare a tutti, o non è cinema.", author:"Sergio Leone" },
  { text:"I miei primi piani nascono dal circo di quando ero bambino: le espressioni esagerate dicono più di mille parole.", author:"Sergio Leone" },
  // ── Chuck Jones ──
  { text:"Ognuno di noi ha dentro centomila brutti disegni: prima li tiri fuori, prima cominci a disegnare bene.", author:"Chuck Jones" },
  { text:"La commedia è gente strana in situazioni normali; la farsa è gente normale in situazioni strane.", author:"Chuck Jones" },
  { text:"Bugs Bunny è chi vorremmo essere. Daffy Duck è chi siamo davvero.", author:"Chuck Jones" },
  // ── Pablo Picasso ──
  { text:"L'ispirazione esiste, ma deve trovarti al lavoro.", author:"Pablo Picasso" },
  { text:"Io non cerco: trovo.", author:"Pablo Picasso" },
  // ── Gustav Klimt ──
  { text:"Chi vuole sapere qualcosa di me — come artista, l'unica cosa che conti — guardi con attenzione i miei quadri.", author:"Gustav Klimt" },
  // ── Milt Kahl ──
  { text:"Non è che io disegni tanto bene: è che smetto di provarci più tardi degli altri.", author:"Milt Kahl" },
  { text:"In animazione non c'è niente di più difficile che non far fare niente a un personaggio: il movimento è la nostra materia.", author:"Milt Kahl" },
  // ── Glen Keane ──
  { text:"Non disegno perché vedo qualcosa nella testa: disegno per riuscire a vederlo.", author:"Glen Keane" },
  // ── Masamune Shirow ──
  { text:"Disegnare solo storie serie mi lascia cupo, solo commedie mi lascia insoddisfatto: mi servono tutte e due.", author:"Masamune Shirow" },
  { text:"Un terzo dei fumetti sui miei scaffali sono occidentali: i dialoghi non li capisco, guardo i disegni.", author:"Masamune Shirow" },
  // ── Naoki Urasawa ──
  { text:"Su un settimanale devi far venire voglia di girare la pagina: l'ultima vignetta e' tutto.", author:"Naoki Urasawa" },
  // ── Osamu Tezuka ──
  { text:"I fumetti sono una lingua internazionale: attraversano i confini e le generazioni.", author:"Osamu Tezuka" },
  { text:"Il manga è sentimento, resistenza, pathos, amore, meraviglia. Una conclusione non c'è ancora.", author:"Osamu Tezuka" },
];

export function getTodayTip(){
  // Tip deterministico per giorno — cambia ogni giorno ma stabile nella giornata
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(),0,0)) / 86400000);
  return TIPS[dayOfYear % TIPS.length];
}
