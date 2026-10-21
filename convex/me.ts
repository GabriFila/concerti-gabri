/* ──────────────────────────────────────────────────────────────
   Chi sta guardando (PIANO §5.2 "Query del proprietario", §6 guard).

   `me.profile`: il profilo dell'utente della sessione, oppure `null` per
   un visitatore anonimo o un utente senza profilo. Non lancia mai: la UI
   (useViewer() in src/lib/viewer.ts, dal traguardo 3) e i guard di
   /benvenuto e /modifica la leggono anche da anonimi. È una publicQuery con
   `returns` esplicito perché non prende argomenti e restituisce solo il
   profilo di chi chiama (mai `authUserId`); l'identità passa da
   lib/owner.ts `utenteDellaSessione`, che il traguardo 3 collega a Better
   Auth senza toccare questo file.

   Gli altri `me.*` di §5.2 sono già funzioni del catalogo o hanno un
   proprietario: me.departures = departures.list (nome e stato, mai
   l'indirizzo), me.people = people.list, me.activity = activity.list,
   me.agents → convex/agents.ts (T7), me.departureAddresses →
   convex/departures.ts, dashboardOnly (T5), me.chatThreads →
   convex/chat.ts (T6).
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { PASSI_ONBOARDING } from "../shared/schema/profile.ts";
import { publicQuery } from "./lib/builders.ts";
import { profileOfUser, utenteDellaSessione } from "./lib/owner.ts";

const passo = v.union(...PASSI_ONBOARDING.map(p => v.literal(p)));

export const profile = publicQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      profileId: v.string(),
      handle: v.union(v.string(), v.null()),
      displayName: v.union(v.string(), v.null()),
      status: v.union(v.literal("onboarding"), v.literal("active")),
      onboardingStep: passo,
    }),
  ),
  handler: async ctx => {
    const userId = await utenteDellaSessione(ctx);
    if (!userId) return null;
    const p = await profileOfUser(ctx, userId);
    if (!p) return null;
    return {
      profileId: p._id as string,
      handle: p.handle ?? null,
      displayName: p.displayName ?? null,
      status: p.status,
      onboardingStep: p.onboardingStep,
    };
  },
});
