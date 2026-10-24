/* ──────────────────────────────────────────────────────────────
   L'Oracolo in scrittura (PIANO §1.27, traguardo 6), con il modello finto
   (ORACOLO_FAKE=1: il copione della scrittura in src/server/oracolo/finto.ts)
   e una proprietaria nuova (nuovoProprietario, con un concerto già in
   pagina), mai gabrifila.

   - Aggiunta dal vivo: "aggiungi il concerto di X" → propose_concert, la
     scheda nella chat: niente è scritto finché la proprietaria non preme
     «Salva concerto» (i flussi della scheda sono in oracolo-scheda.spec.ts).
     Poi il concerto compare in #concerti e sulla pagina pubblica aperta da
     un visitatore, senza ricaricare.
   - La cancellazione chiede l'approvazione nella chat, con il nome del
     concerto letto da Convex: "Rifiuta" non cancella niente, "Conferma"
     cancella.
   - In #attivita l'autore di aggiunta e cancellazione è "Oracolo".
   - La chat è privata: sta tra le chat della proprietaria, non nello
     storico pubblico.
   - Senza Origin, su una pagina altrui o senza sessione la route rifiuta.
   - (@gemini, Gemini vero) «ho visto i Verdena all'Alcatraz sabato con
     Marco, voto 5» diventa UNA scheda: propose_concert con artista, venue,
     voto e la data del sabato prima di oggi (E2E_NOW), senza add_person,
     add_venue né search_venue prima; il run si ferma sulla scheda e niente
     è scritto.

   Tutte @sessione (il login dell'OTP di sviluppo). Una volta sola
   (desktop). `ORACOLO_FAKE=1 node scripts/wt.mjs exec -- pnpm e2e e2e/oracolo-scrittura.spec.ts`;
   la prova con Gemini vero: `node scripts/wt.mjs exec -- pnpm e2e e2e/oracolo-scrittura.spec.ts --grep @gemini`
   (senza ORACOLO_FAKE; wt.mjs prende la chiave dal .env.local del worktree).
   ────────────────────────────────────────────────────────────── */

import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { nuovoProprietario, unico } from "./helpers/auth.ts";
import { convexRun } from "./helpers/convex.ts";
import { http } from "./helpers/http.ts";
import { vaiA } from "./helpers/modifica.ts";
import { E2E_NOW } from "./helpers/now.ts";
import { expect, onPreview, test } from "./helpers/test.ts";

const chat = (page: Page) => page.getByRole("dialog", { name: "L'Oracolo in scrittura" });
async function scrivi(page: Page, testo: string) {
  await chat(page).getByRole("textbox", { name: "Messaggio per l'Oracolo" }).fill(testo);
  await chat(page).getByRole("button", { name: "Invia" }).click();
}

/** Le POST a /api/chat/scrittura della pagina, col loro corpo. */
function registra(page: Page): { threadId?: string }[] {
  const richieste: { threadId?: string }[] = [];
  page.on("request", r => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/chat/scrittura") richieste.push(r.postDataJSON());
  });
  return richieste;
}

