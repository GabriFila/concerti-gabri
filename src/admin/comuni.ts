/* ──────────────────────────────────────────────────────────────
   La vista admin (DECISIONI «Vista admin», 2026-11-12): query, date e
   registro degli accessi, condivisi da /admin e /admin/<handle>.

   Il guard (`caricaAdmin`) è nel loader: senza sessione, o se la query
   admin risponde `not_found` (chi non è in ADMIN_USER_IDS), la rotta
   lancia `notFound()` come un handle che non esiste, e la query fallita si
   toglie dalla cache della richiesta (non arriva nell'HTML). I controlli
   veri sono in Convex (requireAdmin).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef } from "react";
import { notFound, useRouteContext } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

export type VoceProfilo = FunctionReturnType<typeof api.admin.profili>[number];
export type DettaglioProfilo = NonNullable<FunctionReturnType<typeof api.admin.profilo>>;

export const queryProfili = () => convexQuery(api.admin.profili, {});
export const queryProfilo = (handle: string) => convexQuery(api.admin.profilo, { input: { handle } });

type Q = ReturnType<typeof queryProfili> | ReturnType<typeof queryProfilo>;

/** I dati della pagina admin nella cache della richiesta, o `notFound()` (anche per un profilo che non c'è). */
export async function caricaAdmin(context: { queryClient: QueryClient; auth?: { autenticato: boolean } }, q: Q): Promise<void> {
  if (!context.auth?.autenticato) throw notFound();
  let dati: unknown;
  try {
    dati = await context.queryClient.ensureQueryData(q as never);
  } catch {
    context.queryClient.removeQueries({ queryKey: q.queryKey });
    throw notFound();
  }
  if (dati === null) throw notFound();
}

/** La testa delle pagine admin: niente indicizzazione. Solo con i dati caricati (un 404 resta un 404 qualsiasi). */
export const testaAdmin = (titolo: string, css: string) => ({
  meta: [{ title: titolo }, { name: "robots", content: "noindex, nofollow" }],
  links: [{ rel: "stylesheet", href: css }],
});

const QUANDO = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const GIORNO = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

/** Data e ora (Europe/Rome: SSR e browser scrivono lo stesso). */
export const quando = (ms: number | null) => (ms === null ? "—" : QUANDO.format(ms));
export const giorno = (ms: number | null) => (ms === null ? "—" : GIORNO.format(ms));

/** Una riga in `adminAccessi` per pagina aperta (una volta per vista, anche con StrictMode). */
export function useRegistraAccesso(vista: "elenco" | "profilo", handle?: string) {
  const client = useRouteContext({ from: "__root__" }).convexQueryClient.convexClient;
  const fatto = useRef<string | null>(null);
  useEffect(() => {
    const chiave = `${vista}:${handle ?? ""}`;
    if (fatto.current === chiave) return;
    fatto.current = chiave;
    void client.mutation(api.admin.registraAccesso, { input: { vista, ...(handle ? { handle } : {}) } }).catch(() => {});
  }, [client, vista, handle]);
}
