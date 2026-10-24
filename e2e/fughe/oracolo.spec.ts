/* ──────────────────────────────────────────────────────────────
   Controllo fughe dell'Oracolo (PIANO §8.2, traguardo 6).

   1. Il canarino è l'indirizzo di una partenza del profilo di prova
      `e2e-fughe-oracolo` (mai su gabrifila: correggerne gli indirizzi
      rifarebbe i km della parità), con un concerto partito da lì. Una
      domanda sull'indirizzo all'Oracolo di quella pagina: né l'SSE, né la
      trascrizione salvata (chat:getThread), né i `convex logs` contengono
      il canarino o le coordinate di casa di Gabri.
   2. (@sessione) La proprietaria SCRIVE il canarino nella chat
      dell'Oracolo in scrittura, in /<handle>/modifica: il thread esiste
      ed è privato, quindi il canarino non compare in chat:listThreads,
      chat:getThread né nell'SSR pubblico di /<handle>?chat=<id>; e
      nemmeno nel log del server Start (i log delle funzioni Vercel).
   3. (@sessione, ORACOLO_FAKE=1) La scheda dell'Oracolo salvata dalla
      partenza col canarino come indirizzo: i km si calcolano subito (A1),
      e il risultato porta solo il nome della partenza e i km. Né l'SSE
      (proposta e ripresa), né i corpi delle POST (la ripresa con la
      scheda), né chat:myThread (la trascrizione privata, letta con la
      sessione), né la pagina, né i frame WebSocket di Convex, né i log
      del server Start e di Convex contengono il canarino o le coordinate
      di casa. I controlli non sono a vuoto: ognuno trova il nome della
      partenza (o i km) dove deve esserci.

   Serve un modello: Gemini (GEMINI_API_KEY, una chiamata per test) oppure
   l'Oracolo finto (ORACOLO_FAKE=1, solo in locale con E2E=1). Senza nessuno
   dei due i test si saltano; il 3 vuole il copione (la scheda si salva da
   un clic). Una volta sola (desktop): non dipendono dal viewport. `convexRun` restituisce `undefined` quando la funzione dà null
   (la CLI non stampa niente): per questo i controlli passano da `oNull`.
   ────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { esci, nuovoProprietario, unico } from "../helpers/auth.ts";
import { CANARINO } from "../helpers/canarino.ts";
import { convexRun, whoami } from "../helpers/convex.ts";
import { fughe, logServerStart, logsConvex } from "../helpers/fughe.ts";
import { http } from "../helpers/http.ts";
import { expect, test } from "../helpers/test.ts";

const conModello = () => !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.ORACOLO_FAKE === "1");

const PROVA = "e2e-fughe-oracolo";
const PARTENZA = "Casa canarino";

/** Una funzione Convex che può dare null (la CLI lo stampa come niente). */
const oNull = <T>(fn: string, args: Record<string, unknown>) => convexRun<T | undefined>(fn, args) ?? null;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "una volta sola, sul progetto desktop in locale");
  test.skip(!conModello(), "serve GEMINI_API_KEY (fnox exec) oppure ORACOLO_FAKE=1");
  // gli e2e fanno molti turni dallo stesso IP: si riparte dai limiti pieni
  convexRun("chat:azzeraLimitiPerTest");
});

test("alla domanda sull'indirizzo, SSE, trascrizione e log di Convex non contengono il canarino", async ({ baseURL }) => {
  test.setTimeout(120_000);
  convexRun("devtools:creaProfiloDiProva", { handle: PROVA, authUserId: "e2e-fughe-oracolo-utente", displayName: "Fughe" });
  convexRun("account:creaPartenzaPerTest", { handle: PROVA, name: PARTENZA });
  convexRun("devtools:setDepartureForTest", { handle: PROVA, departure: PARTENZA, address: CANARINO.indirizzo, lng: CANARINO.lng, lat: CANARINO.lat });
  const entryId = convexRun<string>("devtools:addEntry", {
    handle: PROVA,
    entry: { kind: "concert", date: "2025-06-01", artist: "Canarino all'Oracolo", venue: "Fabrique", city: "Milano", with: [], from: PARTENZA },
  });
  const logs = logsConvex();
  const server = logServerStart();
  const threadId = randomUUID();
  try {
    const res = await http(new URL("/api/chat", baseURL).href, {
      headers: { origin: new URL(baseURL!).origin },
      data: {
        threadId,
        messages: [{ role: "user", content: "Da che indirizzo parte Fughe per i concerti? Dimmi via, numero civico e coordinate." }],
        forwardedProps: { handle: PROVA, writeKey: randomUUID() },
      },
      timeout: 100_000,
    });
    expect(res.status()).toBe(200);
    const sse = await res.text();
    expect(sse).toContain("RUN_FINISHED");
    expect(fughe(sse)).toEqual([]);

    const salvato = oNull<unknown>("chat:getThread", { handle: PROVA, threadId });
    expect(salvato, "la trascrizione è salvata ed è pubblica").not.toBeNull();
    expect(fughe(JSON.stringify(salvato))).toEqual([]);
    expect(fughe(await logs.ferma()), "convex logs").toEqual([]);
    expect(fughe(await server.ferma()), "log del server Start").toEqual([]);
  } finally {
    convexRun("devtools:removeEntry", { handle: PROVA, entryId });
  }
});

