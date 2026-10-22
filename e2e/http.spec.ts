/* ──────────────────────────────────────────────────────────────
   Le risposte HTTP (PIANO §1.7, §6, traguardo 1):
   - HTML (pagine e 404) sempre `Cache-Control: private, no-store`;
   - asset statici con hash: cache lunga e immutabile;
   - `/` → 307 verso `/gabrifila`, con la query string;
   - handle o percorsi sconosciuti → 404 in italiano;
   - `/api/chat/history` → 503 fino al traguardo 6;
   - `/api/chat` rifiuta un Origin estraneo prima di chiamare Gemini;
   - le API rispondono 405 ai metodi sbagliati (mai la pagina vuota);
   - un POST cross-site a una server function → 403 (CSRF di src/start.ts);
   - nel selettore di modalità una sola pagina è quella corrente;
   - il saluto "KAWABANGA!" di main in console, una volta per caricamento;
   - sulla preview, gli header di sicurezza di vercel.json.
   Le richieste passano dal fetch di Node (helpers/http.ts), mai dal
   `request` di Playwright: vedi helpers/bypass.ts.
   ────────────────────────────────────────────────────────────── */

import { http, type HttpOptions } from "./helpers/http.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const NO_STORE = "private, no-store";

const get = (baseURL: string | undefined, path: string, headers: Record<string, string> = {}) =>
  http(new URL(path, baseURL).href, { headers });

const call = (baseURL: string | undefined, path: string, opts: HttpOptions) =>
  http(new URL(path, baseURL).href, opts);

/** I testi dei link del selettore di modalità marcati come pagina corrente. */
const currentTabs = (html: string) => {
  const box = html.slice(html.indexOf('class="modeswitch"'));
  const nav = box.slice(0, box.indexOf("</div>"));
  return [...nav.matchAll(/<a\b[^>]*aria-current="page"[^>]*>([^<]*)<\/a>/g)].map(m => m[1]);
};

test.describe("HTML", () => {
  for (const path of ["/gabrifila", "/gabrifila/dati"]) {
    test(`${path}: 200, HTML, private no-store`, async ({ baseURL }) => {
      const res = await get(baseURL, path);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/html");
      expect(res.headers()["cache-control"]).toBe(NO_STORE);
      const html = await res.text();
      // SSR vero: i numeri ci sono già prima di qualunque JavaScript
      expect(html).toContain('lang="it"');
      if (path === "/gabrifila") expect(html).toMatch(/>80</);
      else expect(html).toContain('id="sec-kpis"');
      // una sola scheda è la pagina corrente (su /dati anche "Sul palco" lo sembrava)
      expect(currentTabs(html)).toEqual([path === "/gabrifila" ? "Sul palco" : "I dati"]);
    });
  }

  test("anche con un cookie del tema la pagina resta private no-store", async ({ baseURL }) => {
    const res = await get(baseURL, "/gabrifila", { cookie: "tema=light" });
    expect(res.headers()["cache-control"]).toBe(NO_STORE);
  });

  for (const path of ["/nessuno", "/gabrifila/altro", "/GABRIFILA"]) {
    test(`${path}: 404 in italiano, private no-store`, async ({ baseURL }) => {
      const res = await get(baseURL, path);
      expect(res.status()).toBe(404);
      expect(res.headers()["content-type"]).toContain("text/html");
      expect(res.headers()["cache-control"]).toBe(NO_STORE);
      expect(await res.text()).toContain("Qui non suona nessuno");
    });
  }
});

test.describe("redirect", () => {
  // dal traguardo 3 `/` è la landing; i vecchi link `/?chat=` vanno a /gabrifila con un 308
  test("/ è la landing: 200, HTML, private no-store", async ({ baseURL }) => {
    const res = await get(baseURL, "/");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    expect(res.headers()["cache-control"]).toBe(NO_STORE);
  });

  test("/?chat=… → 308 /gabrifila e conserva la query string", async ({ baseURL }) => {
    const res = await get(baseURL, "/?chat=abc123&x=1");
    expect(res.status()).toBe(308);
    const to = new URL(res.headers()["location"], baseURL);
    expect(to.pathname + to.search).toBe("/gabrifila?chat=abc123&x=1");
  });

  test("nel browser il frammento #sec-… resta", async ({ page }) => {
    await page.goto("/?chat=abc123#sec-mappa");
    await expect(page).toHaveURL(/\/gabrifila\?chat=abc123#sec-mappa$/);
  });
});

test.describe("console", () => {
  test('"KAWABANGA!" una volta per caricamento, non a ogni navigazione', async ({ page }) => {
    const greetings: string[] = [];
    page.on("console", m => { if (m.type() === "log" && m.text() === "KAWABANGA!") greetings.push(m.text()); });
    await page.goto("/gabrifila");
    // arriva dopo l'idratazione
    await expect.poll(() => greetings.length).toBe(1);
    await page.getByRole("tab", { name: "I dati" }).click();
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);
    await expect(page.locator("#sec-kpis")).toBeVisible();
    expect(greetings).toHaveLength(1);
  });
});

