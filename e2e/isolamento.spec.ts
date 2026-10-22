/* ──────────────────────────────────────────────────────────────
   Isolamento tra due proprietari (PIANO traguardo 7, §4.7.5):
   - B, dalla UI, su /<A>/modifica viene rimandato a /<A>;
   - la API key di B scrive solo su B;
   - gli id di A passati da B (modifica, cancella, annulla, leggi) danno
     `not_found`, lo stesso errore di un id inesistente;
   - alla fine A è identica a prima.
   Serve il login (corsia 3): tag @sessione.
   ────────────────────────────────────────────────────────────── */

import { nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { strumento } from "./helpers/mcp.ts";
import { expect, test } from "./helpers/test.ts";

test.beforeEach(({}, info) => {
  test.skip(info.project.name === "mobile", "MCP: basta una volta");
});

test("B non tocca A: né dalla UI né con la sua API key", { tag: "@sessione" }, async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const pa = await (await browser.newContext()).newPage();
  const pb = await (await browser.newContext()).newPage();
  const a = await nuovoProprietario(pa);
  const b = await nuovoProprietario(pb);
  const chiaveA = convexRun<{ chiave: string }>("agents:chiaveDiProva", { handle: a.handle, nome: "A" }).chiave;
  const chiaveB = convexRun<{ chiave: string }>("agents:chiaveDiProva", { handle: b.handle, nome: "B" }).chiave;

  // A ha un concerto, una persona e una voce di registro
  await strumento(baseURL, chiaveA, "add_person", { name: "Lu" });
  const concertoA = (await strumento(baseURL, chiaveA, "add_concert", { kind: "concert", date: "2025-05-10", artist: "Di A", venue: "Fabrique", city: "Milano", with: ["Lu"] })).dati.id;
  const personaA = (await strumento(baseURL, chiaveA, "list_people", {})).dati.people[0].id;
  const votoA = (await strumento(baseURL, chiaveA, "list_activity", {})).dati.voci[0].id;
  // il risultato dello strumento, non il corpo: l'id JSON-RPC cambia a ogni chiamata
  const primaA = (await strumento(baseURL, chiaveA, "list_concerts", {})).dati;

  // dalla UI: B su /<A>/modifica torna alla pagina pubblica di A
  await pb.goto(`/${a.handle}/modifica`);
  await expect(pb).toHaveURL(new RegExp(`/${a.handle}$`));

  // la chiave di B scrive solo su B
  const suB = await strumento(baseURL, chiaveB, "add_concert", { kind: "concert", date: "2025-06-01", artist: "Di B", venue: "Fabrique", city: "Milano" });
  expect(suB.isError, suB.testo).toBe(false);
  expect((await strumento(baseURL, chiaveB, "list_concerts", {})).dati.concerts.map((c: { artist: string }) => c.artist)).toEqual(["Di B"]);

  // gli id di A, manomessi o passati da B: not_found come un id inesistente
  const tentativi: [string, Record<string, unknown>][] = [
    ["get_concert", { id: concertoA }],
    ["update_concert", { id: concertoA, patch: { artist: "Preso" } }],
    ["delete_concert", { id: concertoA, confirm: true }],
    ["rename_person", { id: personaA, name: "Preso" }],
    ["delete_person", { id: personaA, confirm: true }],
    ["undo", { activityId: votoA }],
    ["get_concert", { id: `${concertoA.slice(0, -2)}zz` }],
  ];
  for (const [nome, args] of tentativi) {
    const r = await strumento(baseURL, chiaveB, nome, args);
    expect(r.isError, nome).toBe(true);
    expect(r.dati.code, nome).toBe("not_found");
  }
  expect((await strumento(baseURL, chiaveA, "list_concerts", {})).dati).toEqual(primaA);
});
