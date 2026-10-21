#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   `wt exec` (PIANO §4.2–4.3): lancia un comando nel worktree con un
   ambiente RIPULITO, così convex, vite, vitest e playwright non vedono
   mai il deployment condiviso, le preview o la produzione.

     node scripts/wt.mjs exec [--names] -- <cmd> [argomenti…]
     node scripts/wt.mjs names       solo i NOMI delle variabili del figlio
     node scripts/wt.mjs check       controlla .env.worktree (tipo e host)

   L'ambiente del figlio si costruisce da zero, mai per sottrazione:
   1. dal genitore passano solo i nomi in PARENT_ALLOW (PATH, HOME, TERM,
      LANG, TZ, CONVEX_TMPDIR, PORT di portless, i flag dei test locali…).
      CONVEX_*, VITE_CONVEX_*, *_PROD, *_PREVIEW, CONVEX_DEPLOY_KEY*,
      BETTER_AUTH_SECRET*, VERCEL_* e ogni altro segreto della sessione
      restano fuori;
   2. dal `.env.local` del worktree (o, se manca lì, dal genitore) solo le
      variabili dell'app che non riguardano Convex: VITE_* pubbliche (non
      VITE_CONVEX_*, non VITE_SITE_URL) e la chiave di Gemini;
   3. tutto `.env.worktree` (scritto da scripts/convex-locale.mjs): il
      deployment LOCALE del worktree, i suoi URL 127.0.0.1 e i segreti
      generati per lui. Un `.env.worktree` che punta a un deployment cloud
      o contiene nomi vietati ferma tutto;
   4. WT_ENV=1 e WT_ROOT;
   5. CONVEX_OVERRIDE_ACCESS_TOKEN con un valore finto: la CLI Convex usa
      quello al posto del login globale (~/.convex/config.json), quindi dal
      worktree non può risolvere nessun deployment cloud (`--deployment`,
      nomi, preview, prod: il server di Convex lo rifiuta). Il backend
      locale anonimo non ha bisogno di login.

   Inoltre rifiuta gli argomenti pericolosi (`deploy`, `--prod`, `prod`,
   `production`, `brave-chickadee`, il dev condiviso, `preview/…`,
   `--admin-key`, `--deployment`…), le assegnazioni `NOME=valore` di nomi
   Convex o vietati, i comandi Convex dentro una stringa (`sh -c`) e le
   chiamate alla CLI Convex senza `--env-file` uguale al `.env.worktree` di
   QUESTO worktree.

   Non stampa mai valori: `--names`/`names` elencano solo i nomi.
   ────────────────────────────────────────────────────────────── */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const WORKTREE_ENV = ".env.worktree";

/* ── 1. dal genitore: solo questi nomi ─────────────────────────── */
export const PARENT_ALLOW = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM", "COLORTERM",
  "LANG", "LANGUAGE", "TZ", "TMPDIR", "CONVEX_TMPDIR",
  "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME",
  "NODE_OPTIONS", "CI", "FORCE_COLOR", "NO_COLOR", "PNPM_HOME", "PLAYWRIGHT_BROWSERS_PATH",
  // portless passa la porta al figlio
  "PORT",
  // flag dei test locali (PIANO §10: mai su Vercel)
  "E2E", "E2E_NOW", "VITE_E2E", "ORACOLO_FAKE", "PREVIEW_URL",
]);
const PARENT_ALLOW_RE = [/^LC_[A-Z_]+$/];

/* ── 2. variabili dell'app (da .env.local o dal genitore) ──────── */
const APP_EXACT = new Set(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_MODEL"]);
export function isAppVar(name) {
  if (APP_EXACT.has(name)) return true;
  if (!/^VITE_/.test(name)) return false;
  if (/^VITE_CONVEX_/.test(name)) return false; // il deployment arriva solo da .env.worktree
  if (name === "VITE_SITE_URL") return false; // è l'URL tailnet del checkout principale
  return true;
}

/* ── nomi che non passano MAI, da nessuna fonte ────────────────── */
const NEVER = [
  /_PROD$/i, /_PREVIEW$/i, /^CONVEX_DEPLOY_KEY/i, /^BETTER_AUTH_SECRET/i,
  /^VERCEL_/i, /^UPSTASH_/i, /^CONVEX_SELF_HOSTED_/i, /^SENTRY_AUTH_TOKEN$/i,
];
export const isNever = name => NEVER.some(re => re.test(name));

/* In .env.worktree sono ammessi solo questi nomi Convex. */
const WORKTREE_CONVEX = new Set(["CONVEX_DEPLOYMENT", "CONVEX_URL", "CONVEX_SITE_URL", "VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL"]);

/** Parser dotenv minimo (KEY=VALUE, `export`, commenti, virgolette). */
export function parseDotenv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    const q = v[0];
    if ((q === '"' || q === "'") && v.indexOf(q, 1) > 0) {
      v = v.slice(1, v.indexOf(q, 1));
      if (q === '"') v = v.replace(/\\n/g, "\n");
    } else {
      v = v.replace(/\s+#.*$/, "").trim();
    }
    out[m[1]] = v;
  }
  return out;
}

