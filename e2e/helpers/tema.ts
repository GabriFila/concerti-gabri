/* Il tema del visitatore nelle due build:
   - Start legge il cookie `tema` in SSR (src/theme/tema.ts);
   - main lo leggeva da `localStorage.theme`, con uno script inline prima del
     primo paint.
   Per un confronto onesto ognuna lo riceve nel modo suo. */

import type { BrowserContext } from "@playwright/test";

export type Tema = "dark" | "light" | "system";

/** Start: il cookie `tema` per l'origine indicata. */
export async function setTemaCookie(context: BrowserContext, baseURL: string, tema: Tema | string): Promise<void> {
  await context.addCookies([{ name: "tema", value: tema, url: baseURL }]);
}

/** main: `localStorage.theme` prima di ogni script della pagina, solo sull'origine di main. */
export async function setMainTheme(context: BrowserContext, mainOrigin: string, tema: Tema): Promise<void> {
  await context.addInitScript(([origin, t]) => {
    if (location.origin !== origin) return;
    try { localStorage.setItem("theme", t); } catch { /* storage non disponibile */ }
  }, [mainOrigin, tema] as const);
}

/** Il valore del cookie `tema` nel contesto, se c'è. */
export async function temaCookie(context: BrowserContext, url: string): Promise<string | undefined> {
  return (await context.cookies(url)).find(c => c.name === "tema")?.value;
}

/** L'attributo data-theme di <html> in un HTML SSR (null se manca). */
export function ssrDataTheme(html: string): string | null {
  const tag = html.match(/<html\b[^>]*>/i)?.[0] ?? "";
  return tag.match(/\sdata-theme="([^"]*)"/)?.[1] ?? null;
}
