/* ──────────────────────────────────────────────────────────────
   Sentry e PostHog (PIANO traguardo 8), in locale, con i servizi finti di
   scripts/e2e-sink.mjs: il DSN dei build e2e punta al sink, e il proxy
   /ingest del server Start e2e finisce lì (scripts/e2e-ingest.mjs).
   - Gli unici cookie sono `tema` e quelli di Better Auth (solo da
     loggati); localStorage vuoto, in sessionStorage solo lo scroll del
     router: PostHog e Sentry non scrivono niente.
   - POST /ingest/e/ passa dal proxy (200) senza Cookie né Authorization.
   - Un pageview per ogni navigazione del router, non di più.
   - Un errore del browser e uno del server arrivano al sink senza IP,
     header, corpo, cookie, query string, variabili dei frame, canarino o
     token.
   - Nessuna source map servita (vale anche sulla preview).
   - @sessione: identify porta solo l'id opaco del profilo; cookie e
     storage come sopra anche da loggati; con "Esci" (esci(): reset di
     PostHog e reload) si torna anonimi (login della corsia 3,
     e2e/helpers/auth.ts).
   Sulla preview gira solo il controllo delle source map: Sentry e PostHog
   veri li guarda il giro di §8.4 (orchestratore).
   ────────────────────────────────────────────────────────────── */

import type { BrowserContext, Page } from "@playwright/test";
import { idratata, nuovoProprietario } from "./helpers/auth.ts";
import { CANARINO, formeCanarino } from "./helpers/canarino.ts";
import { http } from "./helpers/http.ts";
import { comeUnVisitatore, eventiPosthog, eventiSentry, leggiSink, svuotaSink } from "./helpers/osservabilita.ts";
import { expect, onPreview, test } from "./helpers/test.ts";
import { START_URL } from "./helpers/urls.ts";

const CGK = "cgk_Ab3dEf6hIj9kLm2nOp5qRs8tUv1w";
const OPACO = "Zq8sK2mN4pR6tV9xB1dF3hJ5lA7cE0gI";
const IP_FINTO = "203.0.113.7";
/** Valori finti che non devono mai comparire in un envelope o in un payload. */
const FINTI = {
  cookie: "segreto-cookie-e2e",
  query: "segreto-query-e2e",
  header: "segreto-header-e2e",
  consenso: "segreto-consenso-e2e",
  fetch: "segreto-fetch-e2e",
};

/** Niente canarino, segreti finti, token o IP nel testo. */
function senzaFughe(testo: string) {
  for (const f of [...formeCanarino(), ...Object.values(FINTI), CGK, OPACO, IP_FINTO]) expect(testo, f).not.toContain(f);
  expect(testo).not.toContain("ip_address");
  expect(testo).not.toContain("{{auto}}");
}

const percorsiPageview = async () => eventiPosthog(await leggiSink()).filter(e => e.event === "$pageview").map(e => e.properties?.$pathname);

/** Aspetta l'evento Sentry che contiene `marca` e lo restituisce con il suo envelope. */
async function eventoSentry(marca: string) {
  let trovato: { event: any; envelope: string } | undefined;
  await expect
    .poll(async () => {
      trovato = eventiSentry(await leggiSink()).find(e => JSON.stringify(e.event).includes(marca));
      return !!trovato;
    }, { timeout: 20_000, message: `nessun evento Sentry con "${marca}" al sink` })
    .toBe(true);
  return trovato!;
}

/** I cookie che il sito può scrivere: il tema e quelli di Better Auth (sessione, cache, JWT di Convex). */
const COOKIE_AMMESSI = ["tema", "better-auth.session_token", "better-auth.session_data", "better-auth.convex_jwt"];
/** I nomi dei cookie senza `__Secure-`, che Better Auth aggiunge quando l'URL del sito è https. */
const nomiCookie = async (context: BrowserContext) => (await context.cookies()).map(c => c.name.replace(/^__Secure-/, ""));

