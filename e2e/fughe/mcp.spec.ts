/* ──────────────────────────────────────────────────────────────
   Controllo fughe di MCP (PIANO §8.2, traguardo 7). La partenza "Casa" ha
   l'indirizzo canarino (devtools:setDepartureForTest, come se l'avesse
   confermato il proprietario) e un concerto ne usa i km. Il canarino
   (testo, display_name dello stub, coordinate a 4/5/7 decimali, anche
   URL-encoded e JSON-escaped) non deve comparire in:
   - nessuna risposta di lettura di /mcp;
   - nessuna risposta a una chiamata agente malformata (indirizzo nei campi
     sbagliati, strumento inesistente, JSON rotto), errori compresi;
   - i log del deployment Convex locale durante il test.
   Negli stessi posti non deve comparire nemmeno la API key di prova (in
   chiaro, JSON-escaped e URL-encoded), che pure viaggia in ogni chiamata.
   Serve il login (corsia 3): tag @sessione.
   ────────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { nuovoProprietario } from "../helpers/auth.ts";
import { CANARINO, formeCanarino } from "../helpers/canarino.ts";
import { convexRun } from "../helpers/convex.ts";
import { rpcMcp, strumento } from "../helpers/mcp.ts";
import { stubNominatim } from "../helpers/nominatim.ts";
import { expect, test } from "../helpers/test.ts";

const ROOT = join(import.meta.dirname, "..", "..");

/** `convex logs` sul deployment locale, per la durata del test (via wt exec, con .env.worktree). */
function ascoltaLog() {
  const figlio = spawn(process.execPath, [join(ROOT, "scripts/wt.mjs"), "exec", "--", "pnpm", "exec", "convex", "logs", "--env-file", ".env.worktree"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  let testo = "";
  figlio.stdout.on("data", d => (testo += String(d)));
  figlio.stderr.on("data", d => (testo += String(d)));
  return {
    async fine() {
      await new Promise(r => setTimeout(r, 3000));
      try {
        process.kill(-figlio.pid!, "SIGTERM");
      } catch {
        figlio.kill("SIGTERM");
      }
      return testo;
    },
  };
}

/** Le forme di un segreto che potrebbe uscire: in chiaro, JSON-escaped, URL-encoded. */
const formeDi = (s: string) => [...new Set([s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s)])];

const senzaFughe = (dove: string, testo: string, chiave: string) => {
  for (const f of formeCanarino()) expect(testo.includes(f), `${dove}: contiene una forma del canarino`).toBe(false);
  // il messaggio non ripete la chiave
  for (const f of formeDi(chiave)) expect(testo.includes(f), `${dove}: contiene la API key`).toBe(false);
};

test.beforeEach(({}, info) => {
  test.skip(info.project.name === "mobile", "MCP: basta una volta");
});

// search_venue chiede a Nominatim: in locale risponde lo stub
let spegniStub: () => void = () => {};
test.beforeAll(async ({}, info) => {
  if (info.project.name !== "mobile") spegniStub = await stubNominatim();
});
test.afterAll(() => spegniStub());

test("il canarino e la API key non escono da MCP né dai log", { tag: "@sessione" }, async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  const { handle } = await nuovoProprietario(page);
  const { chiave } = convexRun<{ chiave: string }>("agents:chiaveDiProva", { handle, nome: "fughe" });
  const log = ascoltaLog();
  const risposte: [string, string][] = [];
  const registra = (dove: string, r: { testo: string }) => risposte.push([dove, r.testo]);

  registra("add_departure", await strumento(baseURL, chiave, "add_departure", { name: "Casa" }));
  convexRun("devtools:setDepartureForTest", { handle, departure: "Casa", address: CANARINO.indirizzo, lng: CANARINO.lng, lat: CANARINO.lat });
  const add = await strumento(baseURL, chiave, "add_concert", { kind: "concert", date: "2025-05-10", artist: "Fughe", venue: "Fabrique", city: "Milano", from: "Casa" });
  registra("add_concert", add);
  expect(add.isError, add.testo).toBe(false);

  // tutte le letture
  const letture: [string, Record<string, unknown>][] = [
    ["get_profile", {}], ["list_concerts", {}], ["list_concerts", { da_completare: true }], ["get_concert", { id: add.dati.id }],
    ["list_people", {}], ["list_departures", {}], ["list_gifters", {}], ["list_wishlist", {}], ["get_stats", {}],
    ["list_activity", {}], ["search_venue", { query: "Fabrique Milano" }],
  ];
  let concerto: { km?: number } | undefined;
  for (const [nome, args] of letture) {
    const r = await strumento(baseURL, chiave, nome, args);
    expect(r.isError, `${nome}: ${r.testo.slice(0, 200)}`).toBe(false);
    registra(nome, r);
    if (nome === "get_concert") concerto = r.dati;
  }
  // il km c'è (calcolato dall'indirizzo), le coordinate no (il corpo può essere SSE: si legge il risultato già estratto)
  expect(concerto?.km).toBeGreaterThan(0);

  // chiamate malformate: l'indirizzo nei campi sbagliati, strumenti e corpi rotti
  const malformate: [string, Record<string, unknown>][] = [
    ["add_concert", { kind: "concert", date: CANARINO.indirizzo, artist: "X", venue: CANARINO.displayName, city: "Genova", from: CANARINO.indirizzo, address: CANARINO.indirizzo, lat: CANARINO.lat, lng: CANARINO.lng }],
    ["update_concert", { id: add.dati.id, patch: { from: CANARINO.indirizzo, venue: CANARINO.indirizzo, city: "Genova" } }],
    ["search_venue", { query: `${CANARINO.lat}, ${CANARINO.lng}`.repeat(10) }],
    ["import_concerts", { formato: "csv", contenuto: `tipo,data,artista,venue,citta,partenza\nconcerto,${CANARINO.lat},X,"${CANARINO.indirizzo}",Genova,"${CANARINO.indirizzo}"` }],
    ["undo", { activityId: CANARINO.indirizzo }],
    // per ultima: un indirizzo come NOME di partenza (diventa un nome, ma la risposta non lo ripete)
    ["add_departure", { name: CANARINO.indirizzo, address: CANARINO.indirizzo }],
  ];
  for (const [nome, args] of malformate) registra(`${nome} (malformata)`, await strumento(baseURL, chiave, nome, args));
  registra("strumento inesistente", await rpcMcp(baseURL, "tools/call", { name: "get_address", arguments: { q: CANARINO.indirizzo } }, { "x-api-key": chiave }));
  // un corpo JSON rotto (fetch di Node diretto: solo in locale, niente bypass)
  const rotto = await fetch(new URL("/mcp", baseURL), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-api-key": chiave },
    body: `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"add_concert","arguments":{"date":"${CANARINO.indirizzo}"`,
  });
  risposte.push(["JSON rotto", await rotto.text()]);

  for (const [dove, testo] of risposte) senzaFughe(dove, testo, chiave);
  senzaFughe("convex logs", await log.fine(), chiave);
});
