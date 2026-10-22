/* ──────────────────────────────────────────────────────────────
   Gli strumenti MCP, generati dal catalogo (shared/agent/catalog.ts): uno
   per operazione, con la sua descrizione, il suo input e la sua funzione
   Convex. Niente elenco a mano: tools.test.ts verifica strumenti = catalogo.

   - Descrizioni: quella del catalogo, più la regola dei soprannomi ("Marco
     Rossi" → "Marco R.") dove si inseriscono nomi di persona, le scale dove
     ci sono voto, vicinanza o canzoni note, e il link a #partenze quando
     manca un indirizzo (PIANO §1.42).
   - Input: lo schema del catalogo per il JSON Schema che vede il client; la
     validazione la fa Convex con lo STESSO schema (lib/builders.ts), così gli
     errori sono sempre `{code, messaggio}` e non ripetono mai i valori.
   - Output: nessuno strumento legge o scrive indirizzi; per sicurezza ogni
     risposta perde comunque le chiavi address/lat/lng/coordinate, e i `fix`
     della dashboard diventano URL assoluti.
   ────────────────────────────────────────────────────────────── */

import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { CATALOGO, type OperazioneCatalogo } from "../../../shared/agent/catalog.ts";
import { canzoniNoteScale, vicinanzaScale } from "../../../shared/model/scale.ts";
import { REGOLA_SOPRANNOMI } from "../../../shared/schema/campi.ts";
import { COLONNE_CSV, CONFIRM_IMPORT_ROWS, SEPARATORE_CON } from "../../../shared/schema/importFormat.ts";
import { erroreStrumento, type ErroreMcp } from "./errori.ts";

/** Chiama la funzione Convex di un'operazione con l'input dell'agente. */
export type Chiamata = (op: OperazioneCatalogo, input: unknown) => Promise<unknown>;

export const TESTO_SCALE = `Scale (più alto = meglio): voto 1–5; vicinanza ${vicinanzaScale()}; canzoni note ${canzoniNoteScale()} oppure "na".`;

/* ── JSON Schema dell'input ───────────────────────────────────── */

type Js = Record<string, unknown> & { properties?: Record<string, unknown>; required?: string[]; oneOf?: Js[]; anyOf?: Js[]; type?: unknown };

/**
 * Un'unione di oggetti alla radice (concerto | festival) diventa un oggetto
 * solo, con le proprietà di tutte le varianti: molti client (e l'API di
 * Claude) rifiutano oneOf/anyOf alla radice di un input_schema. La forma
 * esatta la controlla Convex.
 */
export function appiattisci(js: Js): Js {
  const varianti = js.oneOf ?? js.anyOf;
  if (!varianti || !varianti.every(v => v.type === "object")) return js;
  const properties: Record<string, unknown> = {};
  for (const v of varianti) {
    for (const [k, s] of Object.entries(v.properties ?? {})) {
      const prima = properties[k] as Js | undefined;
      if (!prima) properties[k] = s;
      else if (JSON.stringify(prima) !== JSON.stringify(s)) {
        const opzioni = [...((prima.anyOf as unknown[] | undefined) ?? [prima]), s];
        properties[k] = { anyOf: opzioni.filter((x, i) => opzioni.findIndex(y => JSON.stringify(y) === JSON.stringify(x)) === i) };
      }
    }
  }
  const required = varianti.map(v => v.required ?? []).reduce((a, b) => a.filter(x => b.includes(x)));
  const { oneOf: _o, anyOf: _a, ...resto } = js;
  void _o;
  void _a;
  return { ...resto, type: "object", properties, required };
}

/** Il JSON Schema dell'input (lato client) di uno schema del catalogo. */
export function jsonSchemaInput(schema: z.ZodType, target = "draft-2020-12"): Js {
  const std = (schema as unknown as { "~standard": { jsonSchema: { input: (o: { target: string }) => Js } } })["~standard"];
  return appiattisci(std.jsonSchema.input({ target }));
}

/**
 * Lo schema per l'SDK: JSON Schema dal catalogo, validazione rimandata a
 * Convex (che usa lo stesso schema e dà errori senza valori).
 */
export function inputPerMcp(schema: z.ZodType): StandardSchemaWithJSON<unknown, unknown> {
  const appiattito = (opts: { target: string }) => jsonSchemaInput(schema, opts.target);
  return {
    "~standard": {
      version: 1,
      vendor: "concerti",
      validate: (value: unknown) => ({ value }),
      jsonSchema: { input: appiattito, output: appiattito },
    },
  } as unknown as StandardSchemaWithJSON<unknown, unknown>;
}

/* ── descrizioni ──────────────────────────────────────────────── */

const testoSchema = (op: OperazioneCatalogo) => JSON.stringify(jsonSchemaInput(op.input));

