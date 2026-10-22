/* ──────────────────────────────────────────────────────────────
   Quello che la pagina di un profilo dice di sé a chi non esegue
   JavaScript (PIANO traguardo 4, §1.8, §1.41, §6):
   - nell'HTML SSR: titolo, descrizione, Open Graph, Twitter, canonical
     dell'origine del deployment (la stessa dei metadati di /mcp: SITE_URL
     fuori da Vercel, l'URL del branch sulla preview, mai l'header Host),
     il manifest del profilo (uno solo) e il
     JSON-LD (ProfilePage + un MusicEvent per concerto, mai compagni, prezzi
     o commenti, `<` escapato);
   - `/og/<handle>`: PNG 1200×630 con la cache del CDN, 404 e 301;
   - `/<handle>/manifest.webmanifest`: nome e start_url del profilo;
   - l'HTML resta `private, no-store`.
   L'immagine OG di gabrifila e di un profilo col suo tema finiscono in
   e2e-shots/og/ per Gabri.
   ────────────────────────────────────────────────────────────── */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bypassHeaders, describeError } from "./helpers/bypass.ts";
import { http } from "./helpers/http.ts";
import { prepara } from "./helpers/profili.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const SHOTS = join(process.cwd(), "e2e-shots", "og");

const get = (baseURL: string | undefined, path: string) => http(new URL(path, baseURL).href);

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Gli attributi dei tag `<tag …>` dell'HTML. */
function tags(html: string, tag: string): Record<string, string>[] {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, "g"))].map(m =>
    Object.fromEntries([...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1], unescape(a[2])])),
  );
}

const meta = (html: string, key: string) =>
  tags(html, "meta").filter(m => m.property === key || m.name === key).map(m => m.content);