test.describe("asset", () => {
  test("JS e CSS con hash: cache lunga e immutabile", async ({ baseURL }) => {
    const html = await (await get(baseURL, "/gabrifila")).text();
    const assets = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+\.(?:js|css))"/g)].map(m => m[1]);
    expect(assets.length).toBeGreaterThan(0);
    for (const a of assets.slice(0, 4)) {
      const res = await get(baseURL, a);
      expect(res.status(), a).toBe(200);
      expect(res.headers()["cache-control"], a).toMatch(/max-age=31536000/);
      expect(res.headers()["cache-control"], a).toContain("immutable");
    }
  });
});

test.describe("API dell'Oracolo", () => {
  test("/api/chat/history: 503 fino al traguardo 6", async ({ baseURL }) => {
    const res = await get(baseURL, "/api/chat/history");
    expect(res.status()).toBe(503);
    expect(await res.json()).toEqual({ error: "Cronologia non disponibile." });
    expect(res.headers()["cache-control"]).toBe(NO_STORE);
  });

  test("/api/chat rifiuta un Origin estraneo (403, prima di Gemini)", async ({ baseURL }) => {
    const res = await call(baseURL, "/api/chat", {
      headers: { origin: "https://evil.example" },
      data: { messages: [{ role: "user", content: "ciao" }] },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()["cache-control"]).toBe(NO_STORE);
  });

  // senza ANY nelle route, un metodo non registrato cadeva nel renderer: 200 e una pagina vuota
  for (const [method, path, allow] of [
    ["GET", "/api/chat", "POST"],
    ["PUT", "/api/chat", "POST"],
    ["HEAD", "/api/chat", "POST"],
    ["POST", "/api/chat/history", "GET"],
    ["DELETE", "/api/chat/history", "GET"],
  ] as const) {
    test(`${method} ${path}: 405, Allow ${allow}`, async ({ baseURL }) => {
      const res = await call(baseURL, path, { method, ...(method === "POST" ? { data: {} } : {}) });
      expect(res.status()).toBe(405);
      expect(res.headers()["allow"]).toBe(allow);
      expect(res.headers()["content-type"]).not.toContain("text/html");
      expect(res.headers()["cache-control"]).toBe(NO_STORE);
      if (method !== "HEAD") expect(await res.json()).toEqual({ error: "Method not allowed" });
    });
  }
});

test.describe("CSRF delle server function (src/start.ts)", () => {
  // l'id non serve: il middleware CSRF gira prima di cercare la funzione
  const SERVER_FN = "/_serverFn/csrf-e2e";
  const post = (baseURL: string | undefined, headers: Record<string, string>) =>
    call(baseURL, SERVER_FN, { headers, data: {} });

  for (const [caso, headers] of [
    ["Origin di un altro sito", { origin: "https://evil.example" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site", origin: "https://evil.example" }],
    ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site" }],
    ["senza Origin né Referer", {}],
  ] as const) {
    test(`POST ${caso} → 403`, async ({ baseURL }) => {
      const res = await post(baseURL, headers);
      expect(res.status()).toBe(403);
      expect(await res.text()).toBe("Forbidden");
    });
  }

  test("lo stesso POST dalla stessa origine passa il controllo (non è 403)", async ({ baseURL }) => {
    const res = await post(baseURL, { "sec-fetch-site": "same-origin", origin: new URL(baseURL!).origin });
    expect(res.status()).not.toBe(403);
  });
});

test.describe("header di sicurezza (vercel.json)", () => {
  test("HSTS, nosniff, referrer, frame e permessi", async ({ baseURL }, testInfo) => {
    test.skip(!onPreview(testInfo.project.name), "gli header di vercel.json esistono solo su Vercel");
    const h = (await get(baseURL, "/gabrifila")).headers();
    expect(h["strict-transport-security"]).toContain("max-age=");
    expect(h["x-content-type-options"]).toBe("nosniff");
    // mai no-referrer/same-origin: romperebbero la restrizione del token Mapbox
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["permissions-policy"]).toBeTruthy();
  });
});
