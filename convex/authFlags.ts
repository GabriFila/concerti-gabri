/* ──────────────────────────────────────────────────────────────
   Quali modi di entrare sono attivi su questo deployment (PIANO §1.28,
   DECISIONI "Email").

   - Sender di sviluppo: AUTH_DEV_OTP=1 e NON in produzione. Il codice
     finisce in `devOtpOutbox` (convex/devOtp.ts), nessuna email parte.
     In produzione AUTH_DEV_OTP si rifiuta: il sender resta spento.
   - Resend: RESEND_API_KEY ed EMAIL_FROM impostate TUTTE E DUE (§1.28,
     DECISIONI "Email"): la sola chiave, prima di verificare il dominio,
     accenderebbe un bottone i cui invii falliscono tutti. Il default di
     EMAIL_FROM in convex/email.ts è il valore documentato, non un via libera.
   - Precedenza: fuori produzione con AUTH_DEV_OTP=1 vince il sender di
     sviluppo; altrimenti Resend, se è configurato.
   - `emailLogin` è vero solo se uno dei due sender è attivo: è lui che
     accende il plugin emailOTP in convex/auth.ts e il bottone "Entra con
     email" nella UI. `googleLogin`: le credenziali Google ci sono (i
     deployment locali dei worktree non le hanno: lì si entra con l'OTP).
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { PROD_DEPLOYMENT } from "./devtools.ts";
import { publicQuery } from "./lib/builders.ts";

type Env = Record<string, string | undefined>;

/** Le origini del sito di produzione (prima e dopo lo switch del dominio). */
export const SITI_PRODUZIONE = ["https://concerti.gabrifila.me", "https://concerti-gabri.vercel.app"];

/** true sul deployment di produzione (per URL Convex o per SITE_URL). */
export function inProduzione(env: Env = process.env): boolean {
  if ((env.CONVEX_CLOUD_URL ?? "").includes(PROD_DEPLOYMENT)) return true;
  const sito = (env.SITE_URL ?? "").trim().replace(/\/+$/, "").toLowerCase();
  return SITI_PRODUZIONE.includes(sito);
}

export type Sender = "sviluppo" | "resend";

/** Il sender dei codici OTP, o null se l'email è spenta. */
export function senderOtp(env: Env = process.env): Sender | null {
  if (env.AUTH_DEV_OTP === "1" && !inProduzione(env)) return "sviluppo";
  if (env.RESEND_API_KEY && env.EMAIL_FROM?.trim()) return "resend";
  return null;
}

export const emailLoginAttivo = (env: Env = process.env) => senderOtp(env) !== null;
export const googleAttivo = (env: Env = process.env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const get = publicQuery({
  args: {},
  returns: v.object({ emailLogin: v.boolean(), googleLogin: v.boolean() }),
  handler: async () => ({ emailLogin: emailLoginAttivo(), googleLogin: googleAttivo() }),
});
