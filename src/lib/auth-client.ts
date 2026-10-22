/* ──────────────────────────────────────────────────────────────
   Client di Better Auth (contratto di ondata, proprietario: corsia 3).
   Le altre corsie usano `esci()`; le pagine di accesso anche il resto.

   Parla con /api/auth/* della NOSTRA origine (routes/api/auth/$.ts lo
   inoltra al sito Convex): il cookie di sessione resta sul nostro dominio.
   Dopo login e logout si ricarica la pagina per intero (PIANO §1.5): il
   client Convex nasce con `expectAuth` deciso dall'SSR (<html data-auth>).
   ────────────────────────────────────────────────────────────── */

import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { messaggioErroreAuth, messaggioErroreGoogle } from "./auth-errori.ts";
import { nextSicuro } from "./auth-next.ts";

export { messaggioErroreAuth, messaggioErroreGoogle, nextSicuro };

export const authClient = createAuthClient({
  plugins: [convexClient(), emailOTPClient()],
});

/** Ricarica per intero verso `dove` (stessa origine). */
function vaiA(dove: string) {
  window.location.assign(nextSicuro(dove, "/"));
}

/** Esce e ricarica la pagina per intero (§1.39). `verso`: dove andare invece di ricaricare questa. */
export async function esci(verso?: string): Promise<void> {
  await authClient.signOut();
  if (verso) vaiA(verso);
  else window.location.reload();
}

/* ── accesso ──────────────────────────────────────────────────── */

/** Chiede il codice per `email`. null = inviato, altrimenti il messaggio d'errore. */
export async function inviaCodice(email: string): Promise<string | null> {
  const { error } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: "sign-in" });
  return error ? messaggioErroreAuth(error) : null;
}

/** Entra col codice; se va bene ricarica verso `next` (la pagina se ne va). Altrimenti il messaggio d'errore. */
export async function entraConCodice(email: string, otp: string, next: string): Promise<string | null> {
  const { error } = await authClient.signIn.emailOtp({ email: email.trim(), otp: otp.trim() });
  if (error) return messaggioErroreAuth(error);
  vaiA(next);
  return null;
}

/** Entra con Google: il browser va a Google e torna su `next` (gli errori tornano su /accedi). */
export async function entraConGoogle(next: string): Promise<string | null> {
  const dove = nextSicuro(next);
  const { error } = await authClient.signIn.social({
    provider: "google",
    callbackURL: dove,
    errorCallbackURL: `/accedi?next=${encodeURIComponent(dove)}`,
  });
  return error ? messaggioErroreAuth(error) : null;
}
