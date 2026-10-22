/* ──────────────────────────────────────────────────────────────
   Controllo fughe di Sentry e PostHog (PIANO traguardo 9, giro finale),
   con i servizi finti della corsia 8 (scripts/e2e-sink.mjs: il DSN dei
   build e2e e il proxy /ingest finiscono lì).

   1. il proprietario scrive il canarino in /modifica#partenze (stub di
      Nominatim, scelto tra i candidati: l'indirizzo resta nella pagina);
   2. con il canarino a schermo si provoca un errore nel browser, sbadato,
      che ripete l'indirizzo visto nella pagina, e si mandano eventi
      PostHog (pageview di /modifica, identify, pageview di una
      navigazione del router);
   3. nel sink, negli envelope Sentry e nelle richieste /ingest (corpo e
      header): niente canarino né coordinate di casa (gli aghi di
      helpers/fughe.ts), niente valori dei cookie della sessione, niente
      token (il JWT di Convex), niente Cookie né Authorization.
   L'utente è nuovo (mai gabrifila: i km della parità). Solo desktop, solo
   in locale: Sentry e PostHog veri sulla preview li guarda l'orchestratore.
   ────────────────────────────────────────────────────────────── */

import { nuovoProprietario } from "../helpers/auth.ts";
import { CANARINO } from "../helpers/canarino.ts";
import { convexRun } from "../helpers/convex.ts";
import { fughe } from "../helpers/fughe.ts";
import { stubNominatim } from "../helpers/nominatim.ts";
import { comeUnVisitatore, eventiPosthog, eventiSentry, leggiSink, svuotaSink } from "../helpers/osservabilita.ts";
import { expect, onPreview, test } from "../helpers/test.ts";

const PARTENZA = "Casa canarino";
const MARCA = "errore di prova del giro finale";

let spegniStub: () => void = () => {};
test.beforeAll(async ({}, info) => {
  if (info.project.name !== "desktop") return;
  spegniStub = await stubNominatim();
});
test.afterAll(() => {
  spegniStub();
  convexRun("devtools:cleanupE2E");
});

