/* ──────────────────────────────────────────────────────────────
   Errori leggibili da persone e agenti (PIANO §5.3): `ConvexError` con
   `{code, messaggio, campo?, fix?}`. `fix` è un percorso della dashboard
   (`/<handle>/modifica#partenze`), che MCP rende assoluto. I messaggi non
   ripetono MAI i valori ricevuti: solo percorsi dei campi e regole.
   ────────────────────────────────────────────────────────────── */

import type { z } from "zod";

export const CODICI_ERRORE = [
  "unauthorized",
  "no_profile",
  "solo_dashboard",
  "not_found",
  "input_non_valido",
  "nome_sconosciuto",
  "in_uso",
  "conflitto",
  "handle_non_disponibile",
  "limite_superato",
  "geocoder_busy",
  "geocoder_unavailable",
  "departure_address_missing",
  "non_disponibile",
] as const;
export type CodiceErrore = (typeof CODICI_ERRORE)[number];

export interface ErroreDati {
  code: CodiceErrore;
  messaggio: string;
  campo?: string;
  fix?: string;
  [k: string]: unknown;
}

/**
 * Riassunto di un errore Zod senza valori: "concerts: almeno 2 elementi; date: …".
 * Usa solo i percorsi e i codici delle issue, mai `input`/`received`.
 *
 * Anche il percorso può contenere un valore ricevuto: le chiavi di un
 * `z.record` (es. `layout.titoli.<chiave>`) le sceglie il chiamante. Con lo
 * schema, ogni segmento si confronta con la forma: restano gli indici e i
 * nomi dei campi dichiarati, tutto il resto diventa `*`. Senza schema
 * restano solo indici e nomi brevi da identificatore.
 */
export function riassumiErroreZod(err: z.ZodError, schema?: z.ZodType): { messaggio: string; campo?: string } {
  const percorso = (p: readonly PropertyKey[]) => percorsoSicuro(p, schema).join(".");
  const parti = err.issues.slice(0, 5).map(i => `${percorso(i.path) || "(radice)"}: ${descriviIssue(i)}`);
  const campo = err.issues[0] ? percorso(err.issues[0].path) || undefined : undefined;
  return { messaggio: `input non valido — ${parti.join("; ")}`, campo };
}

/* ── percorsi senza valori ─────────────────────────────────────── */

type Def = { type: string; [k: string]: unknown };
const defDi = (s: unknown): Def | undefined => (s as { _zod?: { def?: Def } } | undefined)?._zod?.def;

/** Toglie i contenitori che non cambiano il percorso (optional, default, pipe…). */
function scarta(s: unknown): unknown {
  for (let i = 0; i < 20; i++) {
    const d = defDi(s);
    if (!d) return s;
    if (["optional", "nullable", "default", "prefault", "nonoptional", "readonly", "catch", "promise"].includes(d.type)) s = d.innerType;
    else if (d.type === "pipe") s = defDi(d.in)?.type === "transform" ? d.out : d.in;
    else if (d.type === "lazy") s = (d.getter as () => unknown)();
    else return s;
  }
  return s;
}

/** Le forme possibili di uno schema a questo livello (le unioni ne hanno più d'una). */
function forme(s: unknown): unknown[] {
  const x = scarta(s);
  const d = defDi(x);
  if (d?.type === "union") return (d.options as unknown[]).flatMap(forme);
  if (d?.type === "intersection") return [...forme(d.left), ...forme(d.right)];
  return x === undefined ? [] : [x];
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

/** Il percorso di una issue con i soli segmenti che non vengono dal chiamante. */
export function percorsoSicuro(path: readonly PropertyKey[], schema?: z.ZodType): string[] {
  let correnti: unknown[] = schema ? forme(schema) : [];
  let cieco = !schema; // fuori dalla forma nota: ogni nome diventa `*`
  return path.map(seg => {
    if (typeof seg === "number") {
      correnti = correnti.flatMap(s => {
        const d = defDi(s);
        if (d?.type === "array") return forme(d.element);
        if (d?.type === "tuple") return forme((d.items as unknown[])[seg] ?? d.rest);
        return [];
      });
      if (!correnti.length && schema) cieco = true;
      return String(seg);
    }
    if (typeof seg !== "string") return "*";
    if (!schema) return IDENT.test(seg) ? seg : "*";
    if (cieco) return "*";
    const oggetti = correnti.filter(s => defDi(s)?.type === "object" && Object.hasOwn(defDi(s)!.shape as object, seg));
    if (oggetti.length) {
      correnti = oggetti.flatMap(s => forme((defDi(s)!.shape as Record<string, unknown>)[seg]));
      return seg;
    }
    const record = correnti.filter(s => defDi(s)?.type === "record");
    if (record.length) {
      // la chiave di un record la sceglie il chiamante: mai nel messaggio
      correnti = record.flatMap(s => forme(defDi(s)!.valueType));
      return "*";
    }
    cieco = true;
    return "*";
  });
}

function descriviIssue(i: z.core.$ZodIssue): string {
  switch (i.code) {
    case "invalid_type":
      return `tipo atteso ${i.expected}`;
    case "too_small":
      return `troppo corto o piccolo (minimo ${String(i.minimum)})`;
    case "too_big":
      return `troppo lungo o grande (massimo ${String(i.maximum)})`;
    case "invalid_format":
      return "formato non valido";
    case "invalid_value":
      return "valore non ammesso";
    case "invalid_union":
      return "nessuna delle forme ammesse";
    case "unrecognized_keys":
      return "campi non previsti";
    case "custom":
      return "valore non valido";
    default:
      return "non valido";
  }
}
