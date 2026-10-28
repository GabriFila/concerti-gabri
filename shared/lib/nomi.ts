/* ──────────────────────────────────────────────────────────────
   I nomi scritti da persone (compagni, "regalato da", partenze): come si
   confrontano e cosa sembrano. Puro e isomorfo: lo usano il server
   (convex/lib/refs.ts `chiave`, la partenza nuova di convex/departures.ts)
   e la scheda dell'Oracolo nel browser.

   - `chiaveNome`: la chiave di confronto unica (minuscole, niente accenti,
     spazi compressi). convex/lib/refs.ts la riesporta come `chiave`.
   - `sembraNomeCompleto` / `soprannomeSuggerito`: la regola dei soprannomi
     (CLAUDE.md): «Marco Rossi» → «Marco R.». Euristica: anche «Gian Marco»
     sembra un nome completo (falso positivo voluto: la scheda chiede, non
     blocca).
   - `simili`: i nomi già usati che potrebbero essere quello scritto
     («Marco» → «Marco R.», «Marco B.»).
   - `sembraIndirizzo`: il nome di una partenza è pubblico; uno che sembra
     un indirizzo («via Roma 3», «Piazza Duomo») non si accetta.
   ────────────────────────────────────────────────────────────── */

/** Chiave di confronto dei nomi: minuscole, senza accenti, spazi compressi. */
export const chiaveNome = (s: string): string =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const parole = (n: string) => n.trim().split(/\s+/).filter(Boolean);
const maiuscola = (p: string) => /^\p{Lu}/u.test(p);

/** 2–3 parole, ognuna con l'iniziale maiuscola; l'ultima di almeno 3 lettere e senza punto finale. */
export function sembraNomeCompleto(n: string): boolean {
  const p = parole(n);
  if (p.length < 2 || p.length > 3 || !p.every(maiuscola)) return false;
  const ultima = p[p.length - 1];
  return !ultima.endsWith(".") && (ultima.match(/\p{L}/gu) ?? []).length >= 3;
}

/** Il soprannome di un nome completo: «Marco Rossi» → «Marco R.», «Anna Maria Bianchi» → «Anna Maria B.»; altrimenti null. */
export function soprannomeSuggerito(n: string): string | null {
  if (!sembraNomeCompleto(n)) return null;
  const p = parole(n);
  const iniziale = [...p[p.length - 1]][0];
  return `${p.slice(0, -1).join(" ")} ${iniziale.toUpperCase()}.`;
}

/**
 * I nomi esistenti che potrebbero essere `nome`: la loro chiave contiene
 * quella di `nome` o comincia con la sua prima parola. Al massimo 5, mai il
 * nome stesso (stessa chiave).
 */
export function simili(nome: string, esistenti: readonly string[]): string[] {
  const k = chiaveNome(nome);
  if (!k) return [];
  const prima = k.split(" ")[0];
  const out: string[] = [];
  for (const e of esistenti) {
    const ke = chiaveNome(e);
    if (ke === k || out.some(x => chiaveNome(x) === ke)) continue;
    if (ke.includes(k) || ke === prima || ke.startsWith(`${prima} `)) out.push(e);
    if (out.length === 5) break;
  }
  return out;
}

// "località" finisce con una lettera accentata: `\b` non vale, quindi i confini sono lettere Unicode
const PAROLA_STRADA = /(?:^|[^\p{L}])(?:via|viale|piazza|p\.?zza|corso|largo|strada|vicolo|vico|salita|lungomare|località)(?![\p{L}])/iu;
// un numero civico da solo o in fondo: "Roma 3", "3B", "12"
const NUMERO_IN_FONDO = /(?:^|[^\p{L}\p{N}])\d{1,4}[a-z]?$/iu;

/** true se il nome sembra un indirizzo (via, piazza… o un numero civico in fondo). */
export function sembraIndirizzo(n: string): boolean {
  const s = n.trim();
  return PAROLA_STRADA.test(s) || NUMERO_IN_FONDO.test(s);
}

// un numero civico ovunque: "Via Roma 12", "Via dei Canarini 7, Genova"
const NUMERO_CIVICO = /(?:^|[^\p{L}\p{N}])\d{1,4}[a-z]?(?![\p{L}\p{N}])/iu;

/**
 * Per le venue, più stretto: via/piazza… E un numero civico («Via Roma 12», «Via dei Canarini 7, Genova»).
 * «Piazza San Marco» o «Fabrique 2» sono venue vere; il nome è pubblico nel catalogo condiviso.
 */
export function sembraIndirizzoCivico(n: string): boolean {
  const s = n.trim();
  return PAROLA_STRADA.test(s) && NUMERO_CIVICO.test(s);
}
