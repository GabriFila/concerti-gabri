/* Quali modi di entrare mostra PannelloAccesso, da `authFlags.get`
   (convex/authFlags.ts). Puro: lo prova flags.test.ts.

   "Entra con email" compare solo se il codice arriva a una persona, cioè
   col sender vero (Resend, `emailReale`). Il sender di sviluppo (dev,
   preview, deployment locali) scrive il codice in `devOtpOutbox`, che
   nessuna persona legge: lì il bottone resterebbe un vicolo cieco. Fanno
   eccezione i build e2e (VITE_E2E=1, mai su Vercel), dove
   e2e/login-otp.spec.ts prova la UI leggendo il codice con devOtp:latest.
   Il login via API col codice di sviluppo (e2e/helpers/auth.ts) non passa
   di qui e resta com'è. */

export interface FlagsAccesso {
  /** Il plugin email OTP è acceso (un sender qualunque). */
  emailLogin: boolean;
  /** Il sender è Resend: il codice arriva davvero nella casella. */
  emailReale: boolean;
  googleLogin: boolean;
}

const BUILD_E2E = import.meta.env.VITE_E2E === "1";

/** true se PannelloAccesso deve offrire "Entra con email". */
export function emailVisibile(flags: FlagsAccesso, e2e: boolean = BUILD_E2E): boolean {
  return flags.emailLogin && (flags.emailReale || e2e);
}