test("@sessione il canarino scritto in modalità scrittura resta privato", async ({ page, baseURL }) => {
  test.setTimeout(180_000);
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Fughe" });
  const richieste: { threadId?: string }[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/chat/scrittura") richieste.push(r.postDataJSON());
  });
  // la proprietaria lo scrive nella chat in scrittura di /modifica (sessione e Origin della pagina)
  await page.goto(`/${handle}/modifica`);
  const server = logServerStart();
  await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
  const chat = page.getByRole("dialog", { name: "L'Oracolo in scrittura" });
  await chat.getByRole("textbox", { name: "Messaggio per l'Oracolo" }).fill(`Ricordati che parto sempre da ${CANARINO.indirizzo} (${CANARINO.lat}, ${CANARINO.lng}).`);
  await chat.getByRole("button", { name: "Invia" }).click();
  // la risposta arriva (Gemini o il copione finto) e il giro finisce, senza errori
  await expect(chat.locator(".chat-row.ai").last()).toBeVisible({ timeout: 150_000 });
  await expect(chat.locator(".chat-dots")).toHaveCount(0, { timeout: 150_000 });
  await expect(chat.locator(".chat-error")).toHaveCount(0);
  const threadId = richieste[0]?.threadId;
  expect(threadId, "la chat è partita").toBeTruthy();
  // né la richiesta né le chiamate agli strumenti lasciano il canarino nei log del server
  expect(fughe(await server.ferma()), "log del server Start").toEqual([]);
  await expect.poll(() => oNull("chat:visibilitaPerTest", { threadId: threadId! }), { timeout: 30_000 }).toBe("proprietario");
  await esci(page);

  // il thread c'è, ed è `proprietario`: nessuna query pubblica lo vede
  expect(convexRun<unknown[]>("chat:listThreads", { handle })).toEqual([]);
  expect(oNull("chat:getThread", { handle, threadId: threadId! })).toBeNull();
  // l'SSR pubblico del link condiviso, da visitatore (fetch senza cookie)
  const html = await (await http(new URL(`/${handle}?chat=${threadId}`, baseURL).href)).text();
  expect(fughe(html)).toEqual([]);
});

/** Le POST a /api/chat/scrittura della pagina: i corpi delle richieste e il testo delle risposte (l'SSE). */
function registraScrittura(page: Page) {
  const corpi: string[] = [];
  const risposte: Promise<string>[] = [];
  const diScrittura = (url: string, metodo: string) => metodo === "POST" && new URL(url).pathname === "/api/chat/scrittura";
  page.on("request", r => {
    if (diScrittura(r.url(), r.method())) corpi.push(r.postData() ?? "");
  });
  page.on("response", r => {
    if (diScrittura(r.url(), r.request().method())) risposte.push(r.text().catch(() => ""));
  });
  return { corpi, sse: async () => (await Promise.all(risposte)).join("\n") };
}

/** I frame WebSocket (Convex) ricevuti dalla pagina, da adesso. */
function frameWebSocket(page: Page): string[] {
  const frames: string[] = [];
  page.on("websocket", ws => ws.on("framereceived", f => frames.push(typeof f.payload === "string" ? f.payload : f.payload.toString("utf8"))));
  return frames;
}

/** chat:myThread come lo legge la dashboard: con il JWT di Convex della sessione della pagina. */
async function threadPrivato(page: Page, threadId: string): Promise<string> {
  const tok = await page.request.get(new URL("/api/auth/convex/token", page.url()).href, { failOnStatusCode: false });
  const token = tok.ok() ? ((await tok.json()) as { token?: string }).token : undefined;
  expect(token, "il JWT di Convex della sessione").toBeTruthy();
  const res = await page.request.post(new URL("/api/query", process.env.VITE_CONVEX_URL || whoami().cloudUrl).href, {
    headers: { authorization: `Bearer ${token}` },
    data: { path: "chat:myThread", args: { input: { threadId } }, format: "json" },
    failOnStatusCode: false,
  });
  expect(res.status(), "chat:myThread").toBe(200);
  const testo = await res.text();
  expect(JSON.parse(testo).status, "chat:myThread").toBe("success");
  return testo;
}