/** Lo strumento fa inserire nomi di persone (compagni o "regalato da")? */
export const inserisceNomi = (op: OperazioneCatalogo) =>
  op.tipo === "scrittura" && (/"(with|giftFrom|label)"/.test(testoSchema(op)) || testoSchema(op).includes("Marco R.") || op.name === "import_concerts");

/** Lo strumento tocca voto, vicinanza o canzoni note? */
export const usaScale = (op: OperazioneCatalogo) =>
  /"(voto|vicinanza|canzoniNote)"/.test(testoSchema(op)) || ["list_concerts", "get_concert", "import_concerts"].includes(op.name);

const AVVISO_PARTENZA =
  "Se la partenza non ha ancora l'indirizzo, la risposta ha avviso: \"departure_address_missing\" e un link `fix` alla dashboard (#partenze): dallo all'utente, gli indirizzi non passano mai dagli agenti.";

const FORMATO_IMPORT =
  `CSV con intestazione ${COLONNE_CSV.join(",")}; "con" separato da "${SEPARATORE_CON}"; tipo concerto|festival (le righe festival con stessi festival, venue e data sono un festival). ` +
  `Oppure JSON: un array nella stessa forma di add_concert. Venue e partenze devono esistere; persone e "regalato da" nuovi vengono creati. Sopra le ${CONFIRM_IMPORT_ROWS} righe serve confirm: true dopo la conferma dell'utente.`;

export function descrizioneStrumento(op: OperazioneCatalogo): string {
  const parti = [op.descrizione];
  const tutto = () => parti.join(" ");
  if (inserisceNomi(op) && !tutto().includes("Marco R")) parti.push(REGOLA_SOPRANNOMI + ".");
  if (usaScale(op) && !tutto().includes("Transenna")) parti.push(TESTO_SCALE);
  if (op.name === "import_concerts") parti.push(FORMATO_IMPORT);
  if (["add_concert", "update_concert", "import_concerts"].includes(op.name)) parti.push(AVVISO_PARTENZA);
  return tutto();
}

/* ── risposte ─────────────────────────────────────────────────── */

const CHIAVI_PRIVATE = /^(address|indirizzo|indirizzi|lat|lng|lon|latitude|longitude|coords|coordinate|coordinates)$/i;

/** Toglie le chiavi private (a ogni livello) e rende assoluti i `fix` della dashboard. */
export function proietta(x: unknown, origine: string): unknown {
  if (Array.isArray(x)) return x.map(y => proietta(y, origine));
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(x)) {
      if (CHIAVI_PRIVATE.test(k)) continue;
      out[k] = k === "fix" && typeof val === "string" && val.startsWith("/") ? `${origine}${val}` : proietta(val, origine);
    }
    return out;
  }
  return x;
}

const testoJson = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x ?? null) }] });

/** Il risultato di uno strumento: JSON in un blocco di testo (ogni client lo legge). */
export const risultatoOk = (x: unknown, origine: string) => testoJson(proietta(x, origine));
export const risultatoErrore = (e: ErroreMcp) => ({ ...testoJson(e), isError: true });

/* ── registrazione ────────────────────────────────────────────── */

/** Registra uno strumento per ogni operazione del catalogo. */
export function registraStrumenti(server: McpServer, chiama: Chiamata, origine: string) {
  for (const op of CATALOGO) {
    server.registerTool(
      op.name,
      {
        description: descrizioneStrumento(op),
        inputSchema: inputPerMcp(op.input),
        annotations: {
          readOnlyHint: op.tipo === "lettura",
          destructiveHint: op.tipo === "scrittura" && !!op.confirm,
          openWorldHint: op.name === "search_venue",
        },
      },
      async (args: unknown) => {
        try {
          return risultatoOk(await chiama(op, args ?? {}), origine);
        } catch (e) {
          return risultatoErrore(erroreStrumento(e, origine));
        }
      },
    );
  }
}

/** Le istruzioni del server per l'agente (le legge all'inizio della sessione). */
export const ISTRUZIONI_MCP = [
  "Questo server gestisce la pagina dei concerti del suo proprietario (solo la sua).",
  "A inizio sessione chiama list_concerts con da_completare: true e proponi di completare voto, vicinanza, canzoni note e commento dei concerti passati.",
  `Nomi di persone: ${REGOLA_SOPRANNOMI}.`,
  TESTO_SCALE,
  "Gli indirizzi delle partenze non passano mai da qui: se servono, l'utente li imposta dalla dashboard (#partenze).",
  "Le cancellazioni e gli import sopra le 10 righe vogliono confirm: true, solo dopo la conferma esplicita dell'utente. Ogni scrittura si annulla con undo.",
].join("\n");
