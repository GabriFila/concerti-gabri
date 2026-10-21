/* Errori della pagina durante un test: console.error, eccezioni non gestite e,
   tra questi, quelli di idratazione di React. In produzione React non scrive
   il messaggio per esteso ma il codice dell'errore minificato (#418 testo o
   attributi diversi, #419/#421/#422/#423/#425 varianti di mismatch). */

import type { Page } from "@playwright/test";

const HYDRATION = /hydrat|Minified React error #(418|419|421|422|423|425)\b|did not match|server rendered HTML/i;

export interface PageErrors {
  /** Ogni console.error e ogni eccezione non gestita, nell'ordine. */
  all: string[];
  /** Solo quelli di idratazione (di `all`, o dell'elenco passato). */
  hydration: (list?: string[]) => string[];
}

export function watchErrors(page: Page): PageErrors {
  const all: string[] = [];
  page.on("console", m => { if (m.type() === "error") all.push("console: " + m.text().slice(0, 300)); });
  page.on("pageerror", e => all.push("pageerror: " + String(e.message).slice(0, 300)));
  return { all, hydration: (list = all) => list.filter(e => HYDRATION.test(e)) };
}
