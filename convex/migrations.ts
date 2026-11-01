/* ──────────────────────────────────────────────────────────────
   Storico dell'Oracolo da Upstash a Convex (PIANO §1.26, traguardo 9).
   La chiama solo scripts/migra-storico-chat.mjs con `--apply --deployment
   <nome>`, a lotti; in Fase 3 non si esegue (solo il dry-run dello script).

   Interna e idempotente: ogni conversazione si cerca per `threadId`.
   - assente → si inserisce sul profilo `gabrifila`, `visibility: "pubblica"`;
   - già su `gabrifila` e pubblica:
     - stesso `updatedAt`, oppure più recente in Convex (continuata sul sito
       nuovo) → invariata;
     - più recente su Upstash (scritta su Netlify prima del cambio DNS) → si
       aggiornano messaggi, titolo e scadenza. Autore e hash della chiave
       si aggiornano solo se arrivano: un thread già rivendicato in Convex
       non torna mai libero;
   - di un altro profilo, o privata → conflitto: non si tocca.

   La chiave di scrittura arriva già come SHA-256 (hex): quella in chiaro non
   lascia mai lo script. Senza chiave il thread resta rivendicabile dal primo
   turno che ne porta una. L'IP non arriva mai: l'input è stretto, un campo
   in più (`ip`, `profileId`, `visibility`…) fa fallire il lotto.

   Argomenti larghi e validazione Zod nell'handler (PIANO §1.25): un errore
   non ripete mai messaggi o hash ricevuti.
   ────────────────────────────────────────────────────────────── */

import { v } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isValidThreadId } from "../shared/chat/ids.ts";
import { internalMutation } from "./lib/builders.ts";
import { parseInput } from "./lib/errors.ts";
import { profiliDelleCoppie, spostaCoppieVenue } from "./lib/km.ts";
import { venuePerNome } from "./lib/refs.ts";
import { HANDLE_SEED } from "./seed.ts";

