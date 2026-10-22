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
import type { MutationCtx } from "./_generated/server";
import { isValidThreadId } from "../shared/chat/ids.ts";
import { internalMutation } from "./lib/builders.ts";
import { parseInput } from "./lib/errors.ts";
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