test("canarino in #partenze, errore nel browser ed eventi PostHog: nel sink niente canarino, coordinate, cookie o token", { tag: "@sessione" }, async ({ page, context }, info) => {
  test.skip(onPreview(info.project.name), "sink locali: sulla preview il giro di §8.4 lo fa l'orchestratore");
  test.skip(info.project.name !== "desktop", "non dipende dal viewport: basta desktop");
  test.setTimeout(240_000);
  // il filtro anti-bot di PostHog scarterebbe ogni evento di Playwright
  await comeUnVisitatore(page);
  await page.goto("/");
  const { handle } = await nuovoProprietario(page, { nome: "Osservata" });
  await svuotaSink();

  // 1. il canarino come indirizzo di una partenza, scelto tra i candidati dello stub
  await page.goto(`/${handle}/modifica#partenze`);
  const partenze = page.locator("section#partenze");
  await partenze.getByLabel("Nuova partenza").fill(PARTENZA);
  await partenze.getByRole("button", { name: "Aggiungi" }).click();
  const picker = page.getByRole("dialog", { name: `Imposta l'indirizzo di ${PARTENZA}` });
  await picker.getByRole("textbox").first().fill(CANARINO.indirizzo);
  await picker.getByRole("button", { name: /cerca/i }).click();
  await picker.getByText(CANARINO.displayName).click();
  await picker.getByRole("button", { name: /conferma|usa questo/i }).click();
  await expect(partenze.getByText("indirizzo impostato", { exact: true })).toBeVisible();
  const visto = partenze.getByText(CANARINO.displayName);
  await expect(visto).toBeVisible();

  // 2a. un errore sbadato nel browser, con l'indirizzo e le coordinate a schermo nel messaggio
  const indirizzo = (await visto.textContent()) ?? "";
  expect(indirizzo).toContain("Canarini");
  await page.evaluate(([marca, testo, lat, lng]) => {
    setTimeout(() => {
      throw new Error(`${marca}: partenza ${testo} (${lat}, ${lng}) non salvata`);
    });
  }, [MARCA, indirizzo, CANARINO.lat, CANARINO.lng] as const);

  // 2b. eventi PostHog: il pageview di /modifica (e l'identify) ci sono già; uno in più dal router
  await page.getByRole("tab", { name: "I dati" }).click();
  await expect(page).toHaveURL(new RegExp(`/${handle}/dati$`));

  // 3. il sink: l'errore e i tre eventi PostHog sono arrivati (il controllo non è a vuoto)
  let evento: { event: any; envelope: string } | undefined;
  await expect
    .poll(async () => {
      evento = eventiSentry(await leggiSink()).find(e => JSON.stringify(e.event).includes(MARCA));
      return !!evento;
    }, { timeout: 20_000, message: "l'errore del browser non è arrivato al sink Sentry" })
    .toBe(true);
  await expect
    .poll(async () => {
      const ev = eventiPosthog(await leggiSink());
      return {
        modifica: ev.some(e => e.event === "$pageview" && e.properties?.$pathname === `/${handle}/modifica`),
        identify: ev.some(e => e.event === "$identify"),
        dati: ev.some(e => e.event === "$pageview" && e.properties?.$pathname === `/${handle}/dati`),
      };
    }, { timeout: 20_000, message: "gli eventi PostHog non sono arrivati al sink" })
    .toEqual({ modifica: true, identify: true, dati: true });

  // il messaggio resta leggibile, con i segnaposto al posto di indirizzo e coordinate
  const valore = (evento!.event.exception?.values ?? []).map((v: any) => v.value).join("\n");
  expect(valore).toContain(MARCA);
  expect(valore).toContain("[indirizzo]");
  expect(valore).toContain("[coords]");
  expect(evento!.event.request?.url ?? "").not.toMatch(/[?#]/);
  expect(evento!.event.user).toBeUndefined();

  // i valori dei cookie (sessione, cache, JWT di Convex) e il JWT stesso: mai nel sink
  const cookie = (await context.cookies()).filter(c => c.value.length >= 8);
  expect(cookie.map(c => c.name.replace(/^__Secure-/, ""))).toContain("better-auth.session_token");
  const tok = await page.request.get(new URL("/api/auth/convex/token", page.url()).href, { failOnStatusCode: false });
  const jwt = tok.ok() ? ((await tok.json()) as { token?: string }).token : undefined;
  expect(jwt, "il JWT di Convex della sessione").toBeTruthy();
  const valori: [string, string][] = [
    ...cookie.flatMap(c => [[`cookie ${c.name}`, c.value], [`cookie ${c.name} (decodificato)`, decodeURIComponent(c.value)]] as [string, string][]),
    // anche solo la firma o la parte iniziale di un token basta a riconoscerlo
    ...cookie.flatMap(c => c.value.split(/[.%]/).filter(p => p.length >= 16).map((p, i) => [`cookie ${c.name} parte ${i + 1}`, p] as [string, string])),
    ["JWT di Convex", jwt!],
    ...jwt!.split(".").filter(p => p.length >= 16).map((p, i) => [`JWT di Convex parte ${i + 1}`, p] as [string, string]),
  ];

  const sink = await leggiSink();
  const testi = [
    ...sink.sentry.map((s, i) => [`envelope Sentry #${i + 1}`, `${s.query}\n${s.body}`]),
    ...sink.posthog.map((r, i) => [`richiesta /ingest #${i + 1} (${r.path})`, `${r.query}\n${JSON.stringify(r.headers)}\n${r.body}`]),
  ];
  expect(testi.length).toBeGreaterThan(1);
  for (const [dove, testo] of testi) {
    // solo le etichette, mai i valori
    expect(fughe(testo), dove).toEqual([]);
    expect(valori.filter(([, v]) => testo.includes(v)).map(([e]) => e), dove).toEqual([]);
  }
  for (const r of sink.posthog) {
    expect(Object.keys(r.headers), r.path).not.toContain("cookie");
    expect(Object.keys(r.headers), r.path).not.toContain("authorization");
  }
});
