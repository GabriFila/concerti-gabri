#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Sentry e PostHog finti per gli e2e locali (traguardo 8). Lo lancia il
   `webServer` di Playwright prima del server Start; nessun evento di test
   arriva mai ai servizi veri.

     node scripts/e2e-sink.mjs          (porta E2E_SINK_PORT, predefinita 3197)

   - Sentry: il DSN dei build e2e è http://public@127.0.0.1:<porta>/1, quindi
     client e server mandano qui gli envelope (POST /api/1/envelope/).
   - PostHog: il server Start in modalità e2e devia le richieste del proxy
     /ingest qui (scripts/e2e-ingest.mjs): eu.i.posthog.com → /i/…,
     eu-assets.i.posthog.com → /assets/…. Si salvano metodo, percorso, query,
     header (così i test vedono se Cookie o Authorization sono passati) e
     corpo, decompresso se serve.
   - I test leggono tutto con GET /_sink e svuotano con DELETE /_sink.
   Solo 127.0.0.1; tiene in memoria al massimo gli ultimi 2000 invii.
   ────────────────────────────────────────────────────────────── */

import { createServer } from "node:http";
import { gunzipSync } from "node:zlib";

const PORT = Number(process.env.E2E_SINK_PORT) || 3197;
const MAX = 2000;
let sentry = [];
let posthog = [];

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
};

function leggi(req) {
  return new Promise((ok, ko) => {
    const parti = [];
    req.on("data", c => parti.push(c));
    req.on("end", () => ok(Buffer.concat(parti)));
    req.on("error", ko);
  });
}

function testo(buf, req, url) {
  const gzip = req.headers["content-encoding"] === "gzip" || url.searchParams.get("compression") === "gzip-js" || (buf[0] === 0x1f && buf[1] === 0x8b);
  try {
    return (gzip ? gunzipSync(buf) : buf).toString("utf8");
  } catch {
    return buf.toString("utf8");
  }
}

const tieni = (lista, voce) => {
  lista.push(voce);
  if (lista.length > MAX) lista.splice(0, lista.length - MAX);
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const rispondi = (status, body) => {
    res.writeHead(status, { ...CORS, "content-type": "application/json" });
    res.end(body);
  };
  if (req.method === "OPTIONS") return rispondi(204, "");
  const body = testo(await leggi(req), req, url);

  if (url.pathname === "/_sink") {
    if (req.method === "DELETE") {
      sentry = [];
      posthog = [];
      return rispondi(200, "{}");
    }
    return rispondi(200, JSON.stringify({ sentry, posthog }));
  }
  if (/^\/api\/[^/]+\/envelope\/?$/.test(url.pathname)) {
    tieni(sentry, { at: Date.now(), query: url.search, body });
    return rispondi(200, "{}");
  }
  if (url.pathname.startsWith("/i/") || url.pathname.startsWith("/assets/")) {
    tieni(posthog, { at: Date.now(), method: req.method, path: url.pathname, query: url.search, headers: req.headers, body });
    // config remota e flag: vuoti (le flag sono spente nel client)
    return rispondi(200, /\/(flags|decide|config)/.test(url.pathname) ? "{}" : '{"status":1}');
  }
  rispondi(404, '{"error":"e2e-sink: percorso sconosciuto"}');
}).listen(PORT, "127.0.0.1", () => console.log(`e2e-sink: in ascolto su 127.0.0.1:${PORT}`));

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(0));
