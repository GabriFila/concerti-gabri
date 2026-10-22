/* ──────────────────────────────────────────────────────────────
   La pagina pubblica di un handle per le risposte non HTML (immagine OG e
   manifest): `pages.byHandle` con un client Convex nuovo a ogni richiesta
   (PIANO §1.7). Il trattino nel nome tiene il file fuori dal route tree.
   ────────────────────────────────────────────────────────────── */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import { HANDLE_RE } from "../../../shared/handles.ts";
import type { PaginaPubblica } from "../../../shared/lib/pageToDataset.ts";
import { convexUrl } from "../../lib/convexUrl.ts";


/** La pagina, `{redirect}` per un alias, null se l'handle non ha una pagina (fuori forma: null senza chiedere a Convex). */
export async function paginaPerHandle(handle: string): Promise<PaginaPubblica | { redirect: string } | null> {
  if (!HANDLE_RE.test(handle)) return null;
  const page = await new ConvexHttpClient(convexUrl(), { logger: false }).query(api.pages.byHandle, { handle });
  return page as PaginaPubblica | { redirect: string } | null;
}