/** Il contenuto degli <script type="application/ld+json">. */
const jsonLd = (html: string) =>
  [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

/** Corpo binario (il fetch di Node, col bypass solo verso la preview). */
async function bytes(url: string): Promise<{ status: number; headers: Headers; body: Buffer }> {
  try {
    const res = await fetch(url, { headers: bypassHeaders(url), redirect: "manual", signal: AbortSignal.timeout(60_000) });
    return { status: res.status, headers: res.headers, body: Buffer.from(await res.arrayBuffer()) };
  } catch (err) {
    throw new Error(`GET ${url}: ${describeError(err)}`);
  }
}

/**
 * L'origine canonica del deployment (§1.8): quella che dichiarano i
 * metadati di /mcp (corsia 7), calcolata dallo stesso codice server. In
 * locale è SITE_URL del worktree (o l'URL tailnet), mai l'host della
 * richiesta; sulla preview è l'URL del branch.
 */
async function origineDelDeployment(baseURL: string | undefined, progetto: string): Promise<string> {
  const doc = await (await get(baseURL, "/.well-known/oauth-protected-resource/mcp")).json();
  const origine = new URL(doc.resource).origin;
  if (onPreview(progetto)) expect(origine).toBe(new URL(baseURL!).origin);
  return origine;
}

/** Larghezza e altezza dall'header IHDR di un PNG. */
const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test.describe("head della pagina di gabrifila", () => {
  for (const [path, percorso] of [["/gabrifila", "/gabrifila"], ["/gabrifila/dati", "/gabrifila/dati"]] as const) {
    test(`${path}: meta, Open Graph, Twitter, canonical e manifest nell'HTML SSR`, async ({ baseURL }, testInfo) => {
      const origine = await origineDelDeployment(baseURL, testInfo.project.name);
      const res = await get(baseURL, path);
      expect(res.status()).toBe(200);
      expect(res.headers()["cache-control"]).toBe("private, no-store");
      const html = await res.text();

      expect(html).toMatch(/<title>(?:[^<]* · )?Gabri ai concerti<\/title>/);
      const descr = meta(html, "description");
      expect(descr).toHaveLength(1);
      expect(descr[0]).toMatch(/^I concerti di Gabri: \d+ visti, (?:\d+ in programma, )?\d+ artisti diversi, \d+ città\.$/);
      // in locale l'orologio è congelato: gli stessi numeri delle card KPI
      if (!onPreview(testInfo.project.name)) expect(descr[0]).toBe("I concerti di Gabri: 80 visti, 11 in programma, 50 artisti diversi, 13 città.");

      expect(meta(html, "og:title")).toEqual(["Gabri ai concerti"]);
      expect(meta(html, "og:description")).toEqual(descr);
      expect(meta(html, "og:type")).toEqual(["profile"]);
      expect(meta(html, "og:locale")).toEqual(["it_IT"]);
      // URL assoluti dell'origine dell'ambiente (§1.8), mai dall'header Host
      expect(meta(html, "og:url")).toEqual([origine + percorso]);
      expect(meta(html, "og:image")).toEqual([`${origine}/og/gabrifila`]);
      expect(meta(html, "og:image:width")).toEqual(["1200"]);
      expect(meta(html, "og:image:height")).toEqual(["630"]);
      expect(meta(html, "twitter:card")).toEqual(["summary_large_image"]);
      expect(meta(html, "twitter:image")).toEqual([`${origine}/og/gabrifila`]);

      const links = tags(html, "link");
      expect(links.filter(l => l.rel === "canonical").map(l => l.href)).toEqual([origine + percorso]);
      // un solo manifest, quello del profilo (il browser userebbe il primo)
      expect(links.filter(l => l.rel === "manifest").map(l => l.href)).toEqual(["/gabrifila/manifest.webmanifest"]);
    });
  }

  test("JSON-LD: ProfilePage, Person e un MusicEvent per concerto, senza dati privati", async ({ baseURL }, testInfo) => {
    const origine = await origineDelDeployment(baseURL, testInfo.project.name);
    const html = await (await get(baseURL, "/gabrifila")).text();
    const scripts = jsonLd(html);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).not.toContain("<");
    const ld = JSON.parse(scripts[0]);
    const grafo = ld["@graph"] as Record<string, any>[];
    expect(ld["@context"]).toBe("https://schema.org");
    expect(grafo[0]).toMatchObject({ "@type": "ProfilePage", url: `${origine}/gabrifila`, name: "Gabri ai concerti" });
    expect(grafo[1]).toMatchObject({ "@type": "Person", name: "Gabri", alternateName: "gabrifila" });
    const eventi = grafo.filter(n => n["@type"] === "MusicEvent");
    if (!onPreview(testInfo.project.name)) expect(eventi).toHaveLength(91);
    else expect(eventi.length).toBeGreaterThanOrEqual(91);
    expect(eventi.find(e => e.performer.name === "Emma Nolde")).toMatchObject({ location: { "@type": "MusicVenue" } });
    // mai compagni, prezzi, viaggi o commenti
    const testo = scripts[0];
    for (const chiave of ["with", "cost", "price", "offers", "gift", "km", "from", "comments", "comment"]) expect(testo).not.toContain(`"${chiave}"`);
    for (const nome of ["Cami", "Alessia P", "Matteo A"]) expect(testo).not.toContain(nome);
    expect(testo).not.toContain("Pure brunori");
  });
});

test.describe("immagine OG", () => {
  test("/og/gabrifila: PNG 1200×630, con la cache del CDN", async ({ baseURL }, testInfo) => {
    const res = await bytes(new URL("/og/gabrifila", baseURL).href);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const cache = res.headers.get("cache-control") ?? "";
    expect(cache).not.toContain("private");
    if (testInfo.project.name === "preview") {
      // il CDN di Vercel consuma s-maxage e al browser manda max-age=0:
      // conta che la seconda richiesta arrivi dalla sua cache
      const diNuovo = await bytes(new URL("/og/gabrifila", baseURL).href);
      expect(["HIT", "STALE"]).toContain(diNuovo.headers.get("x-vercel-cache"));
    } else {
      expect(cache).toContain("s-maxage=600");
      expect(cache).toContain("stale-while-revalidate");
    }
    expect(res.body.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(pngSize(res.body)).toEqual({ width: 1200, height: 630 });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, `${testInfo.project.name}-gabrifila.png`), res.body);
  });

  test("handle sconosciuto o fuori forma: 404", async ({ baseURL }) => {
    for (const h of ["nessuno-qui", "GABRIFILA", "x"]) {
      const res = await get(baseURL, `/og/${h}`);
      expect(res.status(), h).toBe(404);
    }
  });
});

