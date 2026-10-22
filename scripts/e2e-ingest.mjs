/* ──────────────────────────────────────────────────────────────
   PostHog finto per il server Start degli e2e locali (traguardo 8).
   scripts/e2e-server.mjs lo carica con `node --import` prima della build,
   quindi vale dalla prima richiesta: il codice di Start/SSR (e con lui
   src/instrument.server.ts) si carica solo alla prima pagina, mentre il
   proxy /ingest delle routeRules di Nitro risponde anche prima.

   Il proxy /ingest chiama `fetch` verso eu.i.posthog.com ed
   eu-assets.i.posthog.com: qui quelle chiamate vanno allo stand-in locale
   E2E_INGEST_URL (scripts/e2e-sink.mjs) come /i/… e /assets/…, oppure,
   senza, ricevono un 200 finto. Un test non raggiunge mai il PostHog vero.
   Ogni altra chiamata passa invariata.
   ────────────────────────────────────────────────────────────── */

const POSTHOG = /^https:\/\/(eu|eu-assets)\.i\.posthog\.com(\/.*)?$/;
const stand = (process.env.E2E_INGEST_URL || "").replace(/\/+$/, "");
const fetchVero = globalThis.fetch;

globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const m = url.match(POSTHOG);
  if (!m) return fetchVero(input, init);
  if (!stand) return Promise.resolve(new Response('{"status":1}', { status: 200, headers: { "content-type": "application/json" } }));
  // eu.i.posthog.com → <stand>/i/…, eu-assets.i.posthog.com → <stand>/assets/…
  return fetchVero(`${stand}/${m[1] === "eu" ? "i" : "assets"}${m[2] ?? "/"}`, init);
};
