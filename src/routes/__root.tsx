/// <reference types="vite/client" />
/* ──────────────────────────────────────────────────────────────
   La route di root: il documento HTML (<html>, <head>, <body>), gli stili
   collegati in <head> (niente flash in SSR), le icone, il titolo e il tema.

   Il loader gira una volta sola, sul server (shouldReload: false): cattura
   `now` e legge il cookie `tema` (root/rootData.ts). Il risultato arriva al
   client con l'idratazione e non si ricarica a ogni navigazione.

   Il contesto (RouterContext, src/router.tsx) porta i client della
   richiesta; i provider stanno nello slot root/providers.tsx (traguardo 3)
   e la pagina d'errore nello slot root/errors.tsx (traguardo 8).
   ────────────────────────────────────────────────────────────── */

import { useEffect, type ReactNode } from "react";
import { HeadContent, Scripts, ScriptOnce, createRootRouteWithContext } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import wishlistCss from "../wishlist.css?url";
import { RootError } from "../root/errors.tsx";
import { RootProviders } from "../root/providers.tsx";
import { getRootData } from "../root/rootData.ts";
import { siteTitle } from "../root/title.ts";
import { NotFound } from "../shell/NotFound.tsx";
import { SYSTEM_THEME_SCRIPT, ssrDataTheme } from "../theme/tema.ts";
import type { RouterContext } from "../router.tsx";

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: () => getRootData(),
  shouldReload: false,
  staleTime: Infinity,
  head: () => ({
    meta: [
      { charSet: "UTF-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1.0" },
      { title: siteTitle() },
      { name: "theme-color", content: "#0a0a0b" },
    ],
    links: [
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      // stesso ordine del bundle CSS di main: wishlist.css arrivava prima di styles.css
      { rel: "stylesheet", href: wishlistCss },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RootError,
});

// il saluto in console di main.tsx (commit 41fb6e5): una volta per caricamento,
// solo nel browser (in dev StrictMode ripete gli effetti, da qui il flag)
let greeted = false;

function RootDocument({ children }: { children: ReactNode }) {
  const tema = Route.useLoaderData()?.tema ?? "dark";
  useEffect(() => {
    if (greeted) return;
    greeted = true;
    console.log("KAWABANGA!");
  }, []);
  return (
    // data-theme già nell'HTML: niente flash. Con "system" lo decide lo script
    // qui sotto prima del primo paint, e l'attributo può differire dall'SSR.
    <html lang="it" data-theme={ssrDataTheme(tema)} suppressHydrationWarning>
      <head>
        {tema === "system" && <ScriptOnce>{SYSTEM_THEME_SCRIPT}</ScriptOnce>}
        <HeadContent />
      </head>
      <body>
        <div id="root">
          <RootProviders>{children}</RootProviders>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
