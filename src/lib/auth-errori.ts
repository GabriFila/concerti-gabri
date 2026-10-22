/* ──────────────────────────────────────────────────────────────
   Gli errori del login in italiano (riesportati da auth-client.ts).
   Modulo puro, senza il client di Better Auth: si prova da solo.

   Il rifiuto di SIGNUP_ALLOWLIST arriva con lo stesso codice dalle due
   strade (shared/accesso.ts): `code` NON_INVITATO nel 403 dell'OTP e
   `?error=non_invitato` sul ritorno da Google.
   ────────────────────────────────────────────────────────────── */

import { MESSAGGIO_INVITO, NON_INVITATO } from "../../shared/accesso.ts";

export type ErroreAuth = { status?: number; code?: string; message?: string } | null | undefined;

/** Il messaggio in italiano di un errore di Better Auth (mai l'email o il codice). */
export function messaggioErroreAuth(e: ErroreAuth): string {
  switch (e?.code) {
    case "INVALID_OTP":
      return "Codice sbagliato: controlla e riprova.";
    case "OTP_EXPIRED":
      return "Codice scaduto: chiedine uno nuovo.";
    case "TOO_MANY_ATTEMPTS":
      return "Troppi tentativi con questo codice: chiedine uno nuovo.";
    case "INVALID_EMAIL":
      return "Questa email non sembra valida.";
  }
  if (e?.code === NON_INVITATO.toUpperCase() || e?.message === NON_INVITATO) return MESSAGGIO_INVITO;
  // 429 (troppi codici) arriva già in italiano dal server (convex/auth.ts)
  if (e?.status === 429) return e.message || "Troppe richieste: riprova tra qualche minuto.";
  return "Qualcosa non ha funzionato: riprova tra poco.";
}

/** Errori del ritorno da Google (`?error=` sull'URL di errore di /accedi). */
export function messaggioErroreGoogle(code: string): string {
  if (code === NON_INVITATO) return MESSAGGIO_INVITO;
  if (code === "access_denied") return "Accesso con Google annullato.";
  return "L'accesso con Google non è riuscito: riprova.";
}
