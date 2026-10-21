/* ──────────────────────────────────────────────────────────────
   Zod (shared/schema, puro) → validatori Convex. È l'unico punto in cui
   gli id "brandizzati" di shared/schema/ids.ts diventano `v.id(<tabella>)`
   (PIANO §5.3). Copre il sottoinsieme di Zod usato dagli schemi: oggetti,
   stringhe, numeri, booleani, letterali, enum, unioni, array, record,
   opzionali, nullable, pipe/transform (si usa l'ingresso) e any.
   ────────────────────────────────────────────────────────────── */

import { v, type GenericValidator, type PropertyValidators, type Validator } from "convex/values";
import type { z } from "zod";
import { tabellaDiId } from "../../shared/schema/ids.ts";

type AnyZod = z.ZodType & { def: any };

export function zodToConvex(schema: z.ZodType): GenericValidator {
  const s = schema as AnyZod;
  const table = tabellaDiId(s);
  if (table) return v.id(table);
  const def = s.def;
  switch (def.type) {
    case "string":
      return v.string();
    case "number":
      return v.number();
    case "boolean":
      return v.boolean();
    case "null":
      return v.null();
    case "any":
    case "unknown":
      return v.any();
    case "literal": {
      const vals = def.values as unknown[];
      const lits = vals.map(x => v.literal(x as string | number | boolean));
      return lits.length === 1 ? lits[0] : v.union(...lits);
    }
    case "enum": {
      const vals = Object.values(def.entries as Record<string, string | number>);
      const lits = vals.map(x => v.literal(x));
      return lits.length === 1 ? lits[0] : v.union(...lits);
    }
    case "union":
      return v.union(...(def.options as z.ZodType[]).map(zodToConvex));
    case "array":
      return v.array(zodToConvex(def.element));
    case "record":
      return v.record(zodToConvex(def.keyType) as Validator<string, "required", any>, zodToConvex(def.valueType));
    case "object":
      return v.object(zodFieldsToConvex(def.shape));
    case "optional":
      return v.optional(zodToConvex(def.innerType));
    case "nullable":
      return v.union(zodToConvex(def.innerType), v.null());
    case "default":
      return v.optional(zodToConvex(def.innerType));
    case "pipe":
      // il valore che arriva al DB è quello d'ingresso
      return zodToConvex(def.in);
    case "readonly":
      return zodToConvex(def.innerType);
    default:
      throw new Error(`zodToConvex: tipo Zod non supportato (${String(def.type)})`);
  }
}

export function zodFieldsToConvex(shape: Record<string, z.ZodType>): PropertyValidators {
  const out: PropertyValidators = {};
  for (const [k, f] of Object.entries(shape)) out[k] = zodToConvex(f);
  return out;
}
