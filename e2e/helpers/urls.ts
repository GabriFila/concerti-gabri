/* Le origini dei test in locale (playwright.config.ts le serve con webServer). */

/** Start, build di produzione con l'orologio congelato: un'origine ammessa dal token Mapbox. */
export const START_URL = "http://localhost:3100";
/** La build di `main` (scripts/parita-main.mjs), solo per la parità. */
export const MAIN_URL = "http://localhost:4173";
