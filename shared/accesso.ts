/* ──────────────────────────────────────────────────────────────
   Il rifiuto di SIGNUP_ALLOWLIST (convex/auth.ts), uguale per le due
   strade del login e letto dalla UI (src/lib/auth-errori.ts):
   - OTP: 403 con `code` NON_INVITATO;
   - Google: Better Auth non propaga lo stato, rimanda a /accedi con
     `?error=` uguale al MESSAGGIO dell'errore (spazi → "_"). Per questo il
     messaggio è un codice breve e stabile, mai una frase da troncare.
   ────────────────────────────────────────────────────────────── */

export const NON_INVITATO = "non_invitato";

export const MESSAGGIO_INVITO = "Per ora le pagine si aprono solo su invito: questo account non è nell'elenco.";
