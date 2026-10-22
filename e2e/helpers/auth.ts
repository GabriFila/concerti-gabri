/* ──────────────────────────────────────────────────────────────
   Login negli e2e (contratto di ondata, CONTRATTI-ONDATA.md), con l'OTP
   di sviluppo del deployment Convex LOCALE del worktree. Solo in locale:
   sulla preview i codici li legge l'orchestratore.

   Le chiamate passano da `page.request`, che divide i cookie col
   contesto del browser: dopo `accediConOtp` la pagina ha la sessione.
   - Il codice si chiede con POST /api/auth/email-otp/send-verification-otp
     (attraverso il proxy di Start, Origin = l'app, che il deployment
     locale ha tra le trusted origins) e si legge con `devOtp:latest`.
   - Se un limite d'invio risponde 429 (gli e2e entrano molte volte in
     un'ora), `devOtp:azzeraLimiti` lo azzera e si riprova una volta.
   - Il passo 1 dell'onboarding di `nuovoProprietario` si fa con la
     mutation vera (`profiles:completeOnboarding`) via HTTP, col JWT della
     sessione: la UI di /benvenuto la prova e2e/onboarding.spec.ts.
   Le email e gli handle di prova iniziano con `e2e-` (devtools:cleanupE2E).
   ────────────────────────────────────────────────────────────── */

import { randomBytes } from "node:crypto";
import type { APIResponse, Page } from "@playwright/test";
import { convexRun, whoami } from "./convex.ts";
import { START_URL } from "./urls.ts";

export type FormaE2E = "f" | "m" | "n";

export interface Proprietario {
  email: string;
  handle: string;
}

/** L'email dell'utente di prova che diventa proprietario di gabrifila (admin:claimProfile). */
export const EMAIL_GABRIFILA = "e2e-gabrifila@example.test";

function soloLocale(cosa: string) {
  if (process.env.E2E_PREVIEW === "1") throw new Error(`e2e/helpers/auth.ts: ${cosa} solo in locale (sulla preview i codici li legge l'orchestratore)`);
}

/** Un suffisso unico per email e handle di prova (lettere minuscole e cifre). */
export const unico = () => randomBytes(5).toString("hex");

const origine = (page: Page) => {
  const u = page.url();
  return /^https?:/.test(u) ? new URL(u).origin : START_URL;
};

const post = (page: Page, percorso: string, data: unknown): Promise<APIResponse> =>
  page.request.post(`${origine(page)}/api/auth${percorso}`, { data, headers: { origin: origine(page) }, failOnStatusCode: false });

async function chiediCodice(page: Page, email: string) {
  let r = await post(page, "/email-otp/send-verification-otp", { email, type: "sign-in" });
  if (r.status() === 429) {
    convexRun("devOtp:azzeraLimiti", { email });
    r = await post(page, "/email-otp/send-verification-otp", { email, type: "sign-in" });
  }
  if (!r.ok()) throw new Error(`e2e: invio del codice non riuscito (${r.status()})`);
}

/** Aspetta che React abbia idratato la pagina (src/routes/__root.tsx mette data-idratato su <html>). */
export async function idratata(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.idratato === "1");
}

/** Ricarica la pagina se è già su un sito (su about:blank non c'è niente da ricaricare). */
async function ricarica(page: Page) {
  if (/^https?:/.test(page.url())) await page.reload();
}

/** Entra con l'OTP di sviluppo; crea l'utente se manca. Alla fine la pagina è ricaricata con la sessione. */
export async function accediConOtp(page: Page, email: string): Promise<void> {
  soloLocale("accediConOtp");
  await chiediCodice(page, email);
  const otp = convexRun<{ otp: string } | null>("devOtp:latest", { email })?.otp;
  if (!otp) throw new Error("e2e: nessun codice nell'outbox di sviluppo");
  const r = await post(page, "/sign-in/email-otp", { email, otp });
  if (!r.ok()) throw new Error(`e2e: accesso con il codice non riuscito (${r.status()})`);
  await ricarica(page);
}

/** Nuovo utente con email unica e passo 1 dell'onboarding fatto (profilo active, nessun dato). */
export async function nuovoProprietario(page: Page, opts: { handle?: string; forma?: FormaE2E; nome?: string } = {}): Promise<Proprietario> {
  soloLocale("nuovoProprietario");
  const id = unico();
  const email = `e2e-${id}@example.test`;
  const handle = opts.handle ?? `e2e-${id}`;
  await accediConOtp(page, email);
  const tok = await page.request.get(`${origine(page)}/api/auth/convex/token`, { failOnStatusCode: false });
  const token = tok.ok() ? ((await tok.json()) as { token?: string }).token : undefined;
  if (!token) throw new Error(`e2e: nessun token Convex per la sessione (${tok.status()})`);
  const convexUrl = process.env.VITE_CONVEX_URL || whoami().cloudUrl;
  const r = await page.request.post(`${convexUrl}/api/mutation`, {
    headers: { authorization: `Bearer ${token}` },
    data: { path: "profiles:completeOnboarding", args: { input: { handle, forma: opts.forma ?? "n", displayName: opts.nome ?? "Prova E2E" } }, format: "json" },
    failOnStatusCode: false,
  });
  const esito = (await r.json().catch(() => null)) as { status?: string; errorMessage?: string } | null;
  if (esito?.status !== "success") throw new Error(`e2e: passo 1 dell'onboarding non riuscito (${r.status()})`);
  await ricarica(page);
  return { email, handle };
}

/** Entra come proprietario di gabrifila (utente di test + admin:claimProfile sul deployment locale). Solo in locale. */
export async function accediComeGabrifila(page: Page): Promise<Proprietario> {
  soloLocale("accediComeGabrifila");
  await accediConOtp(page, EMAIL_GABRIFILA);
  convexRun("admin:claimProfile", { handle: "gabrifila", email: EMAIL_GABRIFILA });
  await ricarica(page);
  return { email: EMAIL_GABRIFILA, handle: "gabrifila" };
}

/** Esce come col bottone "Esci" (sign-out, poi la pagina ricaricata). */
export async function esci(page: Page): Promise<void> {
  const r = await post(page, "/sign-out", {});
  if (!r.ok()) throw new Error(`e2e: uscita non riuscita (${r.status()})`);
  await ricarica(page);
}
