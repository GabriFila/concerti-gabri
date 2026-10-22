/* Il file dell'upload, prima di mandarlo all'anteprima (importer.preview):
   formato, dimensione e i testi del riepilogo. Puro (lo prova file.test.ts). */

/** Il massimo di `contenuto` per import_concerts (importaConcertiInput). */
export const MAX_CARATTERI_IMPORT = 500_000;

export type Formato = "csv" | "json";

/** Il formato dal nome del file; senza estensione nota, dal primo carattere. */
export function formatoDi(nome: string, testo: string): Formato {
  const est = nome.toLowerCase().split(".").pop() ?? "";
  if (est === "json") return "json";
  if (["csv", "tsv", "txt"].includes(est)) return "csv";
  return /^﻿?\s*[[{]/.test(testo) ? "json" : "csv";
}

/** null se il file va bene, altrimenti il motivo (senza ripetere il contenuto). */
export function problemaFile(byte: number, testo?: string): string | null {
  if (byte === 0 || testo?.trim() === "") return "il file è vuoto";
  if (byte > MAX_CARATTERI_IMPORT * 4 || (testo !== undefined && testo.length > MAX_CARATTERI_IMPORT)) {
    return `il file è troppo grande: al massimo ${MAX_CARATTERI_IMPORT / 1000} mila caratteri per import (dividilo in più file)`;
  }
  return null;
}

const plurale = (n: number, uno: string, tanti: string) => `${n} ${n === 1 ? uno : tanti}`;

/** "12 righe: 10 concerti e 1 festival (12 concerti in tutto)". */
export function riassuntoAnteprima(p: { righe: number; voci: number; festival: number; concerti: number }): string {
  const singoli = p.voci - p.festival;
  const parti = [
    singoli ? plurale(singoli, "concerto", "concerti") : "",
    p.festival ? plurale(p.festival, "festival", "festival") : "",
  ].filter(Boolean);
  const tutti = p.festival ? ` (${plurale(p.concerti, "concerto", "concerti")} in tutto)` : "";
  return `${plurale(p.righe, "riga", "righe")}: ${parti.join(" e ") || "nessun concerto"}${tutti}`;
}

/** L'esito dell'import in una frase. */
export function riassuntoEsito(e: { importate: number; totale: number; personeAggiunte?: number; regaliAggiunti?: number }): string {
  const base =
    e.importate !== e.totale ? `Importate ${e.importate} voci su ${e.totale}` : e.importate === 1 ? "Importata 1 voce" : `Importate ${e.importate} voci`;
  const nuovi = [
    e.personeAggiunte ? plurale(e.personeAggiunte, "persona nuova", "persone nuove") : "",
    e.regaliAggiunti ? `${plurale(e.regaliAggiunti, '"regalato da" nuovo', '"regalato da" nuovi')}` : "",
  ].filter(Boolean);
  return nuovi.length ? `${base}, con ${nuovi.join(" e ")}.` : `${base}.`;
}

/** Il messaggio di un errore di riga senza ripetere la colonna, che la UI mostra già ("voto: serve…" → "serve…"). */
export function messaggioRiga(e: { campo?: string; messaggio: string }): string {
  let m = e.messaggio.replace(/^input non valido — /, "");
  if (e.campo && m.startsWith(`${e.campo}:`)) m = m.slice(e.campo.length + 1).trim();
  return m;
}
