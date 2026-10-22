/* ──────────────────────────────────────────────────────────────
   Handle delle pagine (PIANO traguardo 3, §1.20, §6 "Segmenti riservati").

   Un handle è il primo segmento dell'URL (`/<handle>`), quindi non può
   coincidere con nessuna rotta dell'app: shared/handles.test.ts verifica
   che ogni segmento di primo livello del route tree sia qui dentro e che
   sotto `$handle` ci siano solo le sottopagine di SOTTOPAGINE_HANDLE.

   Puro: lo usano il form di /benvenuto (validazione dal vivo) e Convex
   (convex/lib/handles.ts, che aggiunge profili e alias presi).
   `gabrifila` è riservato: solo il seed lo scavalca (scrive il profilo
   direttamente, senza passare da qui).
   ────────────────────────────────────────────────────────────── */

export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export const HANDLE_RISERVATI: ReadonlySet<string> = new Set([
  // SPEC §3
  "dati", "benvenuto", "privacy", "modifica", "api", "mcp", "ingest", "assets", "og", "login",
  // PIANO traguardo 3
  "accedi", "autorizza", "esci", "logout", "well-known", "static", "public", "admin", "account",
  "impostazioni", "robots", "sitemap", "manifest", "www", "app", "aiuto", "gabrifila",
]);

/** Le sole sottopagine di `/<handle>` (oltre alla pagina stessa). */
export const SOTTOPAGINE_HANDLE = ["dati", "modifica", "manifest.webmanifest"] as const;

/** Come lo scrive la persona → come si salva (minuscole, senza spazi ai bordi). */
export const normalizzaHandle = (s: string) => s.trim().toLowerCase();

/** Perché un handle non va bene già dal formato (o null se va bene). Senza database: prese e alias le controlla Convex. */
export function motivoFormatoHandle(handle: string): "formato non valido" | "riservato" | null {
  if (!HANDLE_RE.test(handle)) return "formato non valido";
  if (HANDLE_RISERVATI.has(handle)) return "riservato";
  return null;
}

/** Il messaggio per la UI di un motivo (di formato o di Convex). */
export function messaggioHandle(motivo: string): string {
  switch (motivo) {
    case "formato non valido":
      return "Da 3 a 30 caratteri: lettere minuscole, numeri e trattini (non all'inizio né alla fine).";
    case "riservato":
      return "Questo indirizzo è riservato al sito: scegline un altro.";
    case "già preso":
      return "Questo indirizzo è già preso: scegline un altro.";
    default:
      return "Questo indirizzo non è disponibile.";
  }
}
