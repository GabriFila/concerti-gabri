/* ──────────────────────────────────────────────────────────────
   Tema del visitatore (chiaro/scuro/sistema), salvato nel cookie `tema`.

   Il server legge il cookie e scrive `data-theme` già nell'HTML SSR, quindi
   niente flash. Senza cookie vale "dark". Solo "system" non si può decidere
   sul server: lì un ScriptOnce di tre righe in <head> guarda matchMedia
   prima del primo paint.

   Il cookie lo scrive solo il browser, e solo quando il tema cambia davvero
   (pulsante, strumento `set_visitor_theme` dell'Oracolo o la migrazione una
   tantum dal vecchio `localStorage.theme`): chi non tocca niente non riceve
   cookie.
   ────────────────────────────────────────────────────────────── */

export type Tema = "dark" | "light" | "system";

export const TEMA_COOKIE = "tema";
/** La vecchia chiave di localStorage del sito su Netlify, da migrare una volta. */
export const LEGACY_THEME_KEY = "theme";
const ONE_YEAR_S = 365 * 24 * 3600;

export const isTema = (v: unknown): v is Tema => v === "dark" || v === "light" || v === "system";
export const parseTema = (v: unknown): Tema => (isTema(v) ? v : "dark");

/** Il valore di `data-theme` nell'HTML SSR: per "system" lo decide lo script in <head>. */
export const ssrDataTheme = (t: Tema): "dark" | "light" | undefined => (t === "system" ? undefined : t);

/* Per "system": tre righe, prima del primo paint (ScriptOnce si toglie da solo). */
export const SYSTEM_THEME_SCRIPT =
  `(function(){var d=document.documentElement;try{d.setAttribute("data-theme",matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}` +
  `catch(e){d.setAttribute("data-theme","dark")}})()`;

/** Solo browser: il cookie `tema`, se c'è e vale. */
export function readTemaCookie(): Tema | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)tema=([^;]*)/);
  const v = m ? decodeURIComponent(m[1]) : null;
  return isTema(v) ? v : null;
}

/** Solo browser: salva il tema per un anno (non httpOnly: lo scrive il client). */
export function writeTemaCookie(t: Tema): void {
  if (typeof document === "undefined") return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${TEMA_COOKIE}=${t}; Path=/; Max-Age=${ONE_YEAR_S}; SameSite=Lax${secure}`;
}

/* Migrazione una tantum: chi aveva scelto un tema sul vecchio sito lo aveva in
   localStorage. Se non c'è ancora il cookie, quel valore diventa il cookie;
   in ogni caso la vecchia chiave si toglie. Restituisce il tema migrato (o null). */
export function migrateLegacyTheme(): Tema | null {
  if (typeof window === "undefined") return null;
  let legacy: string | null = null;
  try { legacy = localStorage.getItem(LEGACY_THEME_KEY); } catch { return null; }
  if (legacy === null) return null;
  try { localStorage.removeItem(LEGACY_THEME_KEY); } catch { /* modalità privata */ }
  if (readTemaCookie() !== null || !isTema(legacy)) return null;
  writeTemaCookie(legacy);
  return legacy;
}

/** Il tema effettivo da scrivere su <html data-theme>. */
export function resolveTema(t: Tema): "dark" | "light" {
  if (t !== "system") return t;
  try { return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch { return "dark"; }
}
