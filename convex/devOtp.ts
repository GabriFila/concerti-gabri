/* OTP di sviluppo (PIANO §1.28): il sender di sviluppo scrive il codice in
   `devOtpOutbox`, che i test leggono con `convex run devOtp:latest`. Stub
   con la guardia: T3 lo collega a Better Auth. Mai in produzione. */

import { v } from "convex/values";
import { guardiaSviluppo } from "./devtools.ts";
import { internalMutation, internalQuery } from "./lib/builders.ts";

const TTL = 15 * 60_000;

export const record = internalMutation({
  args: { email: v.string(), otp: v.string(), type: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    guardiaSviluppo();
    await ctx.db.insert("devOtpOutbox", { ...a, createdAt: Date.now() });
    return null;
  },
});

export const latest = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    guardiaSviluppo();
    const righe = await ctx.db.query("devOtpOutbox").withIndex("by_email", q => q.eq("email", email)).collect();
    const r = righe.sort((a, b) => b.createdAt - a.createdAt)[0];
    return r ? { otp: r.otp, type: r.type, createdAt: r.createdAt } : null;
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
