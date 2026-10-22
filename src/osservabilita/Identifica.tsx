/* PostHog riconosce i proprietari loggati solo per id opaco del profilo
   (PIANO traguardo 8): identify a ogni caricamento, reset quando il profilo
   sparisce senza reload (account eliminato); il reset del logout lo fa
   esci() prima di ricaricare. Non disegna niente. PostHog si carica solo nel browser: qui arriva
   con un import dinamico dentro l'effetto, quindi l'SSR non lo tocca. */

import { useEffect } from "react";
import { useViewer } from "../lib/viewer.ts";

export function IdentificaProprietario() {
  const profileId = useViewer()?.profileId ?? null;
  useEffect(() => {
    void import("./posthog.ts").then(m => m.identificaProprietario(profileId));
  }, [profileId]);
  return null;
}
