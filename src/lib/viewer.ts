/* ──────────────────────────────────────────────────────────────
   Chi sta guardando la pagina (contratto congelato nel traguardo 2,
   PIANO §4.5: lo cambia solo l'orchestratore).

   `useViewer()` restituisce il profilo dell'utente loggato oppure `null`
   per un visitatore anonimo. Fino al traguardo 3 non esiste il login,
   quindi è sempre `null`; il traguardo 3 lo riempie da `me.profile` (con
   la sessione di Better Auth) senza cambiare la forma qui sotto.
   Serve solo alla UX (cosa mostrare): i controlli veri stanno nelle
   funzioni Convex (`requireOwner`).
   ────────────────────────────────────────────────────────────── */

export interface Viewer {
  /** Id opaco del profilo (Convex). */
  profileId: string;
  /** null finché il profilo è in onboarding (passo 1 non fatto). */
  handle: string | null;
  displayName: string | null;
  status: "onboarding" | "active";
}

/** Il profilo di chi guarda, o null (anonimo). Fino al traguardo 3: sempre null. */
export function useViewer(): Viewer | null {
  return null;
}

/** true se chi guarda è il proprietario della pagina `handle`. */
export function useIsOwner(handle: string): boolean {
  const viewer = useViewer();
  return !!viewer && viewer.status === "active" && viewer.handle === handle;
}
