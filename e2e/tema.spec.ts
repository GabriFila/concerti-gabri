/* ──────────────────────────────────────────────────────────────
   Il tema del visitatore (PIANO §1.4): cookie `tema` (dark|light|system,
   senza cookie dark), `data-theme` già nell'HTML SSR, uno script in <head>
   solo per `system`, la migrazione una tantum da `localStorage.theme`, il
   pulsante e lo strumento `set_visitor_theme` dell'Oracolo che scrivono il
   cookie.
   ────────────────────────────────────────────────────────────── */

import type { Page, Route } from "@playwright/test";
import { http } from "./helpers/http.ts";
import { setTemaCookie, ssrDataTheme, temaCookie } from "./helpers/tema.ts";
import { expect, test } from "./helpers/test.ts";

const PAGE = "/gabrifila";
const htmlTheme = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const legacyTheme = (page: Page) => page.evaluate(() => localStorage.getItem("theme"));

test.describe("SSR", () => {
  for (const [cookie, expected] of [
    [undefined, "dark"],
    ["dark", "dark"],
    ["light", "light"],
    ["bogus", "dark"],
  ] as const) {
    test(`cookie ${cookie ?? "assente"} → data-theme="${expected}" nell'HTML`, async ({ baseURL }) => {
      const res = await http(new URL(PAGE, baseURL).href, {
        headers: cookie ? { cookie: `tema=${cookie}` } : {},
      });
      expect(res.status()).toBe(200);
      const html = await res.text();
      expect(ssrDataTheme(html)).toBe(expected);
      // lo script per "system" c'è solo con "system"
      expect(html).not.toContain("prefers-color-scheme: dark");
    });
  }

  test("system: niente data-theme nell'HTML, lo decide lo script in <head>", async ({ baseURL }) => {
    const res = await http(new URL(PAGE, baseURL).href, { headers: { cookie: "tema=system" } });
    const html = await res.text();
    expect(ssrDataTheme(html)).toBeNull();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('matchMedia("(prefers-color-scheme: dark)")');
    expect(head).toMatch(/setAttribute\("data-theme"/);
  });

  for (const scheme of ["dark", "light"] as const) {
    test(`system con il sistema in ${scheme}: lo script basta, anche senza l'app`, async ({ page, context, baseURL }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await setTemaCookie(context, baseURL!, "system");
      // niente bundle dell'app: il tema deve arrivare dallo script inline, prima del primo paint
      await page.route(/\/assets\/.*\.js$/, (route: Route) => route.abort());
      await page.goto(PAGE, { waitUntil: "domcontentloaded" });
      expect(await htmlTheme(page)).toBe(scheme);
    });
  }
});

test.describe("nel browser", () => {
  test("chi non tocca niente non riceve il cookie", async ({ page, context, baseURL }) => {
    await page.goto(PAGE);
    await expect(page.locator(".theme-toggle")).toBeVisible();
    expect(await htmlTheme(page)).toBe("dark");
    expect(await temaCookie(context, baseURL!)).toBeUndefined();
  });

  test("il pulsante cicla scuro → chiaro → sistema → scuro e scrive il cookie", async ({ page, context, baseURL }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(PAGE, { waitUntil: "networkidle" });
    const toggle = page.locator(".theme-toggle");
    await expect(toggle).toHaveAttribute("title", "Tema: Scuro");

    await toggle.click();
    await expect(toggle).toHaveAttribute("title", "Tema: Chiaro");
    expect(await temaCookie(context, baseURL!)).toBe("light");
    expect(await htmlTheme(page)).toBe("light");

    await toggle.click();
    await expect(toggle).toHaveAttribute("title", "Tema: Sistema");
    expect(await temaCookie(context, baseURL!)).toBe("system");
    expect(await htmlTheme(page)).toBe("light"); // il sistema è in chiaro

    await toggle.click();
    await expect(toggle).toHaveAttribute("title", "Tema: Scuro");
    expect(await temaCookie(context, baseURL!)).toBe("dark");
    expect(await htmlTheme(page)).toBe("dark");

    // il server ora lo vede: dopo un reload è già nell'HTML
    const res = await page.reload();
    expect(ssrDataTheme(await res!.text())).toBe("dark");
  });

  test("migrazione una tantum da localStorage.theme al cookie", async ({ page, context, baseURL }) => {
    await page.goto(PAGE);
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    expect(await temaCookie(context, baseURL!)).toBeUndefined();

    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => temaCookie(context, baseURL!)).toBe("light");
    expect(await legacyTheme(page)).toBeNull();
    await expect.poll(() => htmlTheme(page)).toBe("light");
    await expect(page.locator(".theme-toggle")).toHaveAttribute("title", "Tema: Chiaro");

    // dal giro dopo il tema arriva dal server, senza passare dal client
    const res = await page.reload();
    expect(ssrDataTheme(await res!.text())).toBe("light");
  });

  test("con un cookie già presente la vecchia chiave si toglie e basta", async ({ page, context, baseURL }) => {
    await setTemaCookie(context, baseURL!, "dark");
    await page.goto(PAGE);
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await page.reload({ waitUntil: "networkidle" });
    await expect.poll(() => legacyTheme(page)).toBeNull();
    expect(await temaCookie(context, baseURL!)).toBe("dark");
    expect(await htmlTheme(page)).toBe("dark");
  });
});

