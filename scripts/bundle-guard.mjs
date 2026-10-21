#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Guardia del bundle client: dopo un build, controlla che nei file
   serviti al browser non sia finito niente che deve restare sul server.

     node scripts/bundle-guard.mjs [dir]

   dir: la cartella degli asset pubblici; senza, la prima che esiste tra
   .vercel/output/static (build Vercel) e .output/public (build locale).

   Cerca, confrontando in memoria e stampando solo NOMI, mai valori:
   - i valori dei segreti presenti nell'ambiente o in .env.local (nomi con
     SECRET/TOKEN/KEY/PASSWORD, tranne i VITE_*, che sono pubblici per
     costruzione), compreso VERCEL_AUTOMATION_BYPASS_SECRET;
   - le coordinate di casa, lette al momento da `git show main:CLAUDE.md`
     (mai riscritte da nessuna parte);
   - codice solo-server: `convex/server`, il prompt di sistema
     dell'Oracolo, i limiti d'uso;
   - i NOMI delle variabili d'ambiente solo-server: quelli letti dal codice
     server (src/server, src/routes/api, src/root, src/server.ts), trovati
     al momento, più un elenco fisso (chiavi, segreti, E2E_NOW…). Un nome
     nel bundle vuol dire che il client legge (o prova a leggere) l'ambiente
     del server.
   Con `fnox exec -- node scripts/bundle-guard.mjs` controlla anche i valori
   dei segreti che non stanno in .env.local.
   Esce con 1 se trova qualcosa.
   ────────────────────────────────────────────────────────────── */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(ROOT, ".env.local"))) process.loadEnvFile(join(ROOT, ".env.local"));

const dir = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : [join(ROOT, ".vercel/output/static"), join(ROOT, ".output/public")].find(existsSync);
if (!dir || !existsSync(dir)) {
  console.error("bundle-guard: nessuna cartella di build (lancia prima `pnpm build`)");
  process.exit(2);
}

const TEXT = /\.(m?js|css|html|json|webmanifest|txt|map|svg)$/i;
const files = [];
(function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (TEXT.test(name)) files.push(p);
  }
})(dir);

/** [etichetta, valore] da cercare; l'etichetta è l'unica cosa che si stampa. */
const needles = [];

// 1. segreti dall'ambiente (valori in memoria, solo i nomi in output)
const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|_KEY\b|_KEY_|API_KEY|DEPLOY_KEY)/;
for (const [name, value] of Object.entries(process.env)) {
  if (!value || value.length < 8) continue;
  if (name.startsWith("VITE_") || !SECRET_NAME.test(name)) continue;
  needles.push([`segreto ${name}`, value]);
}

// 2. coordinate di casa da main:CLAUDE.md, in più formati
try {
  const md = execFileSync("git", ["show", "main:CLAUDE.md"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const line = md.split("\n").find(l => /home `\[lng,lat\]`/.test(l)) || "";
  // solo le coppie tra backtick (`[lng, lat]`): sulla stessa riga c'è anche il range del jitter
  const pairs = [...line.matchAll(/`\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]`/g)];
  pairs.forEach((m, i) => {
    for (const v of [m[1], m[2]]) {
      const [int, dec] = v.split(".");
      for (const n of [4, 5, dec.length]) {
        if (dec.length >= n) {
          needles.push([`coordinata di casa #${i + 1}`, `${int}.${dec.slice(0, n)}`]);
          needles.push([`coordinata di casa #${i + 1}`, `${int},${dec.slice(0, n)}`]);
        }
      }
    }
  });
  if (!pairs.length) console.warn("bundle-guard: coordinate di casa non trovate in main:CLAUDE.md (controllo saltato)");
} catch {
  console.warn("bundle-guard: `git show main:CLAUDE.md` non riuscito (controllo delle coordinate saltato)");
}

// 3. codice che vive solo sul server
for (const marker of ["convex/server", "STRICT SCOPE — read carefully", "MemoryRateLimiter"]) {
  needles.push([`codice server: ${marker}`, marker]);
}

// 4. nomi delle variabili d'ambiente solo-server (mai i VITE_*, pubblici per costruzione)
const SERVER_ENV_FIXED = [
  "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL", "CHAT_SERVER_SECRET", "BETTER_AUTH_SECRET",
  "VERCEL_AUTOMATION_BYPASS_SECRET", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "CONVEX_DEPLOY_KEY",
  "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "SENTRY_AUTH_TOKEN", "E2E_NOW", "ORACOLO_FAKE",
];
const SERVER_CODE = ["src/server", "src/routes/api", "src/root", "src/server.ts"];
const ENV_NAME = /(?:process\.env|\benv)(?:\.|\[["'])([A-Z][A-Z0-9_]+)/g;
const serverEnv = new Set(SERVER_ENV_FIXED);
for (const p of SERVER_CODE) (function scan(q) {
  if (!existsSync(q)) return;
  if (statSync(q).isDirectory()) return readdirSync(q).forEach(n => scan(join(q, n)));
  if (!/\.(m?[jt]sx?)$/.test(q) || /\.test\.[jt]sx?$/.test(q)) return;
  for (const m of readFileSync(q, "utf8").matchAll(ENV_NAME)) serverEnv.add(m[1]);
})(join(ROOT, p));
for (const name of serverEnv) {
  // i nomi corti o generici (E2E, PORT, VERCEL) comparirebbero per caso nel codice delle librerie
  if (name.startsWith("VITE_") || name === "NODE_ENV" || name.length < 8) continue;
  needles.push([`nome di variabile server: ${name}`, name]);
}

const hits = new Map(); // etichetta → file
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const [label, value] of needles) {
    if (text.includes(value)) {
      const where = hits.get(label) || new Set();
      where.add(relative(ROOT, f));
      hits.set(label, where);
    }
  }
}

console.log(`bundle-guard: ${files.length} file in ${relative(ROOT, dir) || dir}, ${new Set(needles.map(n => n[0])).size} controlli`);
if (!hits.size) {
  console.log("bundle-guard: OK, nessuna fuga");
  process.exit(0);
}
for (const [label, where] of hits) console.log(`  KO ${label}: ${[...where].slice(0, 5).join(", ")}`);
process.exit(1);