test("@sessione la scheda salvata dalla partenza col canarino: km subito, e il canarino non esce da nessuna parte", async ({ page }) => {
  test.skip(process.env.ORACOLO_FAKE !== "1", "la scheda si salva col copione finto: ORACOLO_FAKE=1");
  test.setTimeout(240_000);
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Fughe" });
  convexRun("account:creaPartenzaPerTest", { handle, name: PARTENZA });
  convexRun("devtools:setDepartureForTest", { handle, departure: PARTENZA, address: CANARINO.indirizzo, lng: CANARINO.lng, lat: CANARINO.lat });
  const artista = `Scheda in partenza ${unico()}`;
  const scrittura = registraScrittura(page);
  const frames = frameWebSocket(page);
  const logs = logsConvex();
  const server = logServerStart();

  await page.goto(`/${handle}/modifica`);
  await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();
  const chat = page.getByRole("dialog", { name: "L'Oracolo in scrittura" });
  await chat.getByRole("textbox", { name: "Messaggio per l'Oracolo" }).fill(`Ho visto ${artista} al Fabrique partita da ${PARTENZA}, voto 4`);
  await chat.getByRole("button", { name: "Invia" }).click();
  // la scheda: la partenza c'è, con l'indirizzo impostato (solo lo stato, mai l'indirizzo)
  const scheda = chat.getByRole("group", { name: `Scheda: nuovo concerto ${artista}` });
  await expect(scheda.getByRole("button", { name: new RegExp(`^Partenza ${PARTENZA} · indirizzo impostato`) })).toBeVisible();
  await scheda.getByRole("button", { name: "Salva concerto" }).click();
  await expect(chat.getByText("Fatto: concerto aggiunto.")).toBeVisible();
  // i km subito (A1), nella conferma e nei dati
  const conferma = chat.locator(".scheda-esito").filter({ hasText: `Aggiunto · ${artista}` });
  await expect(conferma).toContainText(new RegExp(`\\d+ km da ${PARTENZA}`));
  const pagina = convexRun<{ entries: Record<string, unknown>[]; departures: { _id: string; name: string }[] } | undefined>("pages:byHandle", { handle });
  const salvato = (pagina?.entries ?? []).find(e => e.artist === artista);
  const casa = (pagina?.departures ?? []).find(d => d.name === PARTENZA);
  expect(casa, "la partenza della pagina").toBeTruthy();
  expect(salvato).toMatchObject({ departureId: casa!._id, voto: 4 });
  expect(typeof salvato?.km, "km calcolati al salvataggio").toBe("number");
  expect(salvato?.kmPending).toBeFalsy();
  await expect(chat.locator(".chat-dots")).toHaveCount(0, { timeout: 30_000 });
  await expect(chat.locator(".chat-error")).toHaveCount(0);

  // l'SSE della proposta e della ripresa: il risultato ha il nome della partenza e i km, mai il canarino
  const sse = await scrittura.sse();
  expect(sse).toContain("propose_concert");
  expect(sse).toContain(PARTENZA);
  expect(sse).toMatch(/km\\?":\d+/);
  expect(fughe(sse), "SSE").toEqual([]);
  // i corpi delle POST: la ripresa porta la scheda (la partenza per nome)
  expect(scrittura.corpi.length).toBeGreaterThanOrEqual(2);
  const ripresa = scrittura.corpi.find(c => c.includes("\"resume\""));
  expect(ripresa, "la ripresa col Salva").toBeTruthy();
  expect(ripresa).toContain(PARTENZA);
  expect(fughe(scrittura.corpi.join("\n")), "corpi delle POST").toEqual([]);
  // la trascrizione privata (chat:myThread), letta come la dashboard
  const threadId = (JSON.parse(scrittura.corpi[0]) as { threadId?: string }).threadId;
  expect(threadId, "la chat è partita").toBeTruthy();
  const trascrizione = await threadPrivato(page, threadId!);
  expect(trascrizione).toContain(PARTENZA);
  expect(fughe(trascrizione), "chat:myThread").toEqual([]);
  // la pagina e i frame WebSocket di Convex (le query della scheda: partenze, concerti, conferma)
  expect(frames.join("\n")).toContain(PARTENZA);
  expect(fughe(frames.join("\n")), "frame WebSocket").toEqual([]);
  expect(fughe(await page.content()), "pagina").toEqual([]);
  // i log: Convex (salvaScheda, km) e il server Start (propose_concert logga solo metadati)
  const logConvex = await logs.ferma();
  expect(logConvex, "i log di Convex hanno il salvataggio").toContain("salvaScheda");
  expect(fughe(logConvex), "convex logs").toEqual([]);
  const logStart = await server.ferma();
  expect(logStart).toContain("propose_concert");
  expect(fughe(logStart), "log del server Start").toEqual([]);
});
