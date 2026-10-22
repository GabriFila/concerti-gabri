/* ──────────────────────────────────────────────────────────────
   Dal catalogo alle funzioni Convex (PIANO §5.3): ogni strumento MCP chiama
   la funzione `funzione` della sua operazione, con il token dell'agente.
   Il tipo (query, mutation, action) segue `tipo` dell'operazione, salvo le
   action elencate qui; convex/registry.test.ts lo confronta con il registro.
   ────────────────────────────────────────────────────────────── */

import type { OperazioneCatalogo } from "../../../shared/agent/catalog.ts";

export type TipoFunzione = "query" | "mutation" | "action";

/** Le operazioni che sono action (Nominatim, download di un logo, import a lotti). */
export const ACTION: ReadonlySet<string> = new Set(["geo:searchVenue", "gifters:setLogoFromUrl", "importer:apply"]);

export const tipoFunzione = (op: Pick<OperazioneCatalogo, "funzione" | "tipo">): TipoFunzione =>
  ACTION.has(op.funzione) ? "action" : op.tipo === "lettura" ? "query" : "mutation";

/**
 * Operazioni del catalogo la cui funzione arriva da un'altra corsia e non c'è
 * ancora: lo strumento esiste e risponde `non_disponibile`. Vuoto dopo
 * l'integrazione della corsia 5 (gifters:setLogoFromUrl c'è);
 * convex/registry.test.ts fallisce se resta qui una funzione che esiste.
 */
export const NON_ANCORA_DISPONIBILI: ReadonlySet<string> = new Set<string>();
