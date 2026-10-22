/* ──────────────────────────────────────────────────────────────
   Isolamento dell'SSR tra richieste concorrenti (PIANO §1.7, §6): su
   Vercel Fluid le richieste condividono l'istanza, quindi un client Convex
   di modulo con la sessione di A metterebbe i dati `me.*` di A nell'HTML
   di B. Qui due proprietari, A e B, e tante richieste SSR lanciate
   insieme: A su /A/modifica con la sua sessione, B su /B con la sua, più un
   anonimo su /A. Nessuna risposta deve contenere nome, handle o email
   dell'altro, e l'anonimo non deve vedere né sessione né "Modifica".
   Il login arriva con la corsia 3 (tag @sessione).
   ────────────────────────────────────────────────────────────── */

import type { Browser } from "@playwright/test";
import { nuovoProprietario, type Proprietario } from "./helpers/auth.ts";
import { http } from "./helpers/http.ts";
import { expect, test } from "./helpers/test.ts";

const GIRI = 8;

/** Un proprietario nuovo in un contesto suo; restituisce il Cookie della sua sessione. */
async function proprietario(browser: Browser, nome: string): Promise<Proprietario & { nome: string; cookie: string }> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const io = await nuovoProprietario(page, { forma: "n", nome });
    const cookie = (await context.cookies()).map(c => `${c.name}=${c.value}`).join("; ");
    return { ...io, nome, cookie };
  } finally {
    await context.close();
  }
}

test("due SSR concorrenti con sessioni diverse non si scambiano i dati", { tag: "@sessione" }, async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const suffisso = Date.now().toString(36);
  const a = await proprietario(browser, `Alfa ${suffisso}`);
  const b = await proprietario(browser, `Beta ${suffisso}`);
  const url = (p: string) => new URL(p, baseURL).href;

  for (let giro = 0; giro < GIRI; giro++) {
    const [ra, rb, anonimo] = await Promise.all([
      http(url(`/${a.handle}/modifica`), { headers: { cookie: a.cookie } }),
      http(url(`/${b.handle}`), { headers: { cookie: b.cookie } }),
      http(url(`/${a.handle}`)),
    ]);
    // ognuno la sua pagina (A non è stato rimandato fuori da /modifica)
    expect(ra.status(), `giro ${giro}: A`).toBe(200);
    expect(rb.status(), `giro ${giro}: B`).toBe(200);
    expect(anonimo.status()).toBe(200);
    const [ha, hb, hx] = await Promise.all([ra.text(), rb.text(), anonimo.text()]);
    expect(ha).toContain(a.nome);
    expect(hb).toContain(b.nome);
    // e niente dell'altro
    for (const s of [b.nome, b.handle, b.email]) expect(ha, `giro ${giro}: dati di B nell'HTML di A`).not.toContain(s);
    for (const s of [a.nome, a.handle, a.email]) expect(hb, `giro ${giro}: dati di A nell'HTML di B`).not.toContain(s);
    // l'anonimo vede la pagina pubblica di A, ma senza la sessione di nessuno
    expect(hx).not.toContain('data-auth="1"');
    expect(hx).not.toContain(">Modifica</a>");
    for (const s of [a.email, b.email, b.nome]) expect(hx).not.toContain(s);
  }
});
