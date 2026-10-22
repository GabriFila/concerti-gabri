/* ──────────────────────────────────────────────────────────────
   L'Oracolo dal vivo (@gemini: spende chiamate Gemini vere).

   1. /gabrifila: "quanti concerti ho visto nel 2025?" deve far girare
      `query_concerts` sul server: nell'SSE ci sono TOOL_CALL_START/END di
      quello strumento e il suo TOOL_CALL_RESULT, poi la risposta col
      numero (16 nei dati statici).
   2. Un'altra pagina (solo in locale: un profilo di prova con due concerti
      nel 2025): la stessa domanda conta i concerti di QUELLA pagina.
   3. (@sessione, solo in locale) L'Oracolo in scrittura: una proprietaria
      nuova chiede di aggiungere un concerto, poi di annullare l'ultima
      modifica; il concerto compare, l'annullamento aspetta il suo sì
      (annullare un'aggiunta la cancella) e col sì sparisce.

   In locale serve GEMINI_API_KEY nell'ambiente del server, cioè di
   Playwright: `node scripts/wt.mjs exec -- pnpm e2e --grep @gemini` (wt.mjs
   la prende dal .env.local del worktree). Senza, si salta; con
   ORACOLO_FAKE=1 pure (lì risponde il copione).
   ────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import type { TestInfo } from "@playwright/test";
import { nuovoProprietario } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

interface SseEvent { type: string; [k: string]: any }

const parseSse = (text: string): SseEvent[] =>
  text.split("\n")
    .filter(l => l.startsWith("data: "))
    .map(l => l.slice(6).trim())
    .filter(l => l && l !== "[DONE]")
    .map(l => JSON.parse(l) as SseEvent);

/** Gemini vero: sulla preview c'è sempre; in locale serve la chiave e niente copione finto. */
function serveGemini(testInfo: TestInfo) {
  test.skip(
    !onPreview(testInfo.project.name) && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY,
    "GEMINI_API_KEY assente: lanciare con `node scripts/wt.mjs exec -- pnpm e2e --grep @gemini`",
  );
  // con l'Oracolo finto (ORACOLO_FAKE=1) la risposta è un copione: qui serve Gemini vero
  test.skip(!onPreview(testInfo.project.name) && process.env.ORACOLO_FAKE === "1", "ORACOLO_FAKE=1: niente Gemini");
}

/** I risultati di query_concerts nell'SSE (lo strumento è girato sul server). */
function conteggiDiQueryConcerts(events: SseEvent[]): unknown[] {
  // TanStack AI 0.71 (AG-UI): il nome sta in `toolCallName`; fino alla 0.40 era `toolName`
  const starts = events.filter(e => e.type === "TOOL_CALL_START" && (e.toolCallName ?? e.toolName) === "query_concerts");
  expect(starts.length, "TOOL_CALL_START di query_concerts").toBeGreaterThan(0);
  const ids = new Set(starts.map(e => e.toolCallId));
  expect(events.some(e => e.type === "TOOL_CALL_END" && ids.has(e.toolCallId)), "TOOL_CALL_END").toBe(true);
  const results = events.filter(e => e.type === "TOOL_CALL_RESULT" && ids.has(e.toolCallId));
  expect(results.length, "TOOL_CALL_RESULT: lo strumento è girato sul server").toBeGreaterThan(0);
  return results.map(e => { try { return JSON.parse(e.content).count; } catch { return undefined; } });
}

const risposta = (events: SseEvent[]) => events.filter(e => e.type === "TEXT_MESSAGE_CONTENT").map(e => e.delta ?? "").join("");

