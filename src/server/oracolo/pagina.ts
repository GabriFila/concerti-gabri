/* ──────────────────────────────────────────────────────────────
   La pagina che l'Oracolo racconta, letta da Convex (PIANO §1.14, T6).

   `pages.byHandle` è la stessa proiezione pubblica che legge la pagina, quindi
   l'Oracolo non vede niente che un visitatore non veda già (niente indirizzi
   né coordinate delle partenze). pageToDataset() la riporta ai nomi e
   buildDataset() ne ricava vocabolari (città, compagni), elenco degli
   artisti e i concerti appiattiti per query_concerts; il profilo pubblico
   (nome e forma) serve al prompt.

   Un ConvexHttpClient NUOVO a ogni richiesta (mai di modulo: PIANO §1.7),
   senza logger (i log delle funzioni Convex non finiscono nei log di Vercel).
   ────────────────────────────────────────────────────────────── */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { buildDataset, type Dataset } from "../../../shared/lib/dataset.ts";
import { pageToDataset, type PaginaPubblica } from "../../../shared/lib/pageToDataset.ts";
import { convexUrl } from "../../lib/convexUrl.ts";
import type { ProfiloOracolo } from "./prompt.ts";

/** Un client Convex per questa sola richiesta. */
export function convexPerRichiesta(): ConvexHttpClient {
  return new ConvexHttpClient(convexUrl(), { logger: false });
}

export interface PaginaOracolo {
  profilo: ProfiloOracolo;
  dataset: Dataset;
}

type ClientQuery = Pick<ConvexHttpClient, "query">;

/** La pagina `handle` da Convex, o null se non esiste, non è attiva o è un alias. */
export async function paginaDaConvex(handle: string, client: ClientQuery = convexPerRichiesta()): Promise<PaginaOracolo | null> {
  const page = await client.query(api.pages.byHandle, { handle });
  if (!page || "redirect" in page) return null;
  const { handle: h, displayName, forma, layout } = page.profile;
  return { profilo: { handle: h, displayName, forma, layout }, dataset: buildDataset(pageToDataset(page as PaginaPubblica)) };
}

/** Solo il dataset (i test di parità con i dati statici). */
export async function datasetDaConvex(handle: string, client: ClientQuery = convexPerRichiesta()): Promise<Dataset | null> {
  return (await paginaDaConvex(handle, client))?.dataset ?? null;
}
