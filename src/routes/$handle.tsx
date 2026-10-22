import { useEffect, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, notFound, redirect, useRouter } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { buildDataset } from "../../shared/lib/dataset.ts";
import { todayKey } from "../../shared/lib/dates.ts";
import { pageToDataset, type PaginaPubblica } from "../../shared/lib/pageToDataset.ts";
import { HANDLE_RE } from "../../shared/handles.ts";
import { formaDi } from "../../shared/labels.ts";
import type { LayoutSezioni } from "../../shared/sections.ts";
import { themeCss, type TemaSalvato } from "../../shared/theme.ts";
import { ProfileProvider, type Profile, type ProfileCtx } from "../profile/ProfileContext.tsx";
import type { RootData } from "../root/rootData.ts";
import { NotFound } from "../shell/NotFound.tsx";
import { testaPagina } from "../shell/seo.ts";
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

   Dal traguardo 4 head() mette nell'HTML SSR:
   - il titolo "<nome> ai concerti", descrizione, Open Graph, Twitter,
     canonical per ambiente, JSON-LD e il manifest del profilo
     (shell/seo.ts), dai dati già nella cache della richiesta (niente
     copia in più nell'HTML);
   - i token del tema del profilo (shared/theme.ts) in un <style> dopo
     styles.css, quindi niente flash. Se il tema cambia dal vivo la pagina
     fa rigirare il loader e head() si aggiorna (vedi temaVivo).
   ────────────────────────────────────────────────────────────── */

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
    return { handle: params.handle, displayName: page.profile.displayName, tema: themeCss(page.profile.theme as TemaSalvato) };
  },
  head: ({ loaderData, match, matches }) => {
    if (!loaderData) return {};
    const { handle, displayName, tema } = loaderData;
    const page = match.context?.queryClient?.getQueryData(pageQuery(handle).queryKey) as PaginaPubblica | { redirect: string } | null | undefined;
    const entries = page && !("redirect" in page) ? pageToDataset(page).entries : [];
    // `now` e l'origine canonica dal loader di root: gli stessi numeri della
    // pagina, la stessa origine di /mcp (§1.8), calcolata sul server
    const root = matches[0]?.loaderData as RootData | undefined;
    const percorso = matches.some(m => (m.routeId as string) === "/$handle/dati") ? `/${handle}/dati` : `/${handle}`;
    return {
      ...testaPagina({ handle, displayName, percorso, entries, now: root?.now ?? 0, origine: root?.origine ?? "" }),
      // solo valori validati (enum e hex): nessuna stringa dell'utente arriva al CSS
      styles: tema ? [{ children: tema }] : [],
    };
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
  const temaSsr = Route.useLoaderData()?.tema ?? "";
  const dataset = useMemo(() => buildDataset(pageToDataset(page)), [page]);
  const { handle, displayName, forma, layout, extra, theme } = page.profile;
  const profile = useMemo<Profile>(
    () => ({ handle, displayName, forma: formaDi(forma), layout: layout as LayoutSezioni, extra: extra as Profile["extra"] }),
    [handle, displayName, forma, layout, extra],
  );
  const value = useMemo<ProfileCtx>(() => ({ profile, dataset, now, today: todayKey(now) }), [profile, dataset, now]);
  // il tema cambiato dal vivo (dopo l'SSR): rigira solo il loader di questa
  // route, sui dati già in cache, e head() rimette il <style> con i token
  // nuovi. Il filtro serve: invalidate() senza filtro rifarebbe anche il
  // loader di root (`invalid` vince su shouldReload: false), con un nuovo
  // `now` e una chiamata al server per ogni visitatore collegato.
  const temaVivo = useMemo(() => themeCss(theme as TemaSalvato), [theme]);
  const router = useRouter();
  useEffect(() => {
    if (temaVivo !== temaSsr) void router.invalidate({ filter: m => m.routeId === Route.id });
  }, [temaVivo, temaSsr, router]);
  return (
    <ProfileProvider value={value}>
      <Shell />
    </ProfileProvider>
  );
}