test("@gemini quanti concerti ho visto nel 2025? → query_concerts sul server", async ({ baseURL }, testInfo) => {
  serveGemini(testInfo);
  test.setTimeout(90_000);
  // fetch di Node (helpers/http.ts), mai il `request` di Playwright: sulla preview porta il bypass
  const res = await http(new URL("/api/chat", baseURL).href, {
    headers: { origin: new URL(baseURL!).origin },
    // l'Oracolo è per pagina: il widget manda l'handle in forwardedProps
    data: { messages: [{ role: "user", content: "quanti concerti ho visto nel 2025?" }], forwardedProps: { handle: "gabrifila" } },
    timeout: 80_000,
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/event-stream");
  const events = parseSse(await res.text());
  const types = events.map(e => e.type);
  testInfo.annotations.push({ type: "sse", description: [...new Set(types)].join(", ") });

  expect(conteggiDiQueryConcerts(events)).toContain(16);

  expect(types).toContain("RUN_FINISHED");
  expect(types).not.toContain("RUN_ERROR");
  expect(risposta(events)).toMatch(/16|sedici/i);
});

const PAGINA_SSE = "e2e-oracolo-sse";

test("@gemini un'altra pagina: query_concerts conta i concerti di quella pagina", async ({ baseURL }, testInfo) => {
  test.skip(onPreview(testInfo.project.name), "il profilo di prova si crea solo in locale");
  test.skip(testInfo.project.name !== "desktop", "una volta sola");
  serveGemini(testInfo);
  test.setTimeout(90_000);
  convexRun("chat:azzeraLimitiPerTest");
  convexRun("devtools:creaProfiloDiProva", { handle: PAGINA_SSE, authUserId: "e2e-oracolo-sse-utente", displayName: "Sara" });
  const ids = [
    { kind: "concert", date: "2025-03-14", artist: "Gabbiani di Prova", venue: "Fabrique", city: "Milano", with: [] },
    { kind: "concert", date: "2025-09-20", artist: "Gabbiani di Prova", venue: "Fabrique", city: "Milano", with: [] },
  ].map(entry => convexRun<string>("devtools:addEntry", { handle: PAGINA_SSE, entry }));
  try {
    const res = await http(new URL("/api/chat", baseURL).href, {
      headers: { origin: new URL(baseURL!).origin },
      data: { messages: [{ role: "user", content: "quanti concerti ha visto Sara nel 2025?" }], forwardedProps: { handle: PAGINA_SSE } },
      timeout: 80_000,
    });
    expect(res.status()).toBe(200);
    const events = parseSse(await res.text());
    expect(conteggiDiQueryConcerts(events)).toContain(2);
    expect(events.map(e => e.type)).not.toContain("RUN_ERROR");
    expect(risposta(events)).toMatch(/\b2\b|due/i);
  } finally {
    for (const entryId of ids) convexRun("devtools:removeEntry", { handle: PAGINA_SSE, entryId });
  }
});

test("@gemini @sessione in scrittura: aggiunge un concerto e poi annulla l'aggiunta", async ({ page, baseURL }, testInfo) => {
  test.skip(onPreview(testInfo.project.name), "il login di prova (OTP di sviluppo) c'è solo in locale");
  test.skip(testInfo.project.name !== "desktop", "una volta sola");
  serveGemini(testInfo);
  test.setTimeout(240_000);
  convexRun("chat:azzeraLimitiPerTest");
  const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Sara" });
  const artista = "Gabbiani di Prova";
  const entries = () => convexRun<{ entries: { artist?: string }[] } | undefined>("pages:byHandle", { handle })?.entries ?? [];
  // con la sessione della proprietaria (i cookie della pagina) e l'Origin dell'app; una ripresa
  // (`resume`) continua il run interrotto dello stesso thread, che il server rilegge da Convex
  const scrivi = async (testo: string, ripresa: { threadId: string; parentRunId: string; resume: unknown[] } | null = null) => {
    const threadId = ripresa?.threadId ?? randomUUID();
    const res = await page.request.post(new URL("/api/chat/scrittura", baseURL).href, {
      headers: { origin: new URL(baseURL!).origin },
      data: {
        threadId, runId: `run-${randomUUID()}`, messages: [{ role: "user", content: testo }], forwardedProps: { handle },
        ...(ripresa ? { parentRunId: ripresa.parentRunId, resume: ripresa.resume } : {}),
      },
      timeout: 200_000,
    });
    expect(res.status()).toBe(200);
    const events = parseSse(await res.text());
    expect(events.map(e => e.type)).not.toContain("RUN_ERROR");
    const nomi = new Map(events.filter(e => e.type === "TOOL_CALL_START").map(e => [e.toolCallId, e.toolCallName ?? e.toolName]));
    // per capire un fallimento: ogni strumento col suo risultato (dati della pagina di prova), e la risposta
    const traccia = [
      ...events.filter(e => e.type === "TOOL_CALL_RESULT").map(e => `${nomi.get(e.toolCallId) ?? e.toolCallId} → ${String(e.content).slice(0, 300)}`),
      `risposta: ${risposta(events).slice(0, 300)}`,
    ].join("\n");
    // l'ultimo RUN_FINISHED: ogni giro del modello ne manda uno, l'interruzione sta nell'ultimo
    const fine = events.findLast(e => e.type === "RUN_FINISHED");
    const interruzioni = (fine?.outcome?.type === "interrupt" ? fine.outcome.interrupts : []) as { id: string; toolCallId: string }[];
    return { threadId, runId: String(fine?.runId ?? ""), strumenti: [...nomi.values()], nomi, interruzioni, traccia };
  };

  const primo = await scrivi(`Aggiungi un concerto: ${artista}, il 20/11/2026, al Fabrique di Milano, ci vado da sola. Aggiungilo subito, senza chiedermi altro.`);
  expect(primo.strumenti, primo.traccia).toContain("add_concert");
  expect(entries().map(e => e.artist), primo.traccia).toContain(artista);

  // annullare un'aggiunta la cancella: lo strumento aspetta il sì, e intanto il concerto resta
  const secondo = await scrivi("Annulla l'ultima modifica del registro attività (l'aggiunta del concerto). Fallo subito, senza chiedermi altro.");
  expect(secondo.strumenti, secondo.traccia).toContain("undo");
  const approvazione = secondo.interruzioni.find(i => i.id.startsWith("approval_") && secondo.nomi.get(i.toolCallId) === "undo");
  expect(approvazione, secondo.traccia).toBeTruthy();
  expect(entries().map(e => e.artist), secondo.traccia).toContain(artista);

  const terzo = await scrivi("Annulla l'ultima modifica.", {
    threadId: secondo.threadId, parentRunId: secondo.runId,
    resume: [{ interruptId: approvazione!.id, status: "resolved", payload: { approved: true } }],
  });
  expect(entries().map(e => e.artist), terzo.traccia).not.toContain(artista);
});