const isLocalHost = url => {
  try {
    const u = new URL(url);
    return u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch {
    return false;
  }
};

/** Tipo del deployment in CONVEX_DEPLOYMENT ("anonymous:…" → "anonymous"). */
export const deploymentKind = value => (value && value.includes(":") ? value.slice(0, value.indexOf(":")) : null);

/**
 * Controlla il contenuto di .env.worktree. Restituisce l'elenco dei problemi
 * (solo nomi e motivi, mai valori).
 */
export function checkWorktreeEnv(wt) {
  const problems = [];
  for (const name of Object.keys(wt)) {
    if (isNever(name)) problems.push(`${name}: nome vietato in ${WORKTREE_ENV}`);
    else if (/CONVEX/.test(name) && !WORKTREE_CONVEX.has(name)) problems.push(`${name}: variabile Convex non ammessa in ${WORKTREE_ENV}`);
  }
  const kind = deploymentKind(wt.CONVEX_DEPLOYMENT);
  if (!wt.CONVEX_DEPLOYMENT) problems.push(`CONVEX_DEPLOYMENT manca in ${WORKTREE_ENV}`);
  else if (kind !== "anonymous" && kind !== "local") problems.push(`CONVEX_DEPLOYMENT non è un deployment locale (tipo "${kind ?? "?"}")`);
  if (/agile-leopard|brave-chickadee/i.test(wt.CONVEX_DEPLOYMENT ?? "")) problems.push("CONVEX_DEPLOYMENT punta a un deployment condiviso");
  for (const name of ["VITE_CONVEX_URL", "VITE_CONVEX_SITE_URL", "CONVEX_URL", "CONVEX_SITE_URL"]) {
    if (wt[name] !== undefined && !isLocalHost(wt[name])) problems.push(`${name}: non è un URL http://127.0.0.1`);
  }
  if (!wt.VITE_CONVEX_URL) problems.push(`VITE_CONVEX_URL manca in ${WORKTREE_ENV}`);
  return problems;
}

/**
 * L'ambiente del figlio. `parent` = process.env, `envLocal` e `envWorktree`
 * = file già letti (oggetti) o null.
 */
export function buildEnv({ parent = {}, envLocal = null, envWorktree = null } = {}) {
  const env = {};
  for (const [name, value] of Object.entries(parent)) {
    if (value === undefined || isNever(name)) continue;
    if (PARENT_ALLOW.has(name) || PARENT_ALLOW_RE.some(re => re.test(name))) env[name] = value;
  }
  // app: prima il genitore (solo nomi dell'app), poi .env.local che vince
  for (const src of [parent, envLocal ?? {}]) {
    for (const [name, value] of Object.entries(src)) {
      if (value !== undefined && isAppVar(name) && !isNever(name)) env[name] = value;
    }
  }
  if (envWorktree) {
    for (const [name, value] of Object.entries(envWorktree)) {
      if (!isNever(name)) env[name] = value;
    }
  }
  env.WT_ENV = "1";
  // la CLI Convex non vede mai il login globale (vedi l'intestazione, punto 5)
  env.CONVEX_OVERRIDE_ACCESS_TOKEN = NESSUN_LOGIN;
  return env;
}

/** Il token finto che sostituisce il login globale della CLI Convex (non è un segreto). */
export const NESSUN_LOGIN = "wt-nessun-login";

/* ── argomenti ─────────────────────────────────────────────────── */
const FORBIDDEN = [
  [/\bdeploy\b/i, "`deploy`"],
  [/--prod\b/i, "`--prod`"],
  [/\bprod\b/i, "`prod`"],
  [/\bproduction\b/i, "`production`"],
  [/brave-chickadee/i, "il deployment di produzione"],
  [/agile-leopard/i, "il dev condiviso"],
  [/\bpreview\//i, "un deployment di preview"],
  [/--preview-(?:create|run|name)\b/i, "le opzioni di preview"],
  [/--admin-key\b/i, "`--admin-key`"],
  [/--deployment(?:-name)?\b/i, "`--deployment`"],
  [/--override-auth/i, "`--override-auth-*`"],
];

const CONVEX_SUBCOMMANDS = new Set([
  "dev", "run", "env", "logs", "data", "deployment", "deployments", "codegen", "import", "export",
  "function-spec", "insights", "network-test", "dashboard", "init", "reinit", "login", "logout",
  "mcp", "typecheck", "usage", "deploy",
]);
// la CLI accetta questi senza --env-file (non toccano un deployment)
const CONVEX_NO_ENVFILE_OK = new Set(["docs", "--help", "-h", "--version", "-V", "help"]);
// mai da un worktree: cambiano il login globale o creano/selezionano deployment
const CONVEX_REFUSED = new Set(["login", "logout", "deployment", "init", "reinit", "deploy", "dashboard"]);

/** La CLI Convex come argomento: `convex`, `convex@1.47`, `node_modules/.bin/convex`, il suo main.js. */
const CONVEX_CLI_RE = /(^|\/)(?:convex(@[\w.^~-]+)?|convex\/bin\/main\.js|convex\/dist\/cli\.bundle\.c?js)$/;
const isSubcommand = a => CONVEX_SUBCOMMANDS.has(a) || CONVEX_NO_ENVFILE_OK.has(a);

/** Indice del sottocomando Convex negli argomenti (anche dopo opzioni come `--verbose`), o -1. */
export function convexSubcommandIndex(argv) {
  for (let i = 0; i < argv.length - 1; i++) {
    if (!CONVEX_CLI_RE.test(argv[i])) continue;
    let j = i + 1;
    while (j < argv.length && argv[j].startsWith("-") && !CONVEX_NO_ENVFILE_OK.has(argv[j])) j++;
    if (j < argv.length && isSubcommand(argv[j])) return j;
  }
  return -1;
}

/* Un comando Convex dentro una stringa (sh -c '…', node -e '…', npx -c …):
   i controlli qui sopra vedrebbero un solo argomento. Si rifiuta. */
const CONVEX_IN_STRINGA = new RegExp(
  `(?:^|[\\s;&|(\`'"/])(?:convex(?:@[\\w.^~-]+)?|convex/bin/main\\.js)\\s+(?:-\\S+\\s+)*(?:${[...CONVEX_SUBCOMMANDS].join("|")})\\b`,
  "i",
);

/* Assegnazioni NOME=valore (es. `env CONVEX_DEPLOY_KEY=… cmd`): i nomi vietati e ogni nome Convex no. */
const ASSEGNAZIONE_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * Controlla il comando. Restituisce un messaggio d'errore o null.
 * `hasWorktreeEnv`: se .env.worktree esiste; `root`/`cwd`: per risolvere `--env-file`.
 */
export function checkArgs(argv, { hasWorktreeEnv = true, root = ROOT, cwd = process.cwd() } = {}) {
  if (!argv.length) return "manca il comando dopo `--`";
  for (const a of argv) {
    for (const [re, what] of FORBIDDEN) {
      if (re.test(a)) return `argomento rifiutato: contiene ${what}`;
    }
    const m = a.match(ASSEGNAZIONE_RE);
    if (m && (isNever(m[1]) || /CONVEX/i.test(m[1]))) return `argomento rifiutato: assegnazione di ${m[1]} (l'ambiente lo decide wt.mjs)`;
    if (/\s/.test(a) && CONVEX_IN_STRINGA.test(a)) return "argomento rifiutato: un comando Convex dentro una stringa (sh -c, node -e…): lancia la CLI direttamente con `--env-file .env.worktree`";
  }
  const sub = convexSubcommandIndex(argv);
  if (sub !== -1) {
    const cmd = argv[sub];
    if (CONVEX_NO_ENVFILE_OK.has(cmd)) return null;
    if (CONVEX_REFUSED.has(cmd)) return `convex ${cmd}: non si usa da un worktree (il deployment locale lo crea scripts/convex-locale.mjs)`;
    if (argv.some(a => /^--url\b/.test(a))) return "argomento rifiutato: `--url` sulla CLI Convex";
    if (!hasWorktreeEnv) return `manca ${WORKTREE_ENV}: prima \`node scripts/convex-locale.mjs init\``;
    const i = argv.findIndex(a => a === "--env-file" || a.startsWith("--env-file="));
    if (i === -1) return `la CLI Convex vuole \`--env-file ${WORKTREE_ENV}\``;
    const file = argv[i].includes("=") ? argv[i].slice(argv[i].indexOf("=") + 1) : argv[i + 1];
    // proprio il .env.worktree di QUESTO worktree, non uno che si chiama così altrove
    if (!file || resolve(cwd, file) !== join(root, WORKTREE_ENV)) return `--env-file deve essere il ${WORKTREE_ENV} di questo worktree`;
    if (argv.filter(a => a === "--env-file" || a.startsWith("--env-file=")).length > 1) return "`--env-file` una volta sola";
  }
  return null;
}

/* ── lettura dei file del worktree ─────────────────────────────── */
export function readEnvFile(path) {
  return existsSync(path) ? parseDotenv(readFileSync(path, "utf8")) : null;
}

/** Ambiente pronto per un figlio, con i controlli. Lancia un Error con un messaggio senza valori. */
export function worktreeEnv({ root = ROOT, parent = process.env, requireWorktreeEnv = true } = {}) {
  const envWorktree = readEnvFile(join(root, WORKTREE_ENV));
  if (envWorktree) {
    const problems = checkWorktreeEnv(envWorktree);
    if (problems.length) throw new Error(`${WORKTREE_ENV} non valido:\n  - ${problems.join("\n  - ")}`);
  } else if (requireWorktreeEnv) {
    throw new Error(`manca ${WORKTREE_ENV}: prima \`node scripts/convex-locale.mjs init\``);
  }
  const envLocal = readEnvFile(join(root, ".env.local"));
  const env = buildEnv({ parent, envLocal, envWorktree });
  env.WT_ROOT = root;
  return env;
}

const names = env => Object.keys(env).sort().join(" ");

function insideRoot(dir, root) {
  try {
    const rel = relative(realpathSync(root), realpathSync(dir));
    return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
  } catch {
    return false;
  }
}

/* ── CLI ───────────────────────────────────────────────────────── */
function usage(code = 2) {
  console.error("uso: node scripts/wt.mjs exec [--names] -- <comando> [argomenti…]\n     node scripts/wt.mjs names | check");
  process.exit(code);
}

async function main(argv) {
  const [verb, ...rest] = argv;
  if (verb === "names") {
    const env = worktreeEnv({ requireWorktreeEnv: false });
    console.log(names(env));
    return 0;
  }
  if (verb === "check") {
    const wt = readEnvFile(join(ROOT, WORKTREE_ENV));
    if (!wt) {
      console.error(`wt: manca ${WORKTREE_ENV}`);
      return 1;
    }
    const problems = checkWorktreeEnv(wt);
    if (problems.length) {
      console.error(`wt: ${WORKTREE_ENV} non valido:\n  - ${problems.join("\n  - ")}`);
      return 1;
    }
    const u = new URL(wt.VITE_CONVEX_URL);
    console.log(`wt: deployment ${deploymentKind(wt.CONVEX_DEPLOYMENT)} su ${u.hostname}:${u.port}`);
    return 0;
  }
  if (verb !== "exec") usage();
  const dash = rest.indexOf("--");
  if (dash === -1) usage();
  const opts = rest.slice(0, dash);
  const cmd = rest.slice(dash + 1);
  for (const o of opts) if (o !== "--names") usage();

  if (!insideRoot(process.cwd(), ROOT)) {
    console.error(`wt: la cartella corrente non è dentro il worktree (${ROOT})`);
    return 2;
  }
  const hasWorktreeEnv = existsSync(join(ROOT, WORKTREE_ENV));
  const bad = checkArgs(cmd, { hasWorktreeEnv });
  if (bad) {
    console.error(`wt: ${bad}`);
    return 2;
  }
  let env;
  try {
    // senza .env.worktree si può comunque lanciare ciò che non usa Convex
    // (build, vitest): niente deployment nell'ambiente, quindi niente rischio
    env = worktreeEnv({ requireWorktreeEnv: false });
  } catch (e) {
    console.error(`wt: ${e.message}`);
    return 2;
  }
  if (opts.includes("--names")) console.error(`wt: variabili del figlio: ${names(env)}`);
  if (!cmd.length) return 0;

  const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", env });
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => child.kill(sig));
  return await new Promise(res => {
    child.on("error", e => {
      console.error(`wt: impossibile avviare ${cmd[0]}: ${e.code ?? e.message}`);
      res(127);
    });
    child.on("exit", (code, signal) => res(code ?? (signal ? 128 + 1 : 1)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(code => process.exit(code), e => {
    console.error(`wt: ${e?.message ?? e}`);
    process.exit(1);
  });
}
