/* ──────────────────────────────────────────────────────────────
   Stile della pagina (#stile, T5; PIANO §1.34, §1.35, §5.8).

   Tema e layout si salvano con profiles.setTheme (set_theme del catalogo,
   così anche gli agenti); qui stanno le parti della dashboard:
   - `normalizzaLayout`: il layout di §1.35 vale solo per le sezioni de
     "I dati" (`SECTIONS`, id `sec-*` fissi): una sezione sconosciuta è un
     errore con l'elenco di quelle valide (mai l'id ricevuto), i doppioni
     spariscono. "Sul palco" resta fisso. profiles.setTheme lo applica;
   - `consumeThemeGeneration`: il "tema da descrizione" lo genera la server
     function di #stile (src/modifica/temaDaDescrizione.ts), che prima di
     chiamare Gemini consuma qui, con la sessione del proprietario, il
     limite per profilo (`themeFromDescription`, 10 al giorno) e quello
     globale (`themeGlobalDay`, 50 al giorno);
   - `setExtra`: credito del footer e link (§1.34), solo dalla dashboard e
     solo per il profilo `gabrifila`, anche dopo un cambio di handle
     (DECISIONI, risposta 1);
   - `azzeraLimitiTemaPerTest`: solo e2e (stile.spec), sui deployment di
     sviluppo: rimette a zero i due limiti del tema da descrizione.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import type { z } from "zod";
import { SECTION_IDS } from "../shared/sections.ts";
import { nessunInput } from "../shared/schema/campi.ts";
import { extraProfiloInput } from "../shared/schema/dashboard.ts";
import type { layout } from "../shared/schema/profile.ts";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { guardiaSviluppo } from "./devtools.ts";
import { istantanea, logActivity } from "./lib/activity.ts";
import { internalMutation, ownerMutation } from "./lib/builders.ts";
import { errore } from "./lib/errors.ts";
import { rateLimiter } from "./rateLimits.ts";
import { HANDLE_SEED } from "./seed.ts";

type Layout = z.output<typeof layout>;

const VALIDE = new Set<string>(SECTION_IDS);

/** Il layout con i soli id di "I dati", senza doppioni; lancia su una sezione sconosciuta. */
export function normalizzaLayout(l: Layout): Layout {
  const ignote = [...l.ordine, ...l.nascoste, ...Object.keys(l.titoli)].filter(id => !VALIDE.has(id));
  if (ignote.length) {
    throw errore("input_non_valido", `layout: sezione sconosciuta; sezioni valide: ${SECTION_IDS.join(", ")}`, { campo: "layout" });
  }
  return {
    ordine: [...new Set(l.ordine)],
    nascoste: [...new Set(l.nascoste)],
    titoli: Object.fromEntries(Object.entries(l.titoli).map(([id, t]) => [id, t.trim()])),
  };
}

export const consumeThemeGeneration = ownerMutation({
  dashboardOnly: "la chiama solo la server function di #stile",
  input: nessunInput,
  handler: async (ctx, owner) => {
    const p = await rateLimiter.limit(ctx, "themeFromDescription", { key: owner.profile._id });
    if (!p.ok) throw errore("limite_superato", "hai già generato 10 temi oggi: riprova domani", { retryAfter: Math.ceil(p.retryAfter / 1000) });
    // se il globale è esaurito l'errore annulla anche il consumo del profilo (stessa transazione)
    const g = await rateLimiter.limit(ctx, "themeGlobalDay");
    if (!g.ok) throw errore("limite_superato", "il tema da descrizione è in pausa per oggi: riprova domani", { retryAfter: Math.ceil(g.retryAfter / 1000) });
    return { ok: true as const };
  },
});

/** Il profilo `gabrifila`: ha quell'handle, oppure l'ha avuto (alias). */
async function eGabrifila(ctx: QueryCtx, p: Doc<"profiles">): Promise<boolean> {
  if (p.handle === HANDLE_SEED) return true;
  const alias = await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", HANDLE_SEED)).first();
  return alias?.profileId === p._id;
}

export const setExtra = ownerMutation({
  dashboardOnly: "contenuti personali del footer (§1.34): solo dalla dashboard",
  input: extraProfiloInput,
  handler: async (ctx, owner, input) => {
    const p = owner.profile;
    if (!(await eGabrifila(ctx, p))) throw errore("input_non_valido", "il credito e il link del footer ci sono solo sulla pagina di gabrifila", { campo: "extra" });
    const extra: Doc<"profiles">["extra"] = { ...p.extra };
    if (input.creditoFooter !== undefined) extra.creditoFooter = input.creditoFooter || undefined;
    if (input.linkTappi !== undefined) extra.linkTappi = input.linkTappi ?? undefined;
    const pulito = Object.fromEntries(Object.entries(extra).filter(([, x]) => x !== undefined)) as Doc<"profiles">["extra"];
    if (JSON.stringify(pulito) === JSON.stringify(p.extra)) return { ok: true as const };
    await ctx.db.patch(p._id, { extra: pulito });
    await logActivity(ctx, owner, {
      op: "update", table: "profiles", docId: p._id, summary: "footer della pagina aggiornato",
      before: istantanea(p), after: istantanea(await ctx.db.get(p._id)),
    });
    return { ok: true as const };
  },
});

/** e2e/stile.spec.ts: i limiti del tema da descrizione da capo (profilo e globale), solo in sviluppo. */
export const azzeraLimitiTemaPerTest = internalMutation({
  args: { handle: v.string() },
  returns: v.null(),
  handler: async (ctx, { handle }) => {
    guardiaSviluppo();
    const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", handle)).first();
    if (p) await rateLimiter.reset(ctx, "themeFromDescription", { key: p._id });
    await rateLimiter.reset(ctx, "themeGlobalDay");
    return null;
  },
});