const conversazione = z.strictObject({
  threadId: z.string().refine(isValidThreadId, "id del thread non valido"),
  title: z.string().min(1).max(200),
  author: z.string().min(1).max(200).optional(),
  writeKeyHash: z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 in esadecimale").optional(),
  messages: z.array(z.any()).min(1),
  updatedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

/** L'input di `importChatThreads`: quello che produce lo script (`converti`). */
export const importChatThreadsInput = z.strictObject({ threads: z.array(conversazione).max(500) });

/** Il profilo `gabrifila`, anche se rinominato (l'handle è allora un suo alias, come in seed.ts). */
async function profiloGabrifila(ctx: MutationCtx) {
  const p = await ctx.db.query("profiles").withIndex("by_handle", q => q.eq("handle", HANDLE_SEED)).first();
  if (p) return p;
  const alias = await ctx.db.query("handleAliases").withIndex("by_handle", q => q.eq("handle", HANDLE_SEED)).first();
  const daAlias = alias && (await ctx.db.get(alias.profileId));
  if (!daAlias) throw new Error("migrazione: manca il profilo gabrifila (prima seed:ensure)");
  return daAlias;
}

export const importChatThreads = internalMutation({
  args: { threads: v.array(v.any()) },
  returns: v.object({ inserite: v.number(), aggiornate: v.number(), invariate: v.number(), conflitti: v.number() }),
  handler: async (ctx, args) => {
    const { threads } = parseInput(importChatThreadsInput, args);
    const profilo = await profiloGabrifila(ctx);
    const esito = { inserite: 0, aggiornate: 0, invariate: 0, conflitti: 0 };
    for (const t of threads) {
      const facoltativi = { ...(t.author && { author: t.author }), ...(t.writeKeyHash && { writeKeyHash: t.writeKeyHash }) };
      const campi = { title: t.title, messages: t.messages, updatedAt: t.updatedAt, expiresAt: t.expiresAt, ...facoltativi };
      const c = await ctx.db.query("chatThreads").withIndex("by_threadId", q => q.eq("threadId", t.threadId)).first();
      if (!c) {
        await ctx.db.insert("chatThreads", { profileId: profilo._id, threadId: t.threadId, visibility: "pubblica", ...campi });
        esito.inserite++;
      } else if (c.profileId !== profilo._id || c.visibility !== "pubblica") {
        esito.conflitti++;
      } else if (c.updatedAt >= t.updatedAt) {
        esito.invariate++;
      } else {
        await ctx.db.patch(c._id, campi);
        esito.aggiornate++;
      }
    }
    return esito;
  },
});

/* ──────────────────────────────────────────────────────────────
   Venue per profilo (DECISIONI «Venue per profilo», 2026-11-01): ogni
   venue senza `profileId` va al profilo che la usa (concerti, coppie km,
   chi l'ha creata), quello con più concerti; gli altri profili che la
   usano ne ricevono una copia (o la loro omonima, se c'è già), e i loro
   concerti, le coppie km (stesso km: nessuna estrazione nuova) e le
   istantanee del registro (per Annulla) passano alla copia. Una venue che
   non usa nessuno resta orfana: nessun profilo la vede.
   Idempotente, a lotti che si riprogrammano da soli; si lancia una volta
   per deployment: `npx convex run migrations:venuePerProfilo '{"cursor":null}'`.
   ────────────────────────────────────────────────────────────── */

const LOTTO_VENUE = 25;

/** Le istantanee del registro di un profilo che citano la venue `da` passano ad `a`. */
async function rimappaRegistro(ctx: MutationCtx, profileId: Id<"profiles">, da: Id<"venues">, a: Id<"venues">) {
  const ago = JSON.stringify(da);
  for (const voce of await ctx.db.query("activity").withIndex("by_profile_at", q => q.eq("profileId", profileId)).collect()) {
    const patch: { before?: unknown; after?: unknown } = {};
    for (const k of ["before", "after"] as const) {
      const json = voce[k] === undefined ? undefined : JSON.stringify(voce[k]);
      if (json?.includes(ago)) patch[k] = JSON.parse(json.split(ago).join(JSON.stringify(a)));
    }
    if (Object.keys(patch).length) await ctx.db.patch(voce._id, patch);
  }
}

export const venuePerProfilo = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ assegnate: v.number(), copiate: v.number(), orfane: v.number(), finito: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const pagina = await ctx.db.query("venues").paginate({ cursor, numItems: LOTTO_VENUE });
    const esito = { assegnate: 0, copiate: 0, orfane: 0 };
    for (const ven of pagina.page) {
      if (ven.profileId) continue;
      const concerti = await ctx.db.query("entries").withIndex("by_venue", q => q.eq("venueId", ven._id)).collect();
      const conta = new Map<Id<"profiles">, number>();
      for (const e of concerti) conta.set(e.profileId, (conta.get(e.profileId) ?? 0) + 1);
      for (const p of await profiliDelleCoppie(ctx, ven._id)) if (!conta.has(p)) conta.set(p, 0);
      if (ven.createdBy && !conta.has(ven.createdBy) && (await ctx.db.get(ven.createdBy))) conta.set(ven.createdBy, 0);
      // prima chi ha più concerti; a parità chi l'ha creata
      const profili = [...conta.entries()]
        .sort((a, b) => b[1] - a[1] || Number(b[0] === ven.createdBy) - Number(a[0] === ven.createdBy))
        .map(([p]) => p);
      if (!profili.length) {
        esito.orfane++;
        continue;
      }
      let assegnata = false;
      for (const p of profili) {
        const omonima = await venuePerNome(ctx, p, ven.name, ven.city);
        if (!omonima && !assegnata) {
          await ctx.db.patch(ven._id, { profileId: p });
          assegnata = true;
          esito.assegnate++;
          continue;
        }
        let a = omonima?._id;
        if (!a) {
          const { _id, _creationTime, ...campi } = ven;
          void _id;
          void _creationTime;
          a = await ctx.db.insert("venues", { ...campi, profileId: p, createdBy: ven.createdBy === p ? p : undefined });
          if (ven.lng === undefined && ven.posizione === "attesa") await ctx.scheduler.runAfter(0, internal.geo.posizioneVenue, { venueId: a, tentativo: 0 });
        }
        for (const e of concerti) if (e.profileId === p) await ctx.db.patch(e._id, { venueId: a });
        await spostaCoppieVenue(ctx, p, ven._id, a);
        await rimappaRegistro(ctx, p, ven._id, a);
        esito.copiate++;
      }
      // tutti avevano già la loro omonima: questa non la usa più nessuno
      if (!assegnata) await ctx.db.delete(ven._id);
    }
    if (!pagina.isDone) await ctx.scheduler.runAfter(0, internal.migrations.venuePerProfilo, { cursor: pagina.continueCursor });
    return { ...esito, finito: pagina.isDone };
  },
});
