#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Il deployment Convex LOCALE del worktree (PIANO §4.3).

     node scripts/convex-locale.mjs init [--keep]   crea, configura, pubblica, semina
     node scripts/convex-locale.mjs up              avvia `convex dev` (backend + watch) in background
     node scripts/convex-locale.mjs down            lo ferma (backend compreso)
     node scripts/convex-locale.mjs status          tipo e porta del deployment, acceso o no
     node scripts/convex-locale.mjs push            `convex dev --once` (backend già acceso)
     node scripts/convex-locale.mjs env             (ri)scrive l'env del deployment locale
     node scripts/convex-locale.mjs seed            `convex run seed:ensure`
     node scripts/convex-locale.mjs run <fn> ['{json}']  `convex run` sul deployment locale
                                                    (solo modulo:funzione e un oggetto JSON)

   Scelta dello spike del traguardo 2: backend LOCALE ANONIMO (agent mode,
   https://docs.convex.dev/cli/agent-mode). Non serve lo slug del team, non
   si registra niente sul progetto cloud e non eredita le variabili
   predefinite dei deployment dev; i dati stanno in .convex/local/default/.

   - Tutto parte con l'ambiente ripulito di scripts/wt.mjs: niente
     CONVEX_DEPLOYMENT, VITE_CONVEX_*, chiavi di deploy o di produzione.
   - La CLI scrive la selezione in .env.local: quelle righe si spostano in
     .env.worktree (mode 600) senza stamparle e .env.local torna IDENTICO a
     prima (byte per byte).
   - Prima di ogni push si verifica che il deployment risolto sia
     anonimo/locale su 127.0.0.1; altrimenti ci si ferma.
   - Ogni chiamata alla CLI passa dagli stessi controlli di `wt exec`
     (checkArgs) e dal suo ambiente, compreso il token finto che sostituisce
     il login globale: niente `--deployment`, `--url`, `--prod`, nemmeno
     travestiti da argomenti di `run`.
   - L'env del deployment (BETTER_AUTH_SECRET, CHAT_SERVER_SECRET,
     AUTH_DEV_OTP=1, SITE_URL = `portless get`, BETTER_AUTH_TRUSTED_ORIGINS =
     quello più http://localhost:3100 (il server degli e2e),
     NOMINATIM_URL dello stub) passa da un file temporaneo 600 con
     `env set --from-file`: nessun valore sulla riga di comando o a video.
     CHAT_SERVER_SECRET resta anche in .env.worktree (serve al server Start).
   ────────────────────────────────────────────────────────────── */

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync, closeSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { ROOT, WORKTREE_ENV, buildEnv, checkArgs, checkWorktreeEnv, deploymentKind, parseDotenv, readEnvFile, worktreeEnv } from "./wt.mjs";

const WT_FILE = join(ROOT, WORKTREE_ENV);
const LOCAL_FILE = join(ROOT, ".env.local");
const STATE_DIR = join(ROOT, ".convex");
const PID_FILE = join(STATE_DIR, "wt-dev.pid");
const LOG_FILE = join(STATE_DIR, "wt-dev.log");
const LOCAL_CONFIG = join(STATE_DIR, "local", "default", "config.json");
const CONVEX = ["exec", "convex"];
const ENV_FILE = ["--env-file", WORKTREE_ENV];

const log = msg => console.error(`convex-locale: ${msg}`);
const fail = msg => {
  log(msg);
  process.exit(1);
};

/** Ambiente per la CLI con .env.worktree (verificato da worktreeEnv). */
const cliEnv = () => worktreeEnv();

/**
 * `pnpm <args>` con l'ambiente di wt.mjs e gli STESSI controlli di `wt exec`
 * sugli argomenti (questo script lancia la CLI direttamente, non via wt).
 * `payload`: un argomento JSON già validato da `runFn`, escluso dai controlli
 * di parole (un nome d'artista con "prod" non è un'opzione: inizia con `{`).
 */
function run(args, { env = cliEnv(), quiet = false, input, payload } = {}) {
  const bad = checkArgs(["pnpm", ...args], { hasWorktreeEnv: true, root: ROOT, cwd: ROOT });
  if (bad) fail(`comando rifiutato: ${bad}`);
  if (payload !== undefined) args = [...args, payload];
  const r = spawnSync("pnpm", args, {
    cwd: ROOT,
    env,
    input,
    stdio: [input === undefined ? "ignore" : "pipe", quiet ? "pipe" : "inherit", quiet ? "pipe" : "inherit"],
    encoding: "utf8",
  });
  return r;
}

