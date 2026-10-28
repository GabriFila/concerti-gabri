/* ──────────────────────────────────────────────────────────────
   Controllo fughe delle pagine (PIANO §8.2, traguardo 5).

   Il canarino (helpers/canarino.ts: testo, `display_name` dello stub e
   coordinate) è l'indirizzo di una partenza; insieme alle coordinate di
   casa di Gabri (da main:CLAUDE.md) non deve comparire:
   - nell'HTML SSR delle rotte pubbliche, da visitatore;
   - nei frame WebSocket di Convex che riceve un visitatore;
   - nelle risposte delle query pubbliche (HTTP diretto a Convex);
   - nel bundle (JS e CSS della build);
   - nei `convex logs` locali;
   e, con la sessione del proprietario (@sessione, login della corsia 3):
   - nell'HTML SSR di /<handle>/modifica visto dal proprietario (l'indirizzo
     arriva solo nel browser, dopo l'idratazione);
   - un payload di geocoding malformato non lo lascia né nei log né
     nell'errore;
   - cercato come venue, non diventa una venue e la cache delle ricerche lo
     tiene solo come hash.

   Senza sessione il canarino entra con devtools sul profilo di prova
   `e2e-fughe` (mai su gabrifila: correggerne gli indirizzi rifarebbe i km
   della parità). Solo desktop: niente dipende dal viewport.
   ────────────────────────────────────────────────────────────── */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { nuovoProprietario } from "../helpers/auth.ts";
import { CANARINO } from "../helpers/canarino.ts";
import { convexRun, whoami } from "../helpers/convex.ts";
import { fughe, logsConvex } from "../helpers/fughe.ts";
import { http } from "../helpers/http.ts";
import { vaiA } from "../helpers/modifica.ts";
import { stubNominatim } from "../helpers/nominatim.ts";
import { expect, test } from "../helpers/test.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const PROVA = "e2e-fughe";
const PARTENZA = "Casa canarino";
const ARTISTA = "Canarino in concerto";

test.describe.configure({ mode: "serial" });

/** Solo sul progetto desktop locale: nel beforeAll, così sugli altri non parte niente. */
const soloDesktop = (progetto: string) => test.skip(progetto !== "desktop", "una volta sola, in locale: non dipende dal viewport");

/** Il profilo di prova con il canarino come indirizzo e un concerto partito da lì (km calcolato). */
function preparaCanarino(): string {
  convexRun("devtools:creaProfiloDiProva", { handle: PROVA, authUserId: "e2e-fughe-utente", displayName: "Fughe" });
  convexRun("account:creaPartenzaPerTest", { handle: PROVA, name: PARTENZA });
  convexRun("devtools:setDepartureForTest", { handle: PROVA, departure: PARTENZA, address: CANARINO.displayName, lng: CANARINO.lng, lat: CANARINO.lat });
  return convexRun<string>("devtools:addEntry", {
    handle: PROVA,
    entry: { kind: "concert", date: "2025-06-01", artist: ARTISTA, venue: "Fabrique", city: "Milano", with: [], from: PARTENZA },
  });
}

/** Una query pubblica come la fa un browser anonimo (HTTP diretto al Convex locale). */
async function queryPubblica(path: string, args: Record<string, unknown>): Promise<string> {
  const res = await http(new URL("/api/query", whoami().cloudUrl).href, { data: { path, args, format: "json" } });
  expect(res.status(), path).toBe(200);
  return await res.text();
}

/** I file di testo della build servita al browser. */
function fileDelBundle(): string[] {
  const dir = join(ROOT, ".output/public");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  (function giro(d: string) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) giro(p);
      else if (/\.(m?js|css|html|json|webmanifest|txt|svg)$/i.test(n)) out.push(p);
    }
  })(dir);
  return out;
}

/** I frame WebSocket (Convex) ricevuti dalla pagina, da adesso. */
function frameWebSocket(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", ws => ws.on("framereceived", f => frames.push(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8"))));
  return frames;
}

