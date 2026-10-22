import { createFileRoute } from "@tanstack/react-router";
import { pageToDataset } from "../../../shared/lib/pageToDataset.ts";
import { risolviTema, type TemaSalvato } from "../../../shared/theme.ts";
import { envDelProcesso, origineCanonica } from "../../server/mcp/origine.ts";
import { serverNow } from "../../server/now.ts";
import { riassunto } from "../../shell/seo.ts";
import { paginaPerHandle } from "./-pagina.ts";

/* ──────────────────────────────────────────────────────────────
   GET /og/<handle> → l'immagine Open Graph del profilo (PNG 1200×630),
   quella di og:image e twitter:image (shell/seo.ts), disegnata da
   ./-immagine.ts (satori + resvg-wasm), caricato solo qui.
   - Cache del CDN: 10 minuti, poi la vecchia mentre se ne rifà una
     (s-maxage + stale-while-revalidate): unica eccezione al `no-store`
     di src/server.ts (PIANO §1.7, §6).
   - handle sconosciuto → 404; alias → 301 all'immagine dell'handle nuovo.
   ────────────────────────────────────────────────────────────── */

const CACHE = "public, max-age=0, s-maxage=600, stale-while-revalidate=86400";

export const Route = createFileRoute("/og/$handle")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const page = await paginaPerHandle(params.handle);
        if (!page) return new Response("Profilo inesistente.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
        if ("redirect" in page) return new Response(null, { status: 301, headers: { location: `/og/${page.redirect}` } });
        const { handle, displayName, theme } = page.profile;
        const tema = risolviTema(theme as TemaSalvato);
        const { LAMPADA, pngOg } = await import("./-immagine.ts");
        const png = await pngOg({
          displayName,
          // l'origine canonica di og:url e di /mcp (§1.8), senza lo schema
          indirizzo: `${origineCanonica(envDelProcesso()).replace(/^https?:\/\//, "")}/${handle}`,
          numeri: riassunto(pageToDataset(page).entries, serverNow()),
          lampada: tema.accent ?? LAMPADA,
          fontTitoli: tema.fontTitoli,
        });
        return new Response(png, { headers: { "content-type": "image/png", "cache-control": CACHE } });
      },
    },
  },
});
