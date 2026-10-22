import { createFileRoute } from "@tanstack/react-router";
import { paginaPerHandle } from "./og/-pagina.ts";

/* ──────────────────────────────────────────────────────────────
   Il manifest di un profilo (PIANO §1.41): `/<handle>/manifest.webmanifest`,
   collegato da head() di routes/$handle.tsx. "Aggiungi alla schermata
   Home" apre la pagina di quel profilo, col suo nome.
   - handle sconosciuto o profilo non `active` → 404;
   - alias → 301 al manifest dell'handle nuovo, come le pagine.
   ────────────────────────────────────────────────────────────── */

const ICONE = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
];

export const Route = createFileRoute("/$handle/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const page = await paginaPerHandle(params.handle);
        if (!page) return Response.json({ error: "Profilo inesistente." }, { status: 404 });
        if ("redirect" in page) return new Response(null, { status: 301, headers: { location: `/${page.redirect}/manifest.webmanifest` } });
        const { handle, displayName } = page.profile;
        const manifest = {
          name: `${displayName} ai concerti`,
          short_name: displayName.length <= 12 ? displayName : "Concerti",
          lang: "it",
          start_url: `/${handle}`,
          scope: `/${handle}`,
          display: "browser",
          background_color: "#0a0a0b",
          theme_color: "#0a0a0b",
          icons: ICONE,
        };
        return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json; charset=utf-8" } });
      },
    },
  },
});
