/* ──────────────────────────────────────────────────────────────
   Id "brandizzati" in Zod puro (PIANO §5.3): niente convex/* sotto
   shared/. Un id è una stringa con il nome della tabella nei metadati
   (`convexId`); solo dentro convex/ (convex/lib/zodConvex.ts) diventa
   `v.id(<tabella>)`. Il tipo TS coincide con `Id<T>` di Convex
   (`string & { __tableName: T }`), quindi i due si assegnano a vicenda.
   ────────────────────────────────────────────────────────────── */

import { z } from "zod";

export type TableName =
  | "profiles" | "handleAliases" | "people" | "gifters" | "wishlist"
  | "departures" | "departureSecrets" | "geocodeDrafts" | "kmPairs"
  | "venues" | "cities" | "venueSearchCache"
  | "entries" | "activity" | "chatThreads" | "devOtpOutbox"
  | "_storage";

/** Strutturalmente identico a `GenericId<T>` di Convex. */
export type IdDi<T extends string> = string & { __tableName: T };

/** Uno schema Zod per l'id di una tabella. */
export function idDi<T extends TableName>(table: T) {
  return z.string().min(1).max(128).meta({ convexId: table }) as unknown as z.ZodType<IdDi<T>, string>;
}

/** La tabella di un id, se lo schema ne è uno (anche con descrizione). */
export function tabellaDiId(schema: z.ZodType): string | undefined {
  const meta = (schema as { meta?: () => Record<string, unknown> | undefined }).meta?.();
  return typeof meta?.convexId === "string" ? meta.convexId : undefined;
}
