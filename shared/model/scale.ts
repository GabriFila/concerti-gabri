/* Le scale ordinali per concerto salgono tutte col VANTAGGIO, così "più
   grande = meglio" vale ovunque e nessun asse va mai rovesciato: `voto` 1–5,
   `canzoniNote` 1–5 e `vicinanza` 1–6 dove 6 = Transenna (il più vicino) e
   1 = Anello alto. Queste etichette sono la fonte unica: le leggono la UI, i
   filtri e gli strumenti dell'Oracolo. */

export const CANZONI_NOTE_LABELS = { 1: "Nessuna", 2: "Poche", 3: "Circa metà", 4: "Molte", 5: "Tutte" } as const;

export const VICINANZA_LABELS = { 6: "Transenna", 5: "Sottopalco", 4: "Centro", 3: "Fondo", 2: "Tribuna", 1: "Anello alto" } as const;

// viste tipizzate delle mappe (const-asserted), così le ricerche numeriche compilano
export const VIC_LABELS: Record<number, string> = VICINANZA_LABELS;
export const CN_LABELS: Record<number, string> = CANZONI_NOTE_LABELS;

/* Ordine di lettura della vicinanza, dal posto migliore al peggiore: la scala è
   al contrario del numero, quindi liste e assi partono dal 6 (chip dei filtri,
   card "Quanto sono vicino", tacche del grafico a dispersione). */
export const VIC_ORDER = [6, 5, 4, 3, 2, 1];
export const CN_ORDER = [1, 2, 3, 4, 5];

/** "1 Nessuna, 2 Poche, …": l'elenco delle canzoni note per le descrizioni degli strumenti. */
export const canzoniNoteScale = (): string =>
  CN_ORDER.map(v => `${v} ${CN_LABELS[v]}`).join(", ");

/** "6 Transenna, 5 Sottopalco, …": la vicinanza in ordine di lettura. */
export const vicinanzaScale = (): string =>
  VIC_ORDER.map(v => `${v} ${VIC_LABELS[v]}`).join(", ");
