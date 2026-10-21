/* ──────────────────────────────────────────────────────────────
   L'Oracolo dal vivo (@gemini: spende UNA chiamata Gemini vera).

   "quanti concerti ho visto nel 2025?" deve far girare `query_concerts` sul
   server: nell'SSE ci sono TOOL_CALL_START/END di quello strumento e il suo
   TOOL_CALL_RESULT, poi la risposta col numero (16 nei dati statici).

   In locale serve GEMINI_API_KEY nell'ambiente del server, cioè di
   Playwright: `fnox exec -- pnpm e2e --grep @gemini`. Senza, si salta.
   ────────────────────────────────────────────────────────────── */

import { http } from "./helpers/http.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

interface SseEvent { type: string; [k: string]: any }

const parseSse = (text: string): SseEvent[] =>
  text.split("\n")
    .filter(l => l.startsWith("data: "))
    .map(l => l.slice(6).trim())
    .filter(l => l && l !== "[DONE]")
    .map(l => JSON.parse(l) as SseEvent);

test("@gemini quanti concerti ho visto nel 2025? → query_concerts sul server", async ({ baseURL }, testInfo) => {
  test.skip(
    !onPreview(testInfo.project.name) && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY,
    "GEMINI_API_KEY assente: lanciare con `fnox exec -- pnpm e2e --grep @gemini`",
  );
  test.setTimeout(90_000);
  // fetch di Node (helpers/http.ts), mai il `request` di Playwright: sulla preview porta il bypass
  const res = await http(new URL("/api/chat", baseURL).href, {
    headers: { origin: new URL(baseURL!).origin },
    data: { messages: [{ role: "user", content: "quanti concerti ho visto nel 2025?" }] },
    timeout: 80_000,
  });
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/event-stream");
  const events = parseSse(await res.text());
  const types = events.map(e => e.type);
  testInfo.annotations.push({ type: "sse", description: [...new Set(types)].join(", ") });

  const starts = events.filter(e => e.type === "TOOL_CALL_START" && e.toolName === "query_concerts");
  expect(starts.length, "TOOL_CALL_START di query_concerts").toBeGreaterThan(0);
  const ids = new Set(starts.map(e => e.toolCallId));
  expect(events.some(e => e.type === "TOOL_CALL_END" && ids.has(e.toolCallId)), "TOOL_CALL_END").toBe(true);
  const results = events.filter(e => e.type === "TOOL_CALL_RESULT" && ids.has(e.toolCallId));
  expect(results.length, "TOOL_CALL_RESULT: lo strumento è girato sul server").toBeGreaterThan(0);
  const counts = results.map(e => { try { return JSON.parse(e.content).count; } catch { return undefined; } });
  expect(counts).toContain(16);

  expect(types).toContain("RUN_FINISHED");
  expect(types).not.toContain("RUN_ERROR");
  const answer = events.filter(e => e.type === "TEXT_MESSAGE_CONTENT").map(e => e.delta ?? "").join("");
  expect(answer).toMatch(/16|sedici/i);
});