test.describe("Oracolo in scrittura", { tag: "@sessione" }, () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== "desktop", "una volta sola, sul progetto desktop in locale");
    test.skip(process.env.ORACOLO_FAKE !== "1", "serve l'Oracolo finto: ORACOLO_FAKE=1");
    convexRun("chat:azzeraLimitiPerTest");
  });

  test("aggiunge dal vivo, chiede l'approvazione per cancellare, firma «Oracolo» in Attività", async ({ page, browser }) => {
    test.setTimeout(240_000);
    const richieste = registra(page);
    const { handle } = await nuovoProprietario(page, { forma: "f", nome: "Scrittrice" });
    // un concerto già in pagina, così la pagina pubblica non parte vuota
    convexRun("devtools:addEntry", {
      handle,
      entry: { kind: "concert", date: "2025-05-10", artist: "Canarino di partenza", venue: "Fabrique", city: "Milano", with: [] },
    });
    const artista = `Canarino scritto ${unico()}`;

    // un visitatore guarda la pagina pubblica, senza sessione
    const ospite = await browser.newContext();
    const pubblica = await ospite.newPage();
    await pubblica.goto(`/${handle}/dati`);
    await expect(pubblica.getByText("Canarino di partenza").first()).toBeVisible();
    await expect(pubblica.getByText(artista)).toHaveCount(0);

    await page.goto(`/${handle}/modifica`);
    // l'elenco di #concerti (non il riquadro "da completare", che sta nella stessa sezione)
    const concerti = page.locator("section#concerti").getByRole("list", { name: "Concerti e festival" });
    const attivita = page.locator("section#attivita");
    await expect(concerti.getByText("Canarino di partenza")).toBeVisible();
    // qui l'Oracolo è quello in scrittura: quello dei visitatori si fa da parte
    await expect(page.getByRole("button", { name: "Apri L'Oracolo, la chat AI" })).toHaveCount(0);
    await page.getByRole("button", { name: "Apri L'Oracolo in scrittura" }).click();

    // 1. aggiunta: la scheda aspetta il Salva (niente scritto prima), poi dal vivo nella dashboard e sulla pagina pubblica
    await scrivi(page, `Aggiungi il concerto di ${artista}`);
    const scheda = chat(page).getByRole("group", { name: `Scheda: nuovo concerto ${artista}` });
    await expect(scheda).toContainText("ven 20 nov 2026");
    await expect(concerti.getByText(artista)).toHaveCount(0);
    await scheda.getByRole("button", { name: "Salva concerto" }).click();
    await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
    await expect(chat(page).locator(".scheda-esito")).toContainText(`Aggiunto · ${artista}`);
    await expect(concerti.getByText(artista)).toBeVisible();
    await expect(pubblica.getByText(artista).first()).toBeVisible();
    // Attività è un'altra vista: l'Oracolo agganciato resta aperto, con la stessa chat
    await vaiA(page, "attivita");
    await expect(attivita.locator(".mod-voce").filter({ hasText: `aggiunto: ${artista}` }).locator(".mod-autore")).toHaveText("Oracolo");
    await expect(chat(page)).toBeVisible();
    await expect(chat(page).getByText("Fatto: concerto aggiunto.")).toBeVisible();
    await vaiA(page, "concerti");
    const threadId = richieste[0].threadId!;

    // 2. cancellazione: la chat chiede, con il nome del concerto; "Rifiuta" non tocca niente
    await scrivi(page, `Cancella il concerto di ${artista}`);
    const domanda = chat(page).getByRole("group", { name: "Conferma richiesta" });
    await expect(domanda).toContainText(`Cancellare il concerto «${artista} del 20/11/2026»?`);
    await domanda.getByRole("button", { name: "Rifiuta" }).click();
    await expect(chat(page).getByText("Va bene, non lo cancello.")).toBeVisible();
    await expect(concerti.getByText(artista)).toBeVisible();

    // ...e "Conferma" cancella: sparisce dalla dashboard e dalla pagina pubblica
    await scrivi(page, `Cancella il concerto di ${artista}`);
    await chat(page).getByRole("group", { name: "Conferma richiesta" }).getByRole("button", { name: "Conferma" }).click();
    await expect(chat(page).getByText("Fatto: concerto cancellato.")).toBeVisible();
    await expect(concerti.getByText(artista)).toHaveCount(0);
    await expect(pubblica.getByText(artista)).toHaveCount(0);
    await vaiA(page, "attivita");
    await expect(attivita.locator(".mod-voce").filter({ hasText: `cancellato: ${artista}` }).locator(".mod-autore")).toHaveText("Oracolo");
    await ospite.close();

    // 3. tutto nello stesso thread, privato: tra le chat della proprietaria, mai nello storico pubblico
    expect(new Set(richieste.map(r => r.threadId))).toEqual(new Set([threadId]));
    await chat(page).getByRole("button", { name: "Le tue chat private" }).click();
    await expect(chat(page).locator(".chat-hist-item").filter({ hasText: `Aggiungi il concerto di ${artista}` })).toContainText("chat aperta");
    expect(convexRun<unknown[]>("chat:listThreads", { handle })).toEqual([]);
    expect(convexRun<unknown>("chat:getThread", { handle, threadId }) ?? null).toBeNull();
    expect(convexRun<string | undefined>("chat:visibilitaPerTest", { threadId })).toBe("proprietario");
  });

  test("senza Origin, su una pagina altrui o senza sessione: rifiutato", async ({ page, baseURL }) => {
    const { handle } = await nuovoProprietario(page);
    const url = new URL("/api/chat/scrittura", baseURL).href;
    const origin = new URL(baseURL!).origin;
    const corpo = (h: string) => ({ messages: [{ role: "user", content: "aggiungi il concerto di Nessuno" }], forwardedProps: { handle: h } });

    // con la sessione (i cookie della pagina) ma senza Origin
    const senzaOrigin = await page.request.post(url, { data: corpo(handle), failOnStatusCode: false });
    expect(senzaOrigin.status()).toBe(403);
    // con sessione e Origin, ma sulla pagina di un altro
    const altrui = await page.request.post(url, { headers: { origin }, data: corpo("gabrifila"), failOnStatusCode: false });
    expect(altrui.status()).toBe(403);
    // Origin giusto ma nessuna sessione (fetch di Node, niente cookie)
    const anonimo = await http(url, { headers: { origin }, data: corpo(handle) });
    expect(anonimo.status()).toBe(401);
    // niente di tutto questo ha scritto
    const pagina = convexRun<{ entries: unknown[] } | undefined>("pages:byHandle", { handle });
    expect(pagina?.entries ?? []).toEqual([]);
  });
});