test.describe("manifest del profilo", () => {
  test("/gabrifila/manifest.webmanifest: nome e start_url del profilo", async ({ baseURL }) => {
    const res = await get(baseURL, "/gabrifila/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");
    const m = await res.json();
    expect(m).toMatchObject({ name: "Gabri ai concerti", start_url: "/gabrifila", scope: "/gabrifila", lang: "it" });
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512"]);
  });

  test("handle sconosciuto: 404", async ({ baseURL }) => {
    expect((await get(baseURL, "/nessuno-qui/manifest.webmanifest")).status()).toBe(404);
  });
});

/* Profili di prova sul Convex LOCALE: non sulla preview. */
test.describe("profili di prova", () => {
  const CATTIVO = "</script><script>window.__xss=1</script>";

  test.beforeEach(({}, testInfo) => {
    test.skip(onPreview(testInfo.project.name), "i profili di prova vivono solo sul Convex locale");
  });
  test.beforeAll(({}, testInfo) => {
    if (onPreview(testInfo.project.name)) return;
    prepara({
      handle: "e2e-seo", displayName: "Seo", forma: "f",
      theme: { preset: "teatro" },
      persone: ["Compagna Segreta"],
      alias: ["e2e-seo-vecchio"],
      concerti: [
        { date: "2025-03-10", artist: CATTIVO, venue: "Alcatraz", with: ["Compagna Segreta"], cost: 77, comments: "commento privato" },
        { date: "2026-12-01", artist: "Più avanti" },
      ],
    });
    // un nome lungo col preset neon, solo per l'immagine da far vedere a Gabri
    prepara({
      handle: "e2e-seo-neon", displayName: "Alessandra Bianchi", forma: "f", theme: { preset: "neon" },
      concerti: [{ date: "2025-01-10", artist: "Uno" }, { date: "2025-02-10", artist: "Due", venue: "Politeama Genovese", city: "Genova" }],
    });
  });

  test("un nome con </script> resta dentro il JSON-LD e non esegue niente", async ({ page, baseURL }) => {
    const html = await (await get(baseURL, "/e2e-seo")).text();
    expect(html).not.toContain("</script><script>window.__xss");
    const ld = JSON.parse(jsonLd(html)[0]);
    const eventi = (ld["@graph"] as Record<string, any>[]).filter(n => n["@type"] === "MusicEvent");
    expect(eventi.map(e => e.name)).toEqual([CATTIVO, "Più avanti"]);
    expect(jsonLd(html)[0]).not.toContain("Compagna Segreta");
    expect(jsonLd(html)[0]).not.toContain("commento privato");
    expect(jsonLd(html)[0]).not.toContain("77");
    expect(meta(html, "description")).toEqual(["I concerti di Seo: 1 visto, 1 in programma, 1 artista, 1 città."]);

    await page.goto("/e2e-seo");
    await expect(page.locator(".rt-h1")).toContainText("Seo");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });

  test("immagine OG col tema del profilo; alias → 301 per immagine e manifest", async ({ baseURL }, testInfo) => {
    const res = await bytes(new URL("/og/e2e-seo", baseURL).href);
    expect(res.status).toBe(200);
    expect(pngSize(res.body)).toEqual({ width: 1200, height: 630 });
    mkdirSync(SHOTS, { recursive: true });
    writeFileSync(join(SHOTS, `${testInfo.project.name}-e2e-seo-teatro.png`), res.body);
    const neon = await bytes(new URL("/og/e2e-seo-neon", baseURL).href);
    expect(neon.status).toBe(200);
    writeFileSync(join(SHOTS, `${testInfo.project.name}-e2e-seo-neon.png`), neon.body);

    const og = await get(baseURL, "/og/e2e-seo-vecchio");
    expect(og.status()).toBe(301);
    expect(og.headers()["location"]).toBe("/og/e2e-seo");
    const mf = await get(baseURL, "/e2e-seo-vecchio/manifest.webmanifest");
    expect(mf.status()).toBe(301);
    expect(mf.headers()["location"]).toBe("/e2e-seo/manifest.webmanifest");
    expect((await (await get(baseURL, "/e2e-seo/manifest.webmanifest")).json()).start_url).toBe("/e2e-seo");
  });
});
