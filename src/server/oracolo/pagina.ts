/* ──────────────────────────────────────────────────────────────
   I dati della pagina che l'Oracolo racconta, letti da Convex (PIANO §1.14).

   `pages.byHandle` è la stessa proiezione pubblica che legge la pagina, quindi
   l'Oracolo non vede niente che un visitatore non veda già. pageToDataset()
   la riporta ai nomi e buildDataset() ne ricava vocabolari (città,
   compagni), elenco degli artisti e i concerti appiattiti per query_concerts.

   Un ConvexHttpClient NUOVO a ogni richiesta (mai di modulo: PIANO §1.7),
   senza logger (i log delle funzioni Convex non finiscono nei log di Vercel).
   Fino al traguardo 6 la pagina è sempre `gabrifila`; il traguardo 6
   aggiunge la scelta per handle.
   ────────────────────────────────────────────────────────────── */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { buildDataset, type Dataset } from "../../../shared/lib/dataset.ts";
import { pageToDataset, type PaginaPubblica } from "../../../shared/lib/pageToDataset.ts";
import { convexUrl } from "../../lib/convexUrl.ts";

/** La pagina dell'Oracolo fino al traguardo 6. */
export const ORACOLO_HANDLE = "gabrifila";

/** Un client Convex per questa sola richiesta. */
export function convexPerRichiesta(): ConvexHttpClient {
  return new ConvexHttpClient(convexUrl(), { logger: false });
}

/** Il dataset della pagina `handle` da Convex, o null se la pagina non esiste (o è un alias). */
export async function datasetDaConvex(handle: string = ORACOLO_HANDLE, client: Pick<ConvexHttpClient, "query"> = convexPerRichiesta()): Promise<Dataset | null> {
  const page = await client.query(api.pages.byHandle, { handle });
  if (!page || "redirect" in page) return null;
  return buildDataset(pageToDataset(page as PaginaPubblica));
}
