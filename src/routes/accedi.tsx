import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { PannelloAccesso } from "../accesso/PannelloAccesso.tsx";
import { messaggioErroreGoogle, nextSicuro } from "../lib/auth-client.ts";
import { profiloDiChiGuarda } from "../lib/viewer.ts";

/* ──────────────────────────────────────────────────────────────
   /accedi: il login a pagina intera (PIANO §6), con `?next=` (solo un
   percorso della nostra origine). Ci arrivano i guard (/benvenuto), il
   ritorno da Google con `?error=` e, dal traguardo 7, la `loginPage` di
   MCP. Chi è già entrato va subito a `next`, con un caricamento completo
   (può essere una route API, es. /api/auth/mcp/authorize).
   ────────────────────────────────────────────────────────────── */

const flagsQuery = () => convexQuery(api.authFlags.get, {});

type Ricerca = { next?: string; error?: string };

export const Route = createFileRoute("/accedi")({
  validateSearch: (s: Record<string, unknown>): Ricerca => ({
    next: typeof s.next === "string" ? s.next : undefined,
    error: typeof s.error === "string" ? s.error.slice(0, 60) : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    if (await profiloDiChiGuarda(context)) throw redirect({ href: nextSicuro(search.next), statusCode: 307, reloadDocument: true });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(flagsQuery()),
  head: () => ({ meta: [{ title: "Entra · Concerti" }, { name: "robots", content: "noindex" }] }),
  component: Accedi,
});

function Accedi() {
  const { next, error } = Route.useSearch();
  const { data: flags } = useSuspenseQuery(flagsQuery());
  return (
    <main className="acc acc-accedi">
      <p className="acc-marchio">
        <a href="/">Concerti</a>
      </p>
      <h1 className="acc-titolo acc-titolo--piccolo">Entra</h1>
      <PannelloAccesso next={nextSicuro(next)} flags={flags} erroreIniziale={error ? messaggioErroreGoogle(error) : undefined} />
    </main>
  );
}
