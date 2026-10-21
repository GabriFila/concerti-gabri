/* Le preview Vercel sono protette da Vercel Authentication: i test ci entrano
   con VERCEL_AUTOMATION_BYPASS_SECRET (PIANO §8.4). Regole:
   - il segreto va SOLO verso l'origine della preview (PREVIEW_URL);
   - il segreto non passa MAI da una richiesta di Playwright: Playwright
     scrive ogni header delle sue richieste (e i Set-Cookie delle risposte)
     nel "Call log" dei suoi errori, quindi un timeout o un ECONNRESET lo
     stamperebbe. Lo usa solo il fetch di Node, che negli errori non mette
     gli header, e ogni errore esce comunque col segreto oscurato;
   - il browser entra col cookie di bypass: una richiesta di Node con
     `x-vercel-set-bypass-cookie: true` (redirect non seguiti) se lo fa dare,
     e `context.addCookies` lo mette nel contesto, solo per quell'origine;
   - le richieste senza browser (helpers/http.ts) usano il fetch di Node con
     l'header;
   - mai `extraHTTPHeaders`, che lo manderebbe a Mapbox, ai font e a chiunque;
   - il valore (del segreto e del cookie) non si stampa mai. */

import type { BrowserContext, Cookie } from "@playwright/test";

const SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "";
export const PREVIEW_URL = (process.env.PREVIEW_URL || "").replace(/\/+$/, "");
const previewOrigin = PREVIEW_URL ? new URL(PREVIEW_URL).origin : "";

const isPreview = (url: string | URL | undefined) => !!url && !!previewOrigin && new URL(url).origin === previewOrigin;

/** Oscura il segreto in un testo (messaggi d'errore). */
export const redact = (text: string) => (SECRET ? text.split(SECRET).join("***") : text);

/** Un errore di fetch descritto senza header, con il segreto oscurato. */
export function describeError(err: unknown): string {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const cause = e?.cause ? ` (${[e.cause.code, e.cause.message].filter(Boolean).join(": ")})` : "";
  return redact(`${e?.name ?? "Error"}: ${e?.message ?? String(err)}${cause}`);
}

/** Header per una richiesta di Node (helpers/http.ts): il bypass solo se l'URL è sulla preview. */
export function bypassHeaders(url: string): Record<string, string> {
  return SECRET && isPreview(url) ? { "x-vercel-protection-bypass": SECRET } : {};
}

type SameSite = Cookie["sameSite"];
const SAME_SITE: Record<string, SameSite> = { lax: "Lax", strict: "Strict", none: "None" };

/** Un Set-Cookie come cookie di Playwright, legato all'host della preview. */
function parseSetCookie(header: string, host: string): Cookie | null {
  const [pair, ...attrs] = header.split(";").map(s => s.trim());
  const eq = pair.indexOf("=");
  if (eq <= 0) return null;
  const cookie: Cookie = {
    name: pair.slice(0, eq),
    value: pair.slice(eq + 1),
    domain: host, // senza punto iniziale: solo questo host
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: true,
    sameSite: "Lax",
  };
  for (const attr of attrs) {
    const i = attr.indexOf("=");
    const key = (i === -1 ? attr : attr.slice(0, i)).toLowerCase();
    const val = i === -1 ? "" : attr.slice(i + 1);
    if (key === "path" && val.startsWith("/")) cookie.path = val;
    else if (key === "max-age" && /^-?\d+$/.test(val)) cookie.expires = Math.floor(Date.now() / 1000) + Number(val);
    else if (key === "expires" && cookie.expires === -1 && !Number.isNaN(Date.parse(val))) cookie.expires = Math.floor(Date.parse(val) / 1000);
    else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "samesite") cookie.sameSite = SAME_SITE[val.toLowerCase()] ?? "Lax";
    // Domain ignorato di proposito: il cookie resta sull'host della preview
  }
  return cookie;
}

let bypassCookies: Promise<Cookie[]> | null = null;

/** Chiede alla preview il cookie di bypass, una volta per processo, col fetch di Node. */
async function fetchBypassCookies(): Promise<Cookie[]> {
  const url = new URL("/gabrifila", previewOrigin);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "x-vercel-protection-bypass": SECRET, "x-vercel-set-bypass-cookie": "true" },
      // redirect non seguiti: il segreto non viaggia su un redirect
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    await res.body?.cancel();
  } catch (err) {
    throw new Error(`bypass: richiesta alla preview fallita: ${describeError(err)}`);
  }
  const cookies = res.headers.getSetCookie()
    .map(h => parseSetCookie(h, url.hostname))
    .filter((c): c is Cookie => c !== null);
  if (cookies.length === 0) {
    throw new Error(`bypass: la preview ha risposto ${res.status} senza cookie di bypass (segreto sbagliato o protezione diversa?)`);
  }
  return cookies;
}

/** Mette il cookie di bypass nel contesto del browser quando punta alla preview (nessun effetto in locale). */
export async function installBypass(context: BrowserContext, baseURL: string | undefined): Promise<void> {
  if (!SECRET || !isPreview(baseURL)) return;
  bypassCookies ??= fetchBypassCookies();
  let cookies: Cookie[];
  try {
    cookies = await bypassCookies;
  } catch (err) {
    bypassCookies = null; // al prossimo test si riprova (il messaggio è già oscurato)
    throw err;
  }
  try {
    await context.addCookies(cookies);
  } catch (err) {
    // per sicurezza il messaggio esce senza il segreto e senza i valori dei cookie
    let msg = redact(err instanceof Error ? err.message : String(err));
    for (const c of cookies) if (c.value) msg = msg.split(c.value).join("***");
    throw new Error(`bypass: addCookies fallito: ${msg}`);
  }
}
