/* ──────────────────────────────────────────────────────────────
   OTP di sviluppo (PIANO §1.28): il sender di sviluppo scrive il codice in
   `devOtpOutbox` invece di mandare un'email; i test e2e lo leggono con
   `convex run devOtp:latest '{"email":"…"}' --env-file .env.worktree`.

   Tutte interne (solo `convex run` con la chiave admin, cioè le macchine
   di Gabri) e tutte con la guardia: rifiutano sul deployment di
   produzione (URL Convex o SITE_URL di produzione) e senza AUTH_DEV_OTP=1.
   convex/auth.ts chiama `record` solo se authFlags.senderOtp() è
   "sviluppo", che ha la stessa regola: in produzione non ci arriva mai.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { chiaveOtpEmail } from "./auth.ts";
import { inProduzione } from "./authFlags.ts";
import { guardiaSviluppo } from "./devtools.ts";
import { internalMutation, internalQuery } from "./lib/builders.ts";
import { rateLimiter } from "./rateLimits.ts";

const TTL = 15 * 60_000;

/** La guardia di devtools più il controllo su SITE_URL. */
export function guardiaOtp(env: Record<string, string | undefined> = process.env) {
  guardiaSviluppo(env);
  if (inProduzione(env)) throw new Error("devOtp: rifiutato sul sito di produzione");
}

const norm = (email: string) => email.trim().toLowerCase();

export const record = internalMutation({
  args: { email: v.string(), otp: v.string(), type: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    guardiaOtp();
    await ctx.db.insert("devOtpOutbox", { email: norm(a.email), otp: a.otp, type: a.type, createdAt: Date.now() });
    return null;
  },
});

export const latest = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    guardiaOtp();
    const righe = await ctx.db.query("devOtpOutbox").withIndex("by_email", q => q.eq("email", norm(email))).collect();
    const r = righe.sort((a, b) => b.createdAt - a.createdAt)[0];
    return r ? { otp: r.otp, type: r.type, createdAt: r.createdAt } : null;
  },
});

/**
 * Azzera i limiti d'invio dei codici (`otpSendGlobal` e, con `email`,
 * `otpSendEmail` di quell'email). Solo per gli e2e, che entrano molte volte
 * in un'ora (e2e/helpers/auth.ts lo chiama dopo un 429): i limiti veri
 * restano coperti da convex/email.test.ts.
 */
export const azzeraLimiti = internalMutation({
  args: { email: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    guardiaOtp();
    await rateLimiter.reset(ctx, "otpSendGlobal");
    if (email) await rateLimiter.reset(ctx, "otpSendEmail", { key: await chiaveOtpEmail(email) });
    return null;
  },
});

/** Cron: codici più vecchi di 15 minuti. */
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async ctx => {
    for (const r of await ctx.db.query("devOtpOutbox").take(500)) if (r.createdAt < Date.now() - TTL) await ctx.db.delete(r._id);
    return null;
  },
});
