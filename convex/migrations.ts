/* Migrazione dello storico dell'Oracolo da Upstash (PIANO T9): interna e
   idempotente; in Fase 3 non si esegue. Stub fino al traguardo 9. */

import { v } from "convex/values";
import { internalMutation } from "./lib/builders.ts";

export const importChatThreads = internalMutation({
  args: { threads: v.array(v.any()) },
  handler: async () => {
    throw new Error("migrations:importChatThreads arriva con il traguardo 9");
  },
});
