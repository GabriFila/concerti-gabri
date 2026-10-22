/* ──────────────────────────────────────────────────────────────
   Chi sta guardando la pagina (contratto congelato nel traguardo 2,
   PIANO §4.5: la forma di `Viewer` la cambia solo l'orchestratore).

   `useViewer()` restituisce il profilo dell'utente loggato oppure `null`
   per un visitatore anonimo (o un utente senza profilo). Legge
   `me.profile` con TanStack Query solo se l'SSR ha visto una sessione
   (contesto di root, lib/auth-sessione.ts): lì `me.profile` è già nella
   cache della richiesta, quindi HTML e idratazione coincidono, e dopo
   resta sottoscritto via WebSocket. Gli anonimi non lo chiedono mai.
   Serve solo alla UX (cosa mostrare): i controlli veri stanno nelle
   funzioni Convex (`requireOwner`).
   ────────────────────────────────────────────────────────────── */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "../../convex/_generated/api";
import type { PASSI_ONBOARDING } from "../../shared/schema/profile.ts";

export interface Viewer {
  /** Id opaco del profilo (Convex). */
  profileId: string;
  /** null finché il profilo è in onboarding (passo 1 non fatto). */
  handle: string | null;
  displayName: string | null;
  status: "onboarding" | "active";
}

/** `me.profile` per intero: in più il passo di /benvenuto (non fa parte di Viewer). */
export interface ProfiloDiChiGuarda extends Viewer {
  onboardingStep: (typeof PASSI_ONBOARDING)[number];
}

/** La query di `me.profile` (per la cache della richiesta e per i guard). */
export const viewerQuery = () => convexQuery(api.me.profile, {});

/** Il profilo di chi guarda (con `onboardingStep`), per i guard: null se anonimo. */
export async function profiloDiChiGuarda(context: { queryClient: QueryClient; auth?: { autenticato: boolean } }): Promise<ProfiloDiChiGuarda | null> {
  if (!context.auth?.autenticato) return null;
  return await context.queryClient.ensureQueryData(viewerQuery());
}

const rootApi = getRouteApi("__root__");

/** `me.profile` dal vivo, solo se l'SSR ha visto una sessione (altrimenti mai chiesto). */
export function useProfiloDiChiGuarda(): { data: ProfiloDiChiGuarda | null | undefined; isPending: boolean } {
  const autenticato = rootApi.useRouteContext({ select: c => !!c.auth?.autenticato });
  const { data, isPending } = useQuery(convexQuery(api.me.profile, autenticato ? {} : "skip"));
  return { data: data as ProfiloDiChiGuarda | null | undefined, isPending: autenticato && isPending };
}

/** Il profilo di chi guarda, o null (anonimo). */
export function useViewer(): Viewer | null {
  const { data } = useProfiloDiChiGuarda();
  return useMemo(
    () => (data ? { profileId: data.profileId, handle: data.handle, displayName: data.displayName, status: data.status } : null),
    [data],
  );
}

/** true se chi guarda è il proprietario della pagina `handle`. */
export function useIsOwner(handle: string): boolean {
  const viewer = useViewer();
  return !!viewer && viewer.status === "active" && viewer.handle === handle;
}
