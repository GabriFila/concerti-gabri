/* API key e client OAuth degli agenti (PIANO T7): qui solo gli stub dei
   cron, congelati nel traguardo 2. */

import { v } from "convex/values";
import { internalMutation } from "./lib/builders.ts";

/** Cron (T7): client DCR senza token da più di 24 ore. */
export const cleanupDcrClients = internalMutation({ args: {}, returns: v.null(), handler: async () => null });

/** Cron (T7): token OAuth scaduti. */
export const cleanupExpiredTokens = internalMutation({ args: {}, returns: v.null(), handler: async () => null });
