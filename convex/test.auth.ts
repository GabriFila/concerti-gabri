/// <reference types="vite/client" />
/* Login vero nei test Convex: le route di Better Auth (convex/http.ts)
   chiamate con `t.fetch`, l'OTP letto da devOtp:latest come fanno gli e2e.
   Il nome ha due punti: la CLI Convex non lo pubblica. */

import { vi } from "vitest";
import { components, internal } from "./_generated/api";
import type { T } from "./test.setup";

export const SITO = "https://m3.prova.localhost:1355";
const HEADERS = { "content-type": "application/json", origin: SITO };

/** Le variabili che contano per il login: tutte impostate o tolte, mai ereditate dall'ambiente della sessione. */
const NOMI = [
  "SITE_URL", "BETTER_AUTH_TRUSTED_ORIGINS", "BETTER_AUTH_SECRET", "AUTH_DEV_OTP", "CONVEX_CLOUD_URL", "CONVEX_SITE_URL",
  "RESEND_API_KEY", "EMAIL_FROM", "SIGNUP_ALLOWLIST", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
  "OAUTH_PROXY_SECRET", "OAUTH_PROXY_PRODUCTION_URL",
] as const;

/** L'env di un deployment locale di worktree (come scripts/convex-locale.mjs), più `extra`. */
export function envLocale(extra: Partial<Record<(typeof NOMI)[number], string | undefined>> = {}) {
  const env: Record<string, string | undefined> = {
    SITE_URL: SITO,
    BETTER_AUTH_TRUSTED_ORIGINS: SITO,
    BETTER_AUTH_SECRET: "segreto-di-prova-solo-per-vitest-9f3c2a7d41e8b6c0",
    AUTH_DEV_OTP: "1",
    CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
    CONVEX_SITE_URL: "http://127.0.0.1:3211",
    ...extra,
  };
  for (const n of NOMI) vi.stubEnv(n, env[n]);
}

export const post = (t: T, path: string, body: unknown) =>
  t.fetch(`/api/auth${path}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });

/** Chiede un codice di accesso per `email`. */
export const chiediCodice = (t: T, email: string) => post(t, "/email-otp/send-verification-otp", { email, type: "sign-in" });

/** L'ultimo codice del sender di sviluppo per `email`. */
export const ultimoCodice = async (t: T, email: string) => (await t.query(internal.devOtp.latest, { email }))?.otp;

export interface Accesso {
  status: number;
  userId: string;
  sessionId: string;
  token: string;
  as: ReturnType<T["withIdentity"]>;
}

/** Entra con l'OTP di sviluppo (crea l'utente se manca). Lancia se il login non riesce. */
export async function accedi(t: T, email: string): Promise<Accesso> {
  const invio = await chiediCodice(t, email);
  if (invio.status !== 200) throw new Error(`invio del codice: ${invio.status}`);
  const r = await post(t, "/sign-in/email-otp", { email, otp: await ultimoCodice(t, email) });
  if (r.status !== 200) throw new Error(`accesso: ${r.status}`);
  const { token, user } = (await r.json()) as { token: string; user: { id: string } };
  const session = (await t.run(ctx =>
    ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "token", value: token }] }),
  )) as { _id: string };
  return { status: r.status, userId: user.id, sessionId: session._id, token, as: t.withIdentity({ subject: user.id, sessionId: session._id }) };
}

/** I profili di un utente Better Auth. */
export const profiliDi = (t: T, authUserId: string) =>
  t.run(async ctx => (await ctx.db.query("profiles").collect()).filter(p => p.authUserId === authUserId));
