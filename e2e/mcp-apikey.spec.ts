/* ──────────────────────────────────────────────────────────────
   MCP con una API key (PIANO traguardo 7), su un proprietario nuovo:
   add_concert, update_concert e list_concerts via JSON-RPC; la pagina
   pubblica si aggiorna dal vivo; list_departures dice solo nome e stato;
   un x-api-key non ottiene un token Convex da /api/auth/convex/token.
   La chiave nasce con agents:chiaveDiProva (solo sviluppo); il secondo
   test la crea da #agenti: mostrata una volta sola, poi elencata e
   revocabile. Serve il login (corsia 3): tag @sessione.
   ────────────────────────────────────────────────────────────── */

import { nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { strumento } from "./helpers/mcp.ts";
import { expect, test } from "./helpers/test.ts";

const ARTISTA = "Canarino via MCP";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "MCP: basta una volta");
});

test("API key: scrive, legge e la pagina si aggiorna dal vivo", { tag: "@sessione" }, async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000);
  const { handle } = await nuovoProprietario(page);
  const { chiave } = convexRun<{ chiave: string }>("agents:chiaveDiProva", { handle, nome: "e2e" });

  // un visitatore guarda la pagina pubblica mentre l'agente scrive
  const visitatore = await (await browser.newContext()).newPage();
  await visitatore.goto(`/${handle}/dati`);

  expect((await strumento(baseURL, chiave, "add_departure", { name: "Casa" })).isError).toBe(false);
  expect((await strumento(baseURL, chiave, "add_person", { name: "Lu" })).isError).toBe(false);
  const add = await strumento(baseURL, chiave, "add_concert", { kind: "concert", date: "2025-05-10", artist: ARTISTA, venue: "Fabrique", city: "Milano", with: ["Lu"], from: "Casa" });
  expect(add.isError, add.testo).toBe(false);
  // la partenza non ha l'indirizzo: avviso e link assoluto a #partenze
  expect(add.dati).toMatchObject({ avviso: "departure_address_missing", fix: expect.stringMatching(new RegExp(`^https?://[^/]+/${handle}/modifica#partenze$`)) });
  await expect(visitatore.getByText(ARTISTA).first()).toBeVisible({ timeout: 20_000 });

  const upd = await strumento(baseURL, chiave, "update_concert", { id: add.dati.id, patch: { voto: 5, vicinanza: 6, canzoniNote: "na" } });
  expect(upd.isError, upd.testo).toBe(false);
  const elenco = await strumento(baseURL, chiave, "list_concerts", {});
  expect(elenco.dati.concerts).toEqual([expect.objectContaining({ id: add.dati.id, artist: ARTISTA, voto: 5, vicinanza: 6, canzoniNote: "na", with: ["Lu"], from: "Casa", kmPending: true })]);

  const partenze = await strumento(baseURL, chiave, "list_departures", {});
  expect(partenze.dati).toEqual({ departures: [{ id: expect.any(String), name: "Casa", stato: "mancante" }] });
  expect(partenze.testo).not.toMatch(/address|indirizzo|"lat"|"lng"/);

  // la chiave non è una sessione: niente JWT di Convex
  for (const headers of [{ "x-api-key": chiave }, { authorization: `Bearer ${chiave}` }] as Record<string, string>[]) {
    const tok = await http(new URL("/api/auth/convex/token", baseURL).href, { headers });
    const testo = await tok.text();
    expect(tok.status() === 200 && /"token"\s*:\s*"ey/.test(testo), testo.slice(0, 120)).toBe(false);
  }
});

test("API key da #agenti: mostrata una volta, elencata, revocabile", { tag: "@sessione" }, async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const { handle } = await nuovoProprietario(page);
  await page.goto(`/${handle}/modifica#agenti`);
  const sezione = page.locator("#agenti");
  await expect(sezione.getByTestId("mcp-url")).toHaveText(new URL("/mcp", baseURL).href);
  await expect(sezione.getByRole("textbox", { name: "Prompt per l'agente" })).toHaveValue(new RegExp(`/${handle}`));

  await sezione.getByLabel("Nome").fill("Script e2e");
  await sezione.getByRole("button", { name: "Crea API key" }).click();
  const chiave = (await sezione.getByTestId("nuova-chiave").textContent())!.trim();
  expect(chiave).toMatch(/^cgk_[A-Za-z]{64}$/);
  expect((await strumento(baseURL, chiave, "get_profile", {})).dati).toMatchObject({ handle });

  // chiusa la finestra, la chiave non si vede più: resta il nome con l'inizio
  await sezione.getByRole("button", { name: "Fatto, l'ho copiata" }).click();
  await expect(sezione.getByTestId("nuova-chiave")).toHaveCount(0);
  const riga = sezione.getByRole("list", { name: "Elenco delle API key" }).getByRole("listitem").filter({ hasText: "Script e2e" });
  await expect(riga).toContainText(`${chiave.slice(0, 10)}…`);
  await page.reload();
  await expect(page.locator("#agenti")).not.toContainText(chiave);

  // revocata: /mcp risponde 401 subito
  const rigaDopo = page.locator("#agenti").getByRole("list", { name: "Elenco delle API key" }).getByRole("listitem").filter({ hasText: "Script e2e" });
  await rigaDopo.getByRole("button", { name: "Revoca Script e2e" }).click();
  await rigaDopo.getByRole("button", { name: "Sì, revoca" }).click();
  await expect(rigaDopo).toHaveCount(0);
  expect((await strumento(baseURL, chiave, "get_profile", {})).res.status()).toBe(401);
});