/**
 * Cookie solo tra quelli ammessi; in localStorage solo i contatori di caricamento di Mapbox GL
 * (la mappa, non questo traguardo), in sessionStorage solo lo scroll del router: niente
 * ph_/posthog/sentry da nessuna parte. Restituisce i nomi dei cookie (senza `__Secure-`).
 */
async function soloCookieEStorageAmmessi(page: Page, context: BrowserContext): Promise<string[]> {
  const nomi = await nomiCookie(context);
  expect(nomi.filter(n => !COOKIE_AMMESSI.includes(n))).toEqual([]);
  const { local, session } = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  expect(local.filter(k => !k.startsWith("mapbox.eventData"))).toEqual([]);
  expect(session.filter(k => !k.startsWith("tsr-scroll-restoration"))).toEqual([]);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/ph_|posthog|sentry/i);
  return nomi;
}

/** La richiesta dell'evento: solo l'URL, senza query né frammento. */
function richiestaPulita(event: any) {
  const req = event.request ?? {};
  for (const k of ["headers", "cookies", "data", "query_string", "env"]) expect(req[k], `request.${k}`).toBeUndefined();
  expect(req.url ?? "").not.toMatch(/[?#]/);
  expect(event.user).toBeUndefined();
  for (const v of event.exception?.values ?? []) for (const f of v.stacktrace?.frames ?? []) expect(f.vars).toBeUndefined();
}

test.describe("con il sink locale", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(onPreview(testInfo.project.name), "sink locali: sulla preview il giro di §8.4 lo fa l'orchestratore");
    test.skip(testInfo.project.name === "mobile", "non dipende dal viewport: basta desktop");
    // il filtro anti-bot di PostHog scarterebbe ogni evento di Playwright
    await comeUnVisitatore(page);
    await svuotaSink();
  });

  test("cookie: solo tema (e la sessione); PostHog non scrive in localStorage né in sessionStorage", async ({ page, context }) => {
    await page.goto("/gabrifila");
    // PostHog è partito davvero: il primo pageview è arrivato
    await expect.poll(async () => (await percorsiPageview()).length, { timeout: 20_000 }).toBeGreaterThan(0);
    await page.getByRole("tab", { name: "I dati" }).click();
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);
    // un visitatore anonimo non riceve nemmeno i cookie di Better Auth
    expect((await soloCookieEStorageAmmessi(page, context)).filter(n => n.startsWith("better-auth"))).toEqual([]);
  });

  test("POST /ingest/e/ passa dal proxy e risponde 200, senza Cookie né Authorization", async ({ baseURL }) => {
    const res = await http(new URL("/ingest/e/?ip=0", baseURL).href, {
      headers: { cookie: `better-auth.session_token=${FINTI.cookie}; tema=dark`, authorization: `Bearer ${FINTI.header}` },
      data: [{ event: "prova_proxy_e2e", properties: { token: "phc_e2e_locale", distinct_id: "e2e" } }],
    });
    expect(res.status()).toBe(200);
    let arrivata: any;
    await expect
      .poll(async () => {
        arrivata = (await leggiSink()).posthog.find(r => r.body.includes("prova_proxy_e2e"));
        return arrivata?.path;
      }, { timeout: 15_000 })
      .toBe("/i/e/");
    expect(arrivata.method).toBe("POST");
    expect(arrivata.query).toBe("?ip=0");
    expect(Object.keys(arrivata.headers)).not.toContain("cookie");
    expect(Object.keys(arrivata.headers)).not.toContain("authorization");
    senzaFughe(JSON.stringify(arrivata.headers));

    // le regole più specifiche (/ingest/array, /ingest/static) vanno all'host degli asset
    expect((await http(new URL("/ingest/array/phc_e2e_locale/config", baseURL).href)).status()).toBe(200);
    await expect.poll(async () => (await leggiSink()).posthog.some(r => r.path === "/assets/array/phc_e2e_locale/config")).toBe(true);
  });

  test("un pageview per ogni navigazione del router, non di più", async ({ page }) => {
    await page.goto("/gabrifila");
    await expect.poll(percorsiPageview, { timeout: 20_000 }).toEqual(["/gabrifila"]);
    await page.getByRole("tab", { name: "I dati" }).click();
    await expect(page).toHaveURL(/\/gabrifila\/dati$/);
    await expect(page.locator("#sec-kpis")).toBeVisible();
    // un cambio del solo frammento (l'indice) non è una navigazione nuova
    await page.evaluate(() => history.replaceState(history.state, "", location.pathname + "#sec-mappa"));
    await page.getByRole("tab", { name: "Sul palco" }).click();
    await expect(page).toHaveURL(/\/gabrifila$/);
    const attesi = ["/gabrifila", "/gabrifila/dati", "/gabrifila"];
    await expect.poll(percorsiPageview, { timeout: 20_000 }).toEqual(attesi);
    // oltre l'intervallo di invio di PostHog (3 s): nessun doppione in ritardo
    await page.waitForTimeout(4_000);
    expect(await percorsiPageview()).toEqual(attesi);
    // visitatore anonimo: nessun identify
    expect(eventiPosthog(await leggiSink()).filter(e => e.event === "$identify")).toEqual([]);
  });

  test("un errore nel browser arriva al sink Sentry ripulito", async ({ page, context }) => {
    await context.addCookies([
      { name: "better-auth.session_token", value: FINTI.cookie, url: START_URL },
      { name: "tema", value: "light", url: START_URL },
    ]);
    await page.goto(`/gabrifila?token=${FINTI.query}&next=/x#frammento`);
    // instrument.client.ts è partito (PostHog e Sentry insieme, prima dell'idratazione)
    await expect.poll(async () => (await percorsiPageview()).length, { timeout: 20_000 }).toBeGreaterThan(0);

    // breadcrumb da scartare (console, ui.input) e da ripulire (click, fetch, navigazione)
    await page.evaluate(indirizzo => {
      console.log(`console con ${indirizzo}`);
      const input = document.createElement("input");
      input.name = "indirizzo";
      input.title = indirizzo;
      document.body.append(input);
    }, CANARINO.indirizzo);
    const input = page.locator('input[name="indirizzo"]');
    await input.click();
    await input.pressSequentially(CANARINO.indirizzo);
    await page.evaluate(q => fetch(`/gabrifila?segreto=${q}`).then(r => r.status), FINTI.fetch);
    await page.evaluate(c => history.pushState(history.state, "", `/accedi?consent_code=${c}&next=/x`), FINTI.consenso);

    // un errore sbadato che ripete indirizzo, coordinate e token
    await page.evaluate(([indirizzo, lat, lng, cgk, opaco]) => {
      setTimeout(() => {
        const partenza = { indirizzo, lat, lng };
        throw new Error(`errore di prova del browser: ${indirizzo} (${lat}, ${lng}) chiave ${cgk} Bearer ${opaco} ${JSON.stringify(partenza)}`);
      });
    }, [CANARINO.indirizzo, CANARINO.lat, CANARINO.lng, CGK, OPACO] as const);

    const { event, envelope } = await eventoSentry("errore di prova del browser");
    senzaFughe(envelope);
    richiestaPulita(event);
    expect(event.environment).toBe("e2e");
    expect(envelope).not.toContain('"infer_ip":"auto"');
    const categorie = (event.breadcrumbs ?? []).map((b: any) => b.category);
    expect(categorie).not.toContain("console");
    expect(categorie).not.toContain("ui.input");
    expect(categorie).toContain("ui.click");
    for (const b of event.breadcrumbs ?? []) if (String(b.category).startsWith("ui.")) expect(b.message ?? "").not.toContain('="');
  });

  test("un errore del server arriva al sink Sentry ripulito", async ({ baseURL }) => {
    const res = await http(new URL(`/__e2e/errore-server?token=${FINTI.query}&next=/x`, baseURL).href, {
      headers: { cookie: `better-auth.session_token=${FINTI.cookie}`, authorization: `Bearer ${FINTI.header}`, "x-forwarded-for": IP_FINTO },
      data: { partenza: `${CANARINO.indirizzo} (${CANARINO.lat}, ${CANARINO.lng})`, chiave: CGK, auth: `Bearer ${OPACO}` },
    });
    expect(res.status()).toBe(500);
    const { event, envelope } = await eventoSentry("errore di prova del server");
    senzaFughe(envelope);
    richiestaPulita(event);
    expect(event.platform).toBe("node");
    expect(event.environment).toBe("e2e");
    // il messaggio resta leggibile, con i segnaposto al posto dei dati
    const valore = event.exception.values.map((v: any) => v.value).join("\n");
    expect(valore).toContain("[indirizzo]");
    expect(valore).toContain("[coords]");
    expect(valore).toContain("[Filtered]");
  });

  test("con sessione, identify porta solo l'id opaco del profilo; all'uscita si torna anonimi", { tag: "@sessione" }, async ({ page, context }) => {
    const nome = "Osservata E2E";
    const { email, handle } = await nuovoProprietario(page, { nome });
    await svuotaSink();
    await page.goto(`/${handle}`);
    let identify: any[] = [];
    await expect
      .poll(async () => {
        identify = eventiPosthog(await leggiSink()).filter(e => e.event === "$identify");
        return identify.length;
      }, { timeout: 20_000 })
      .toBe(1);
    const id = identify[0].properties.distinct_id;
    // l'id Convex del profilo: opaco, né email né handle
    expect(id).toMatch(/^[a-z0-9]{20,40}$/);
    expect(JSON.stringify(identify[0])).not.toContain(email);
    expect(JSON.stringify(identify[0])).not.toContain(nome);
    for (const set of [identify[0].$set, identify[0].properties?.$set]) {
      const testo = JSON.stringify(set ?? {});
      for (const no of [email, nome, `"${handle}"`]) expect(testo).not.toContain(no);
    }

    // dopo identify gli eventi portano quell'id
    await page.getByRole("tab", { name: "I dati" }).click();
    await expect
      .poll(async () => eventiPosthog(await leggiSink()).filter(e => e.event === "$pageview" && e.properties?.$pathname === `/${handle}/dati`).map(e => e.properties.distinct_id), { timeout: 20_000 })
      .toEqual([id]);

    // da loggati, dopo identify: cookie solo tema e Better Auth (la sessione c'è), storage pulito
    expect(await soloCookieEStorageAmmessi(page, context)).toContain("better-auth.session_token");

    // "Esci" del footer (esci() vero: reset di PostHog, poi reload completo): di nuovo anonimi,
    // niente identify, pageview mai con quell'id (un $pageleave di prima può arrivare in ritardo: non conta)
    await idratata(page);
    await page.locator(".sitefooter").getByRole("button", { name: "Esci" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-auth", "1");
    expect(await nomiCookie(context)).not.toContain("better-auth.session_token");
    await svuotaSink();
    await page.goto(`/${handle}`);
    await expect.poll(async () => (await percorsiPageview()).length, { timeout: 20_000 }).toBeGreaterThan(0);
    const dopo = eventiPosthog(await leggiSink());
    expect(dopo.filter(e => e.event === "$identify")).toEqual([]);
    expect(dopo.filter(e => e.event === "$pageview" && e.properties?.distinct_id === id)).toEqual([]);
  });
});

test("nessuna source map servita: niente sourceMappingURL né file .map", async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "non dipende dal viewport: basta desktop");
  const html = await (await http(new URL("/gabrifila", baseURL).href)).text();
  const js = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+\.js)"/g)].map(m => m[1]).slice(0, 4);
  expect(js.length).toBeGreaterThan(0);
  for (const a of js) {
    expect(await (await http(new URL(a, baseURL).href)).text(), a).not.toMatch(/sourceMappingURL=/);
    expect((await http(new URL(`${a}.map`, baseURL).href)).status(), `${a}.map`).toBe(404);
  }
});