/** Il deployment risolto deve essere locale: controlla .env.worktree e la risposta del backend. */
async function assertLocal({ needRunning = false } = {}) {
  const wt = readEnvFile(WT_FILE);
  if (!wt) fail(`manca ${WORKTREE_ENV}: prima \`init\``);
  const problems = checkWorktreeEnv(wt);
  if (problems.length) fail(`${WORKTREE_ENV} non valido:\n  - ${problems.join("\n  - ")}`);
  const url = new URL(wt.VITE_CONVEX_URL);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") fail("il deployment non è su 127.0.0.1: mi fermo");
  if (needRunning && !(await backendUp(wt))) fail("il backend locale non risponde: `node scripts/convex-locale.mjs up`");
  return wt;
}

async function backendUp(wt) {
  try {
    const r = await fetch(new URL("/instance_name", wt.VITE_CONVEX_URL), { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/* ── creazione (agent mode anonimo) ───────────────────────────── */
async function create() {
  if (existsSync(LOCAL_CONFIG) && existsSync(WT_FILE)) {
    log("deployment locale già presente");
    return;
  }
  if (existsSync(LOCAL_CONFIG) && !existsSync(WT_FILE)) {
    fail(`.convex/local esiste ma ${WORKTREE_ENV} no: cancella .convex/local (dati locali) e rilancia init`);
  }
  const before = existsSync(LOCAL_FILE) ? readFileSync(LOCAL_FILE) : null;
  const beforeVars = before ? parseDotenv(before.toString("utf8")) : {};
  if (Object.keys(beforeVars).some(n => /^CONVEX_DEPLOY/.test(n) || n === "CONVEX_DEPLOYMENT")) {
    fail(".env.local contiene già un deployment Convex: in agent mode la CLI lo userebbe. Toglilo (t3-env-sync non lo scrive) e rilancia");
  }
  // ambiente ripulito, SENZA .env.worktree (non esiste ancora), agent mode anonimo
  const env = { ...buildEnv({ parent: process.env, envLocal: beforeVars }), WT_ROOT: ROOT, CONVEX_AGENT_MODE: "anonymous" };
  log("creo il deployment locale anonimo (convex dev --once, agent mode)…");
  let r;
  try {
    r = spawnSync("pnpm", [...CONVEX, "dev", "--once", "--typecheck", "disable", "--tail-logs", "disable"], {
      cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
    });
  } finally {
    // sposta le righe Convex in .env.worktree e ripristina .env.local
    const after = existsSync(LOCAL_FILE) ? readFileSync(LOCAL_FILE, "utf8") : "";
    const afterVars = parseDotenv(after);
    const moved = {};
    for (const [k, val] of Object.entries(afterVars)) {
      if (/CONVEX/.test(k) && beforeVars[k] !== val) moved[k] = val;
    }
    if (before === null) rmSync(LOCAL_FILE, { force: true });
    else writeFileSync(LOCAL_FILE, before, { mode: 0o600 });
    if (Object.keys(moved).length) writeWorktreeEnv(moved);
  }
  const wt = readEnvFile(WT_FILE);
  if (!wt?.CONVEX_DEPLOYMENT) {
    // l'output della CLI non contiene segreti; lo mostro solo se è fallita
    process.stderr.write(r?.stderr ?? "");
    fail("la CLI non ha creato il deployment");
  }
  const kind = deploymentKind(wt.CONVEX_DEPLOYMENT);
  if (kind !== "anonymous" && kind !== "local") fail(`deployment di tipo ${kind}: mi fermo`);
  if (r.status !== 0) log(`primo push non riuscito (codice ${r.status}): si riprova dopo con \`push\``);
  log(`ok: deployment ${kind}, ${new URL(wt.VITE_CONVEX_URL).host}`);
}

function writeWorktreeEnv(vars) {
  const cur = readEnvFile(WT_FILE) ?? {};
  const all = { ...cur, ...vars };
  const body =
    "# Generato da scripts/convex-locale.mjs: il deployment Convex LOCALE di questo worktree.\n" +
    "# Mai valori cloud qui (wt.mjs lo rifiuta). Non committare, non stampare.\n" +
    Object.entries(all).map(([k, val]) => `${k}=${val}`).join("\n") + "\n";
  writeFileSync(WT_FILE, body, { mode: 0o600 });
  chmodSync(WT_FILE, 0o600);
}

/* `convex dev` (anche con --env-file) riscrive la selezione in .env.local:
   si tolgono quelle righe (sono del deployment locale, ma .env.local è di
   t3-env-sync e dev'essere identico all'originale). Nessun valore a video. */
const CLI_LINES = /^(?:CONVEX_DEPLOYMENT|VITE_CONVEX_URL|VITE_CONVEX_SITE_URL|CONVEX_URL|CONVEX_SITE_URL)=/;
const CLI_COMMENT = /^# Deployment used by `npx convex dev`/;
export function stripCliLines(text) {
  const kept = text.split("\n").filter(l => !CLI_LINES.test(l) && !CLI_COMMENT.test(l));
  return kept.join("\n").replace(/\n{2,}$/, "\n");
}
function cleanEnvLocal() {
  if (!existsSync(LOCAL_FILE)) return;
  const text = readFileSync(LOCAL_FILE, "utf8");
  const clean = stripCliLines(text);
  if (clean !== text) writeFileSync(LOCAL_FILE, clean, { mode: 0o600 });
}

/* ── backend acceso / spento ──────────────────────────────────── */
async function up() {
  const wt = await assertLocal();
  if (readPid() && (await backendUp(wt))) {
    log("già acceso");
    return;
  }
  mkdirSync(STATE_DIR, { recursive: true });
  const fd = openSync(LOG_FILE, "w", 0o600);
  const child = spawn("pnpm", [...CONVEX, "dev", ...ENV_FILE, "--tail-logs", "disable", "--typecheck", "disable"], {
    cwd: ROOT, env: cliEnv(), stdio: ["ignore", fd, fd], detached: true,
  });
  closeSync(fd);
  writeFileSync(PID_FILE, String(child.pid));
  child.unref();
  // aspetta il backend e il primo push
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await sleep(1000);
    const logText = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8") : "";
    if ((await backendUp(wt)) && /Convex functions ready|functions ready/i.test(logText)) {
      cleanEnvLocal();
      log(`acceso (pid ${child.pid}, ${new URL(wt.VITE_CONVEX_URL).host})`);
      return;
    }
    if (!readPid()) fail(`convex dev è uscito: vedi ${LOG_FILE}`);
    if (/error|✖/i.test(logText) && /Error|failed/.test(logText) && (await backendUp(wt))) {
      cleanEnvLocal();
      log(`acceso, ma il push ha dato errori: vedi ${LOG_FILE}`);
      return;
    }
  }
  fail(`timeout: vedi ${LOG_FILE}`);
}

async function down() {
  const pid = readPid();
  if (!pid) {
    log("non era acceso");
    rmSync(PID_FILE, { force: true });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM"); // il gruppo: pnpm, convex dev e il backend
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  const wt = readEnvFile(WT_FILE);
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    if (!readPid() && !(wt && (await backendUp(wt)))) break;
  }
  if (wt && (await backendUp(wt))) {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
  rmSync(PID_FILE, { force: true });
  cleanEnvLocal();
  log("spento");
}

/* ── env del deployment ───────────────────────────────────────── */
async function freePort() {
  return await new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
    s.on("error", rej);
  });
}

function siteUrl() {
  const r = spawnSync("portless", ["get", "concerti-gabri"], { cwd: ROOT, encoding: "utf8", env: buildEnv({ parent: process.env }) });
  const url = (r.stdout || "").trim();
  if (r.status !== 0 || !/^https:\/\/[a-z0-9.-]+\.localhost:\d+$/.test(url)) fail("portless get non ha dato un URL *.localhost");
  return url;
}

async function setEnv() {
  await assertLocal({ needRunning: true });
  const wt = readEnvFile(WT_FILE);
  const site = siteUrl();
  const stubPort = wt.NOMINATIM_STUB_PORT || String(await freePort());
  const chat = wt.CHAT_SERVER_SECRET || randomBytes(32).toString("base64url");
  writeWorktreeEnv({ SITE_URL: site, NOMINATIM_STUB_PORT: stubPort, CHAT_SERVER_SECRET: chat });
  const vars = {
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    CHAT_SERVER_SECRET: chat,
    AUTH_DEV_OTP: "1",
    SITE_URL: site,
    // più l'origine del server e2e (e2e/helpers/urls.ts START_URL): lì
    // Playwright entra con l'OTP passando dal proxy /api/auth di Start
    BETTER_AUTH_TRUSTED_ORIGINS: `${site},http://localhost:3100`,
    NOMINATIM_URL: `http://127.0.0.1:${stubPort}`,
  };
  const tmp = join(STATE_DIR, `env-${process.pid}.tmp`);
  writeFileSync(tmp, Object.entries(vars).map(([k, val]) => `${k}=${val}`).join("\n") + "\n", { mode: 0o600 });
  try {
    const r = run([...CONVEX, "env", "set", ...ENV_FILE, "--from-file", tmp], { quiet: true });
    if (r.status !== 0) fail("convex env set non riuscito (output nascosto: può contenere valori)");
  } finally {
    rmSync(tmp, { force: true });
  }
  log(`env impostata: ${Object.keys(vars).join(", ")}`);
}

async function push() {
  const wt = await assertLocal();
  if (readPid() && (await backendUp(wt))) {
    // `convex dev` in watch è acceso e pubblica da solo: si aspetta l'ultimo push
    const start = Date.now();
    await sleep(1500);
    while (Date.now() - start < 120_000) {
      const text = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8") : "";
      const lastReady = text.lastIndexOf("Convex functions ready");
      const lastErr = Math.max(text.lastIndexOf("✖"), text.lastIndexOf("Error:"));
      if (lastReady > lastErr && lastReady !== -1) return log("funzioni pubblicate (convex dev in watch)");
      if (lastErr > lastReady) fail(`push non riuscito: vedi ${LOG_FILE}`);
      await sleep(1000);
    }
    fail(`timeout del push: vedi ${LOG_FILE}`);
  }
  const r = run([...CONVEX, "dev", "--once", ...ENV_FILE, "--tail-logs", "disable"]);
  if (r.status !== 0) fail("push non riuscito");
}

async function seed() {
  await assertLocal({ needRunning: true });
  const r = run([...CONVEX, "run", ...ENV_FILE, "seed:ensure"]);
  if (r.status !== 0) fail("seed:ensure non riuscito");
}

/**
 * `convex run` sul deployment locale (stdout del risultato invariato).
 * Accetta SOLO `modulo:funzione` e, facoltativo, un oggetto JSON: nient'altro
 * passa alla CLI (niente `--deployment`, `--url`, `--prod`… travestiti da
 * argomenti, che Commander leggerebbe come opzioni in qualunque posizione).
 */
async function runFn(fn, json, extra) {
  if (extra.length) fail("uso: run <modulo:funzione> ['{json}'] (nessun altro argomento)");
  if (!fn || !/^[A-Za-z0-9_/]+:[A-Za-z0-9_]+$/.test(fn)) fail("uso: run <modulo:funzione> ['{json}']");
  if (json !== undefined) {
    let ok = /^\s*\{/.test(json);
    try {
      const v = JSON.parse(json);
      ok = ok && v !== null && typeof v === "object" && !Array.isArray(v);
    } catch {
      ok = false;
    }
    if (!ok) fail("gli argomenti della funzione devono essere un oggetto JSON ('{…}')");
  }
  await assertLocal({ needRunning: true });
  const r = run([...CONVEX, "run", ...ENV_FILE, fn], { payload: json });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function status() {
  const wt = readEnvFile(WT_FILE);
  if (!wt) return log("nessun deployment locale (init)");
  const problems = checkWorktreeEnv(wt);
  const host = wt.VITE_CONVEX_URL ? new URL(wt.VITE_CONVEX_URL).host : "?";
  log(`deployment ${deploymentKind(wt.CONVEX_DEPLOYMENT)} su ${host}; ${(await backendUp(wt)) ? "acceso" : "spento"}${readPid() ? ` (pid ${readPid()})` : ""}${problems.length ? `; PROBLEMI: ${problems.join("; ")}` : ""}`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "init": {
    await create();
    await up();
    await setEnv();
    await push();
    await seed();
    if (!rest.includes("--keep")) await down();
    break;
  }
  case "up": await up(); break;
  case "down": await down(); break;
  case "status": await status(); break;
  case "push": await push(); break;
  case "env": await setEnv(); break;
  case "seed": await seed(); break;
  case "run": await runFn(rest[0], rest[1], rest.slice(2)); break;
  default:
    console.error("uso: node scripts/convex-locale.mjs init [--keep] | up | down | status | push | env | seed");
    process.exit(2);
}
