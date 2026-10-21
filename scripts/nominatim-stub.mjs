#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Stub di Nominatim per i worktree e gli e2e (PIANO §4.3, §8.2).

     node scripts/nominatim-stub.mjs [--port N]

   Il deployment Convex locale ha NOMINATIM_URL=http://127.0.0.1:<porta>
   (scripts/convex-locale.mjs, porta in NOMINATIM_STUB_PORT di
   .env.worktree). Risponde a GET /search come Nominatim (jsonv2):
   - una ricerca che contiene "Canarini" → il canarino: `display_name`
     fisso e DIVERSO dal testo scritto, coordinate fisse;
   - `featureType=city` → la città della ricerca (ultima parola);
   - `layer=poi` → un POI deterministico col nome cercato, più una casa e
     una strada che il server deve scartare;
   - altro (partenze) → due indirizzi deterministici.
   Non registra MAI le ricerche (sono indirizzi). GET /status → "ok".
   ────────────────────────────────────────────────────────────── */

import { createServer } from "node:http";
import { CANARINO } from "../e2e/helpers/canarino.ts";

const argPort = process.argv.indexOf("--port");
const PORT = Number(argPort !== -1 ? process.argv[argPort + 1] : process.env.NOMINATIM_STUB_PORT || 0);

/** Numero stabile da una stringa (coordinate deterministiche). */
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const coord = (s, base, span) => (base + ((hash(s) % 10_000) / 10_000) * span).toFixed(7);

function cerca(params) {
  const q = (params.get("q") || "").trim();
  if (/canarin/i.test(q)) {
    return [{
      place_id: 1, osm_type: "node", osm_id: 7, lat: String(CANARINO.lat), lon: String(CANARINO.lng),
      category: "place", type: "house", addresstype: "house", name: "", display_name: CANARINO.displayName,
      address: { city: "Genova", country: "Italia" },
    }];
  }
  const parole = q.split(/[\s,]+/).filter(Boolean);
  const citta = parole.length ? parole[parole.length - 1] : "Milano";
  if (params.get("featureType") === "city") {
    return [{
      place_id: 2, osm_type: "relation", osm_id: 1000 + (hash(citta) % 1000), lat: coord(citta, 44, 2), lon: coord(citta + "x", 8, 3),
      category: "boundary", type: "administrative", addresstype: "city", name: citta, display_name: `${citta}, Italia`, address: { city: citta },
    }];
  }
  if (params.get("layer") === "poi") {
    return [
      {
        place_id: 3, osm_type: "way", osm_id: 100000 + (hash(q) % 100000), lat: coord(q, 44, 2), lon: coord(q + "y", 8, 3),
        category: "amenity", type: "theatre", addresstype: "amenity", name: q, display_name: `${q}, Stub, ${citta}, Italia`, address: { city: citta },
      },
      { place_id: 4, osm_type: "node", osm_id: 4, lat: "45.0", lon: "9.0", category: "building", type: "house", addresstype: "house", name: "", display_name: `Casa, ${citta}`, address: { city: citta } },
      { place_id: 5, osm_type: "way", osm_id: 5, lat: "45.0", lon: "9.0", category: "highway", type: "residential", addresstype: "road", name: "Via Stub", display_name: `Via Stub, ${citta}`, address: { city: citta } },
    ];
  }
  return [0, 1].map(i => ({
    place_id: 10 + i, osm_type: "node", osm_id: 10 + i, lat: coord(q + i, 44, 2), lon: coord(q + i + "z", 8, 3),
    category: "place", type: "house", addresstype: "house", name: "", display_name: `Indirizzo di prova ${i + 1}, Italia`, address: { city: "Prova" },
  }));
}

const server = createServer((req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (url.pathname === "/status") {
    res.writeHead(200, { "content-type": "text/plain" }).end("ok");
    return;
  }
  if (req.method !== "GET" || url.pathname !== "/search") {
    res.writeHead(404).end();
    return;
  }
  if (!/concerti-gabri\//.test(req.headers["user-agent"] || "")) {
    // come Nominatim: niente User-Agent identificativo, niente risposta
    res.writeHead(403, { "content-type": "text/plain" }).end("User-Agent mancante");
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(cerca(url.searchParams)));
});

server.listen(PORT, "127.0.0.1", () => {
  console.error(`nominatim-stub: in ascolto su http://127.0.0.1:${server.address().port}`);
});
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
