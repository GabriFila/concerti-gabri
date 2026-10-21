/* ──────────────────────────────────────────────────────────────
   Profili (PIANO §1.19–1.20). T3 aggiunge completeOnboarding e
   setOnboardingStep (onboarding), T4 il validatore del tema per forma.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { nessunInput } from "../shared/schema/campi.ts";
import type { Doc } from "./_generated/dataModel";
import { aggiornaProfiloInput, impostaTemaInput } from "../shared/schema/profile.ts";
import { logActivity, istantanea } from "./lib/activity.ts";
import { internalQuery, ownerMutation, ownerQuery, publicQuery } from "./lib/builders.ts";
import { cambiaHandle, motivoHandle } from "./lib/handles.ts";

/* Handle riservati e disponibilità: convex/lib/handles.ts (una sola strada
   per cambiare handle, usata anche da Annulla). Riesportati qui per chi li
   cerca nel modulo dei profili; T3 li sposta in shared/handles.ts. */
export { HANDLE_RE, HANDLE_RISERVATI, motivoHandle } from "./lib/handles.ts";

export const handleAvailable = publicQuery({
  args: { handle: v.string() },
  returns: v.object({ disponibile: v.boolean(), motivo: v.optional(v.string()) }),
  handler: async (ctx, { handle }: { handle: string }) => {
    const motivo = await motivoHandle(ctx, handle.slice(0, 64));
    return motivo ? { disponibile: false, motivo } : { disponibile: true };
  },
});

const profiloPrivato = (p: Doc<"profiles">) => ({
  id: p._id as string,
  handle: p.handle,
  displayName: p.displayName,
  forma: p.forma,
  status: p.status,
  onboardingStep: p.onboardingStep,
  theme: p.theme,
  layout: p.layout,
  extra: p.extra,
});

export const get = ownerQuery({
  catalogOp: "get_profile",
  input: nessunInput,
  handler: async (_ctx, owner) => profiloPrivato(owner.profile),
});

export const update = ownerMutation({
  catalogOp: "update_profile",
  input: aggiornaProfiloInput,
  handler: async (ctx, owner, input) => {
    const p = owner.profile;
    const patch: Partial<Doc<"profiles">> = {};
    if (input.displayName !== undefined) patch.displayName = input.displayName;
    if (input.forma !== undefined) patch.forma = input.forma;
    const nuovoHandle = input.handle !== undefined && input.handle !== p.handle ? input.handle : undefined;
    if (!Object.keys(patch).length && !nuovoHandle) return { ok: true as const };
    // il vecchio handle diventa un alias (301) e resta riservato
    if (nuovoHandle) await cambiaHandle(ctx, p, nuovoHandle);
    if (Object.keys(patch).length) await ctx.db.patch(p._id, patch);
    await logActivity(ctx, owner, {
      op: "update", table: "profiles", docId: p._id, summary: "profilo aggiornato",
      before: istantanea(p), after: istantanea(await ctx.db.get(p._id)),
    });
    return { ok: true as const };
  },
});

export const setTheme = ownerMutation({
  catalogOp: "set_theme",
  input: impostaTemaInput,
  handler: async (ctx, owner, input) => {
    const p = owner.profile;
    const patch: Partial<Doc<"profiles">> = {};
    if (input.theme) patch.theme = input.theme;
    if (input.layout) patch.layout = input.layout;
    if (!Object.keys(patch).length) return { ok: true as const };
    await ctx.db.patch(p._id, patch);
    await logActivity(ctx, owner, {
      op: "update", table: "profiles", docId: p._id, summary: "stile della pagina aggiornato",
      before: istantanea(p), after: istantanea(await ctx.db.get(p._id)),
    });
    return { ok: true as const };
  },
});

/** Per le action del proprietario (che non hanno ctx.db). */
export const byAuthUser = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }) =>
    await ctx.db.query("profiles").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique(),
});
