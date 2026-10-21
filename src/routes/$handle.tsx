import { useMemo } from "react";
import { createFileRoute, getRouteApi, notFound } from "@tanstack/react-router";
import { buildDataset } from "../../shared/lib/dataset.ts";
import { todayKey } from "../../shared/lib/dates.ts";
import { GABRIFILA, GABRIFILA_INPUT } from "../data.ts";
import { ProfileProvider, type ProfileCtx } from "../profile/ProfileContext.tsx";
import { Shell } from "../shell/Shell.tsx";

/* Layout della pagina di un profilo. Nel traguardo 1 esiste solo `gabrifila`,
   coi dati statici di src/data.ts; ogni altro handle è un 404. Dal traguardo 2
   il loader legge la pagina da Convex. */
export const Route = createFileRoute("/$handle")({
  loader: ({ params }) => {
    if (params.handle !== GABRIFILA.handle) throw notFound();
    return { handle: params.handle };
  },
  component: HandleLayout,
});

const rootApi = getRouteApi("__root__");

function HandleLayout() {
  const { now } = rootApi.useLoaderData();
  const dataset = useMemo(() => buildDataset(GABRIFILA_INPUT), []);
  const value = useMemo<ProfileCtx>(
    () => ({ profile: GABRIFILA, dataset, now, today: todayKey(now) }),
    [dataset, now],
  );
  return (
    <ProfileProvider value={value}>
      <Shell />
    </ProfileProvider>
  );
}
