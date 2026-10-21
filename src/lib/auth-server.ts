/* ──────────────────────────────────────────────────────────────
   Better Auth lato server Start (contratto di ondata,
   docs/multiutente/CONTRATTI-ONDATA.md). `getToken()` legge il cookie di
   sessione della richiesta corrente e lo scambia con il JWT di Convex;
   `fetchAuth*` chiamano Convex con quel token. Solo dentro server function
   e handler di rotta, mai nei componenti. Proprietario: corsia 3.
   ────────────────────────────────────────────────────────────── */

import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { convexUrl } from "./convexUrl.ts";

type Helpers = ReturnType<typeof convexBetterAuthReactStart>;
let helpers: Helpers | undefined;

/** Creati al primo uso: gli URL di Convex arrivano dal build (§1.6). */
function auth(): Helpers {
  if (!helpers) {
    const convexSiteUrl = import.meta.env.VITE_CONVEX_SITE_URL;
    if (!convexSiteUrl) throw new Error("VITE_CONVEX_SITE_URL mancante al build: il login non sa a quale Convex chiedere la sessione");
    helpers = convexBetterAuthReactStart({ convexUrl: convexUrl(), convexSiteUrl });
  }
  return helpers;
}

export const handler: Helpers["handler"] = request => auth().handler(request);
export const getToken: Helpers["getToken"] = () => auth().getToken();
export const fetchAuthQuery: Helpers["fetchAuthQuery"] = (query, ...args) => auth().fetchAuthQuery(query, ...args);
export const fetchAuthMutation: Helpers["fetchAuthMutation"] = (mutation, ...args) => auth().fetchAuthMutation(mutation, ...args);
export const fetchAuthAction: Helpers["fetchAuthAction"] = (action, ...args) => auth().fetchAuthAction(action, ...args);
