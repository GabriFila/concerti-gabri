/* Errori Convex `{code, messaggio, campo?, fix?}` (PIANO §5.3) e validazione
   Zod dentro gli handler: i messaggi non ripetono mai i valori ricevuti. */

import { ConvexError } from "convex/values";
import type { z } from "zod";
import { riassumiErroreZod, type CodiceErrore } from "../../shared/schema/errors.ts";

export function errore(code: CodiceErrore, messaggio: string, extra: { campo?: string; fix?: string; [k: string]: string | number | boolean | string[] | undefined } = {}) {
  const data: Record<string, string | number | boolean | string[]> = { code, messaggio };
  for (const [k, val] of Object.entries(extra)) if (val !== undefined) data[k] = val;
  return new ConvexError(data);
}

/** Valida `raw` con lo schema; in caso d'errore solo percorsi e regole. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw ?? {});
  if (!r.success) {
    const { messaggio, campo } = riassumiErroreZod(r.error, schema);
    throw errore("input_non_valido", messaggio, { campo });
  }
  return r.data;
}

export const codiceDi = (e: unknown): string | undefined => {
  const data = (e as { data?: unknown })?.data;
  return data && typeof data === "object" && "code" in data ? String((data as { code: unknown }).code) : undefined;
};
