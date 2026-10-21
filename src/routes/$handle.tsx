import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, notFound, redirect } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { buildDataset } from "../../shared/lib/dataset.ts";
import { todayKey } from "../../shared/lib/dates.ts";
import { pageToDataset, type PaginaPubblica } from "../../shared/lib/pageToDataset.ts";
import { ProfileProvider, type ProfileCtx } from "../profile/ProfileContext.tsx";
import { NotFound } from "../shell/NotFound.tsx";
import { Shell } from "../shell/Shell.tsx";

/* ──────────────────────────────────────────────────────────────
   Layout della pagina di un profilo (PIANO §6). Dal traguardo 2 i dati
   arrivano da Convex (`pages.byHandle`):
   - il loader (SSR e navigazioni) li mette nella cache della richiesta con
     ensureQueryData: handle non valido → 404; profilo assente o non
     `active` → 404; alias → 301 verso l'handle nuovo, stesso sotto-percorso;
   - il componente li legge con useSuspenseQuery: nell'HTML ci sono già,
     e dopo l'idratazione la query resta sottoscritta via WebSocket, quindi
     la pagina si aggiorna da sola quando i dati cambiano;
   - pageToDataset() riporta la proiezione pubblica (id) ai nomi e
     buildDataset() ne ricava tutto il resto, come con i dati statici.
   ────────────────────────────────────────────────────────────── */

/** Forma di un handle (la regola completa, coi riservati, arriva con shared/handles.ts nel traguardo 3). */
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const pageQuery = (handle: string) => convexQuery(api.pages.byHandle, { handle });

export const Route = createFileRoute("/$handle")({
  loader: async ({ context, params, location }) => {
    if (!HANDLE_RE.test(params.handle)) throw notFound();
    const page = await context.queryClient.ensureQueryData(pageQuery(params.handle));
    if (!page) throw notFound();
    if ("redirect" in page) {
      // l'alias porta allo stesso sotto-percorso dell'handle nuovo (/vecchio/dati → /nuovo/dati)
      const rest = location.pathname.replace(/^\/[^/]+/, "");
      throw redirect({ href: `/${page.redirect}${rest}${location.searchStr}`, statusCode: 301 });
    }
    return { handle: params.handle };
  },
  component: HandleLayout,
});

const rootApi = getRouteApi("__root__");

function HandleLayout() {
  const { handle } = Route.useParams();
  const { data: page } = useSuspenseQuery(pageQuery(handle));
  // dal vivo il profilo può sparire o cambiare handle: niente pagina sotto un handle che non è più suo
  if (!page || "redirect" in page) return <NotFound />;
  return <ProfilePage page={page as PaginaPubblica} />;
}

function ProfilePage({ page }: { page: PaginaPubblica }) {
  const { now } = rootApi.useLoaderData();
  const dataset = useMemo(() => buildDataset(pageToDataset(page)), [page]);
  const { handle, displayName } = page.profile;
  const value = useMemo<ProfileCtx>(
    () => ({ profile: { handle, displayName }, dataset, now, today: todayKey(now) }),
    [handle, displayName, dataset, now],
  );
  return (
    <ProfileProvider value={value}>
      <Shell />
    </ProfileProvider>
  );
}