test.describe("Oracolo", () => {
  /* Lo strumento client `set_visitor_theme`: la risposta di /api/chat è
     simulata con lo stesso SSE di TanStack AI che manda il server (nessuna
     chiamata Gemini). Primo giro: il modello chiama lo strumento; il widget
     lo esegue nel browser e manda il risultato; secondo giro: il testo. */
  const sse = (events: object[]) => events.map(e => `data: ${JSON.stringify(e)}\n\n`).join("");

  test("set_visitor_theme scrive il cookie e cambia il tema subito", async ({ page, context, baseURL }) => {
    const bodies: any[] = [];
    await page.route("**/api/chat", async (route: Route) => {
      const body = route.request().postDataJSON();
      bodies.push(body);
      const t = Date.now();
      const run = { runId: "run-" + bodies.length, threadId: body.threadId ?? "t", model: "finto", timestamp: t };
      const events = bodies.length === 1
        ? [
            { type: "RUN_STARTED", ...run },
            { type: "TOOL_CALL_START", toolCallId: "call_tema", toolCallName: "set_visitor_theme", toolName: "set_visitor_theme", model: "finto", timestamp: t, index: 0 },
            { type: "TOOL_CALL_ARGS", toolCallId: "call_tema", model: "finto", timestamp: t, delta: '{"theme":"light"}', args: '{"theme":"light"}' },
            { type: "TOOL_CALL_END", toolCallId: "call_tema", toolCallName: "set_visitor_theme", toolName: "set_visitor_theme", model: "finto", timestamp: t, input: { theme: "light" } },
            { type: "RUN_FINISHED", ...run, finishReason: "tool_calls" },
            // come il TextEngine sul server: lo strumento è del client, il browser lo esegua
            { type: "CUSTOM", model: "finto", timestamp: t, name: "tool-input-available", value: { toolCallId: "call_tema", toolName: "set_visitor_theme", input: { theme: "light" } } },
          ]
        : [
            { type: "RUN_STARTED", ...run },
            { type: "TEXT_MESSAGE_START", messageId: "m2", model: "finto", timestamp: t, role: "assistant" },
            { type: "TEXT_MESSAGE_CONTENT", messageId: "m2", model: "finto", timestamp: t, delta: "Fatto: tema chiaro.", content: "Fatto: tema chiaro." },
            { type: "TEXT_MESSAGE_END", messageId: "m2", model: "finto", timestamp: t },
            { type: "RUN_FINISHED", ...run, finishReason: "stop" },
          ];
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: sse(events) });
    });

    await page.goto(PAGE, { waitUntil: "networkidle" });
    expect(await htmlTheme(page)).toBe("dark");
    await page.getByRole("button", { name: "Apri L'Oracolo, la chat AI" }).click();
    const input = page.getByRole("textbox", { name: "Messaggio" });
    await input.fill("passa al tema chiaro");
    await page.getByRole("button", { name: "Invia" }).click();

    await expect.poll(() => temaCookie(context, baseURL!)).toBe("light");
    await expect.poll(() => htmlTheme(page)).toBe("light");
    await expect(page.getByText("Fatto: tema chiaro.")).toBeVisible();
    // il secondo giro porta al server il risultato dello strumento
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(bodies[1])).toContain("set_visitor_theme");
    // il nome vecchio non esiste più nel widget
    expect(JSON.stringify(bodies[0])).not.toMatch(/"set_theme"/);
  });
});
