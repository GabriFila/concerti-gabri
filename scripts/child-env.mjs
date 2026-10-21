/* ──────────────────────────────────────────────────────────────
   L'ambiente dei processi figli degli script di test (PIANO §4.2).

   Le sessioni su t3node possono avere nell'ambiente anche chiavi che a un
   test locale non servono mai: le chiavi di produzione, le deploy key di
   Convex, i segreti di Better Auth e di Google. Gli script che lanciano
   Playwright, server o build non le passano oltre (è la stessa pulizia che
   `wt exec` farà dal traguardo 2). Si guardano solo i NOMI: nessun valore
   si legge o si stampa.

     senzaSegreti(env, tieni)  toglie ogni nome che sembra un segreto
                               (SECRET, TOKEN, *_KEY, PASSWORD, …) e sempre
                               *_PROD, CONVEX_DEPLOY_KEY*, BETTER_AUTH_SECRET*;
                               `tieni` elenca i pochi segreti che servono
                               davvero a quel figlio (mai uno di produzione).
   ────────────────────────────────────────────────────────────── */

// mai, nemmeno se un chiamante li mettesse in `tieni`
const PRODUZIONE = [/_PROD$/i, /^CONVEX_DEPLOY_KEY/i, /^BETTER_AUTH_SECRET/i];
const SEGRETI = [/SECRET/i, /TOKEN/i, /_KEY$/i, /_KEY_/i, /^KEY$/i, /PASSWORD/i, /PASSWD/i, /PRIVATE/i, /CREDENTIAL/i];

/** Segreti usati dai test locali: la chiave di Gemini (spec @gemini, server Start). */
export const GEMINI = ["GEMINI_API_KEY", "GOOGLE_API_KEY"];

/** L'ambiente senza segreti, salvo i nomi in `tieni` (mai quelli di produzione). */
export function senzaSegreti(env = process.env, tieni = []) {
  const keep = new Set(tieni);
  return Object.fromEntries(
    Object.entries(env).filter(([name, value]) =>
      value !== undefined &&
      !PRODUZIONE.some(p => p.test(name)) &&
      (keep.has(name) || !SEGRETI.some(p => p.test(name)))),
  );
}
