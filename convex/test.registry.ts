/// <reference types="vite/client" />
/* Il registro delle funzioni di convex/, ricavato dagli export dei moduli
   (nessun elenco centrale). Usato da registry.test.ts e isolation.test.ts.
   Il nome ha due punti: la CLI Convex non lo pubblica.

   Il glob segue le regole della CLI Convex (bundler/index.js, entryPoints):
   ogni estensione che può definire funzioni (.ts .tsx .js .mjs .cjs .mts
   .cts .jsx), compresi http.ts e crons.ts (i loro export di default non sono
   funzioni e si saltano, ma un export con nome sì), esclusi solo i file che
   la CLI non pubblica: _generated/, schema.ts/js, i nomi con più di un punto
   (test, test.*, convex.config.ts), i dotfile e il componente locale
   betterAuth/ (una cartella con convex.config.ts è un componente: le sue
   funzioni non sono API dell'app). registry.test.ts verifica che nessun
   file pubblicabile resti fuori da questo glob. */

import { metaOf, type FnMeta } from "./lib/builders.ts";

export const ESTENSIONI_CONVEX = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts", ".jsx"];

const moduli = import.meta.glob(
  ["./**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}", "!./**/*.*.*", "!./_generated/**", "!./**/schema.{ts,js}", "!./betterAuth/**", "!./_deps/**"],
  { eager: true },
) as Record<string, Record<string, unknown>>;

/** I file caricati dal registro, relativi a convex/ ("people.ts", "lib/km.ts"…). */
export const FILE_DEL_REGISTRO = Object.keys(moduli).map(f => f.replace(/^\.\//, "")).sort();

export interface Funzione {
  path: string; // "modulo:nome"
  fn: { isQuery?: boolean; isMutation?: boolean; isAction?: boolean; isPublic?: boolean; isInternal?: boolean; exportArgs(): string; exportReturns(): string | null };
  meta: FnMeta | undefined;
}

export function registro(): Funzione[] {
  const out: Funzione[] = [];
  for (const [file, mod] of Object.entries(moduli)) {
    const modulo = file.replace(/^\.\//, "").replace(/\.[cm]?[jt]sx?$/, "");
    for (const [nome, val] of Object.entries(mod)) {
      const f = val as Funzione["fn"];
      if (typeof f !== "function" || !(f.isQuery || f.isMutation || f.isAction)) continue;
      out.push({ path: `${modulo}:${nome}`, fn: f, meta: metaOf(f) });
    }
  }
  return out;
}
