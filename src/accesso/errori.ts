/* Il messaggio per la UI di un errore di Convex (`ConvexError` con
   `{code, messaggio, campo?, fix?}`, PIANO §5.3): i messaggi del server
   sono già in italiano e non ripetono mai i valori ricevuti. */

import { ConvexError } from "convex/values";

export interface DatiErrore {
  code?: string;
  messaggio?: string;
  campo?: string;
  fix?: string;
}

export function datiErrore(e: unknown): DatiErrore | null {
  if (!(e instanceof ConvexError)) return null;
  const d = e.data as unknown;
  return d && typeof d === "object" ? (d as DatiErrore) : null;
}

/** "esiste già una partenza…" → "Esiste già una partenza…." per la UI. */
export function messaggioErrore(e: unknown, predefinito = "Qualcosa non ha funzionato: riprova tra poco."): string {
  const m = datiErrore(e)?.messaggio?.trim();
  if (!m) return predefinito;
  const frase = m[0].toUpperCase() + m.slice(1);
  return /[.!?]$/.test(frase) ? frase : frase + ".";
}