interface EventoSse { type: string; [k: string]: any }

const eventiSse = (testo: string): EventoSse[] =>
  testo.split("\n")
    .filter(l => l.startsWith("data: "))
    .map(l => l.slice(6).trim())
    .filter(l => l && l !== "[DONE]")
    .map(l => JSON.parse(l) as EventoSse);

/** Il sabato prima di oggi (l'orologio congelato del server degli e2e), AAAA-MM-GG. */
function sabatoScorso(): string {
  const [y, m, d] = E2E_NOW.slice(0, 10).split("-").map(Number);
  const oggi = new Date(Date.UTC(y, m - 1, d));
  const indietro = (oggi.getUTCDay() + 1) % 7 || 7;
  return new Date(oggi.getTime() - indietro * 86_400_000).toISOString().slice(0, 10);
}

/** "AAAA-MM-GG" anche da "gg/mm/aaaa" (lo schema della scheda accetta tutte e due). */
const iso = (s: unknown) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s ?? "").trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : String(s ?? "").trim();
};

test.describe("Oracolo in scrittura, con Gemini vero", { tag: "@sessione" }, () => {
  test("@gemini un concerto raccontato diventa UNA scheda: propose_concert, niente add_person né add_venue", async ({ page, baseURL }, info) => {
    test.skip(onPreview(info.project.name), "il login di prova (OTP di sviluppo) c'è solo in locale");
    test.skip(info.project.name !== "desktop", "una volta sola");
    test.skip(!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY, "GEMINI_API_KEY assente: `node scripts/wt.mjs exec -- pnpm e2e --grep @gemini`");
    test.skip(process.env.ORACOLO_FAKE === "1", "ORACOLO_FAKE=1: qui serve Gemini vero");
    test.setTimeout(180_000);
    convexRun("chat:azzeraLimitiPerTest");
    const { handle } = await nuovoProprietario(page, { forma: "m", nome: "Gabri" });

    // la richiesta del compositore: sessione (i cookie della pagina) e Origin dell'app
    const res = await page.request.post(new URL("/api/chat/scrittura", baseURL).href, {
      headers: { origin: new URL(baseURL!).origin },
      data: {
        threadId: randomUUID(), runId: `run-${randomUUID()}`, forwardedProps: { handle },
        messages: [{ role: "user", content: "ho visto i Verdena all'Alcatraz sabato con Marco, voto 5" }],
      },
      timeout: 150_000,
    });
    expect(res.status()).toBe(200);
    const eventi = eventiSse(await res.text());
    expect(eventi.map(e => e.type)).not.toContain("RUN_ERROR");
    // gli strumenti nell'ordine in cui il modello li chiama, con i loro argomenti
    const chiamate = eventi.filter(e => e.type === "TOOL_CALL_START").map(e => ({ id: String(e.toolCallId), nome: String(e.toolCallName ?? e.toolName) }));
    const argomenti = (id: string): Record<string, any> => {
      const fine = eventi.find(e => e.type === "TOOL_CALL_END" && e.toolCallId === id);
      if (fine?.input && typeof fine.input === "object") return fine.input;
      return JSON.parse(eventi.filter(e => e.type === "TOOL_CALL_ARGS" && e.toolCallId === id).map(e => e.delta ?? "").join("") || "{}");
    };
    const traccia = chiamate.map(c => `${c.nome} ${JSON.stringify(argomenti(c.id))}`).join("\n");
    const schede = chiamate.filter(c => c.nome === "propose_concert");
    expect(schede, traccia).toHaveLength(1);
    // prima della scheda niente aggiunte né ricerche: i nomi nuovi li crea la scheda al Salva
    const prima = chiamate.slice(0, chiamate.indexOf(schede[0])).map(c => c.nome);
    for (const vietato of ["add_person", "add_venue", "search_venue", "add_departure", "add_gifter"]) expect(prima, traccia).not.toContain(vietato);
    const p = argomenti(schede[0].id);
    expect(p.id, traccia).toBeUndefined();
    expect(String(p.artist), traccia).toMatch(/verdena/i);
    expect(String(p.venue), traccia).toMatch(/alcatraz/i);
    expect(p.voto, traccia).toBe(5);
    expect(iso(p.date), traccia).toBe(sabatoScorso());
    expect((p.with ?? []).join(" "), traccia).toMatch(/marco/i);
    // il run si ferma sulla scheda (approval_<toolCallId>), e niente è scritto
    const fine = eventi.findLast(e => e.type === "RUN_FINISHED");
    const interruzioni = (fine?.outcome?.type === "interrupt" ? fine.outcome.interrupts : []) as { id: string }[];
    expect(interruzioni.map(i => i.id), traccia).toContain(`approval_${schede[0].id}`);
    expect(convexRun<{ entries: unknown[] } | undefined>("pages:byHandle", { handle })?.entries ?? []).toEqual([]);
  });
});