test.describe("senza sessione", () => {
  let entryId: string | undefined;
  let logs: ReturnType<typeof logsConvex>;

  test.beforeAll(({}, info) => {
    soloDesktop(info.project.name);
    logs = logsConvex();
    entryId = preparaCanarino();
  });

  test.afterAll(() => {
    if (entryId) convexRun("devtools:removeEntry", { handle: PROVA, entryId });
  });

  test("HTML SSR delle rotte pubbliche: niente canarino né coordinate di casa", async ({ baseURL }) => {
    for (const path of ["/", `/${PROVA}`, `/${PROVA}/dati`, "/gabrifila", "/gabrifila/dati", `/${PROVA}/inesistente`]) {
      const res = await http(new URL(path, baseURL).href);
      expect(fughe(await res.text()), path).toEqual([]);
    }
    // il km del canarino invece c'è (calcolato sul server): l'archivio lo mostra
    const html = await (await http(new URL(`/${PROVA}/dati`, baseURL).href)).text();
    expect(html).toContain(ARTISTA);
  });

  test("risposte delle query pubbliche: niente canarino", async () => {
    const pagina = await queryPubblica("pages:byHandle", { handle: PROVA });
    expect(pagina).toContain(PARTENZA);
    expect(pagina).toMatch(/"km":\d/);
    expect(fughe(pagina)).toEqual([]);
    for (const [path, args] of [["pages:byHandle", { handle: "gabrifila" }], ["me:profile", {}], ["profiles:handleAvailable", { handle: PROVA }]] as const) {
      expect(fughe(await queryPubblica(path, args)), path).toEqual([]);
    }
  });

  test("il visitatore: niente canarino nella pagina né nei frame WebSocket", async ({ page }) => {
    const frames = frameWebSocket(page);
    await page.goto(`/${PROVA}/dati`);
    await expect(page.locator("#sec-archivio")).toContainText(ARTISTA);
    // la sottoscrizione è viva e porta i dati della pagina (il controllo non è a vuoto)
    await expect.poll(() => frames.join("\n")).toContain(ARTISTA);
    expect(fughe(await page.content())).toEqual([]);
    expect(fughe(frames.join("\n"))).toEqual([]);
  });

  test("bundle: niente canarino né coordinate di casa nei file serviti", () => {
    const file = fileDelBundle();
    expect(file.length, "manca .output/public: serve la build").toBeGreaterThan(0);
    const trovati = file.flatMap(f => fughe(readFileSync(f, "utf8")).map(e => `${e} in ${f.slice(ROOT.length + 1)}`));
    expect(trovati).toEqual([]);
  });

  test("convex logs della finestra: niente canarino", async () => {
    const testo = await logs.ferma();
    expect(testo).toContain("Watching logs");
    // la finestra comprende davvero le funzioni del test
    expect(testo).toContain("devtools:setDepartureForTest");
    expect(fughe(testo)).toEqual([]);
  });
});

test.describe("con la sessione del proprietario", { tag: "@sessione" }, () => {
  let spegniStub: () => void = () => {};
  test.beforeAll(async ({}, info) => {
    soloDesktop(info.project.name);
    spegniStub = await stubNominatim();
  });
  test.afterAll(() => spegniStub());

  test("SSR di /modifica, payload malformato e ricerca di venue: il canarino non esce", async ({ page }) => {
    test.setTimeout(240_000);
    const logs = logsConvex();
    const { handle } = await nuovoProprietario(page, { nome: "Fughe" });
    await page.goto(`/${handle}/modifica#partenze`);
    const partenze = page.locator("section#partenze");

    // una partenza col canarino, scelto tra i candidati dello stub
    await partenze.getByLabel("Nuova partenza").fill(PARTENZA);
    await partenze.getByRole("button", { name: "Aggiungi" }).click();
    const picker = page.getByRole("dialog", { name: `Imposta l'indirizzo di ${PARTENZA}` });
    await picker.getByRole("textbox").first().fill(CANARINO.indirizzo);
    await picker.getByRole("button", { name: /cerca/i }).click();
    await picker.getByText(CANARINO.displayName).click();
    await picker.getByRole("button", { name: /conferma|usa questo/i }).click();
    await expect(partenze.getByText("indirizzo impostato", { exact: true })).toBeVisible();
    // il proprietario lo vede, ma solo nel browser
    await expect(partenze.getByText(CANARINO.displayName)).toBeVisible();

    // l'HTML SSR della stessa pagina, con la stessa sessione: niente canarino
    const ssr = await page.evaluate(async () => await (await fetch(location.pathname, { credentials: "same-origin" })).text());
    expect(ssr).toContain('id="partenze"');
    expect(fughe(ssr)).toEqual([]);

    // payload malformato: un errore leggibile, senza il canarino
    await partenze.getByRole("button", { name: `Correggi l'indirizzo di ${PARTENZA}` }).click();
    const correzione = page.getByRole("dialog", { name: `Correggi l'indirizzo di ${PARTENZA}` });
    await correzione.getByRole("textbox").first().fill(`${CANARINO.indirizzo} malformato`);
    await correzione.getByRole("button", { name: /cerca/i }).click();
    const errore = correzione.getByRole("alert").first();
    await expect(errore).toBeVisible();
    expect(fughe((await errore.textContent()) ?? "")).toEqual([]);
    await correzione.getByRole("button", { name: "Chiudi" }).click();

    // scritto come venue nuova: sembra un indirizzo, quindi «Usa questa venue» resta spento
    // (e il server lo rifiuta comunque): niente venue col canarino nel catalogo pubblico
    await vaiA(page, "concerti");
    await page.locator("section#concerti").getByRole("button", { name: "Aggiungi un concerto" }).click();
    const modale = page.getByRole("dialog", { name: "Nuovo concerto" });
    await modale.getByLabel("Cerca una venue").fill(CANARINO.indirizzo);
    await modale.getByLabel("Città della venue").fill("Genova");
    await expect(modale.getByRole("alert").filter({ hasText: "Sembra un indirizzo" })).toBeVisible();
    await expect(modale.getByRole("button", { name: "Usa questa venue" })).toBeDisabled();
    expect(fughe((await modale.locator(".mod-venue").textContent()) ?? "")).toEqual([]);
    await modale.getByRole("button", { name: "Chiudi" }).click();
    expect(fughe(JSON.stringify(convexRun("venues:cercaNelCatalogo", { query: "Canarini" })))).toEqual([]);

    // e la pagina pubblica del proprietario resta pulita
    expect(fughe(await queryPubblica("pages:byHandle", { handle }))).toEqual([]);
    expect(fughe(await logs.ferma())).toEqual([]);
  });
});
