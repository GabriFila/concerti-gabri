#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Verifica del setup esterno (Fase 2 di docs/multiutente/PROMPT.md).

   Controlla ogni servizio con una chiamata reale e stampa una tabella
   OK/KO con il motivo. Ripetibile; non stampa MAI un segreto: i
   valori restano in memoria, l'output passa da scrub() e dei
   sottoprocessi (CLI convex/vercel) si riportano solo dati derivati.

     node scripts/check-setup.mjs                  tutto
     node scripts/check-setup.mjs --only=convex,google  (convex, vercel, betterauth,
                                   google, resend, mapbox, sentry, posthog, gemini, upstash)
     node scripts/check-setup.mjs --skip-events    niente evento Sentry/PostHog né email
     node scripts/check-setup.mjs --to=me@x.it     destinatario dell'email di prova Resend

   Legge l'ambiente del processo e, per quello che manca, `.env.local`
   (su t3node lo scrive t3-env-sync da fnox). Servono le CLI `convex`
   (login fatto) e `vercel` (login fatto, cartella collegata).
   Esce con codice 1 se almeno un controllo è KO.

   Scelte documentate in docs/multiutente/DECISIONI.md: niente Resend
   per ora (SKIP), geocoding con OpenStreetMap, token Upstash con
   permessi di scrittura (AVVISO), restrizione Mapbox verificata sulle
   tile (gli stili non sono limitati per URL).
   ────────────────────────────────────────────────────────────── */

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolveMx, resolveTxt } from "node:dns/promises";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(ROOT, ".env.local"))) process.loadEnvFile(join(ROOT, ".env.local"));

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const SKIP_EVENTS = !!args["skip-events"];

// --only: case/punctuation-insensitive service names ("Better Auth" = betterauth = better-auth = auth)
const SERVICES = ["Convex", "Vercel", "Better Auth", "Google", "Resend", "Mapbox", "Sentry", "PostHog", "Gemini", "Upstash"];
const keyOf = n => n.toLowerCase().replace(/[^a-z]/g, "");
const ALIAS = { better: "betterauth", auth: "betterauth" };
let ONLY = null;
if (typeof args.only === "string") {
  ONLY = new Set(args.only.split(",").map(keyOf).filter(Boolean).map(k => ALIAS[k] ?? k));
  const unknown = [...ONLY].filter(k => !SERVICES.some(s => keyOf(s) === k));
  if (unknown.length || !ONLY.size) {
    console.error(`--only: nomi sconosciuti (${unknown.join(", ") || "vuoto"}). Validi: ${SERVICES.map(keyOf).join(", ")}`);
    process.exit(2);
  }
  // Better Auth reads its values from Convex: the Convex checks have to run too
  if (ONLY.has("betterauth")) ONLY.add("convex");
}

/* ── Configurazione (non segreta) ───────────────────────────────── */
const env = process.env;
const LOCAL_URL = "http://localhost:3100";
const SITE_URL_DEV = env.VITE_SITE_URL || "https://t3node.tail4a8e3b.ts.net:8444";
const PROD_URL = "https://concerti-gabri.vercel.app";
const BRANCH_URL = "https://concerti-gabri-git-multiutente-gabrifilas-projects.vercel.app";
const CUSTOM_DOMAIN = "https://concerti.gabrifila.me";
const CONVEX_PROD_DEPLOYMENT = env.CONVEX_PROD_DEPLOYMENT || "brave-chickadee-534";
const CONVEX_PROJECT = env.CONVEX_PROJECT || "concerti-gabri";
const VERCEL_PROJECT = env.VERCEL_PROJECT || "concerti-gabri";
const VERCEL_SCOPE = env.VERCEL_SCOPE || "gabrifilas-projects";
const SENTRY_ORG = env.SENTRY_ORG || "gabriele-filaferro";
const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const NOMINATIM_URL = env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
const EMAIL_FROM = env.EMAIL_FROM || "Concerti <notifications@concerti.gabrifila.me>";
const USER_AGENT = "concerti-gabri/1.0 (+https://concerti.gabrifila.me) check-setup";
const RUN_ID = randomUUID().slice(0, 8);

const CONVEX_REQUIRED = ["BETTER_AUTH_SECRET", "SITE_URL", "BETTER_AUTH_TRUSTED_ORIGINS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
const CONVEX_OPTIONAL = ["RESEND_API_KEY", "EMAIL_FROM"];
const VERCEL_REQUIRED = ["CONVEX_DEPLOY_KEY", "ENABLE_EXPERIMENTAL_COREPACK", "VITE_MAPBOX_TOKEN", "VITE_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "VITE_POSTHOG_KEY", "GEMINI_API_KEY", "GEMINI_MODEL"];
const VERCEL_SENSITIVE = ["CONVEX_DEPLOY_KEY", "SENTRY_AUTH_TOKEN", "GEMINI_API_KEY"];
// Convex deployments to inspect: label → flags for `npx convex env …`
const CONVEX_TARGETS = [
  { label: "dev", flags: [] },
  { label: "prod", flags: ["--prod"] },
  { label: "preview/multiutente", flags: ["--deployment", "preview/multiutente"] },
];

/* ── Segreti: raccolta e scrub dell'output ──────────────────────── */
const SECRETS = new Set();
// Also the trimmed value and every whitespace-separated chunk: undici quotes a
// rejected header value trimmed, so a secret with stray spaces/newlines would
// otherwise slip past the exact-match replacement in scrub().
const remember = v => {
  if (typeof v !== "string") return v;
  for (const p of [v, v.trim(), ...v.split(/[\s\0]+/)]) if (p.length >= 8) SECRETS.add(p);
  return v;
};
for (const [k, v] of Object.entries(env)) if (/KEY|TOKEN|SECRET|DSN|PASSWORD/i.test(k)) remember(v);
const PATTERNS = [
  /AIza[0-9A-Za-z_-]{20,}/g, /sntrys_[A-Za-z0-9+/=_-]+/g, /phc_[A-Za-z0-9]+/g, /\bpk\.[A-Za-z0-9._-]+/g,
  /\bre_[A-Za-z0-9_]{10,}/g, /(prod|preview|dev):[^\s|"']+\|[^\s"']+/g, /Bearer\s+\S+/g, /GOCSPX-[A-Za-z0-9_-]+/g,
];
function scrub(s) {
  let out = String(s);
  for (const v of SECRETS) out = out.split(v).join("***");
  for (const p of PATTERNS) out = out.replace(p, "***");
  return out;
}
const sha = v => createHash("sha256").update(v).digest("hex");

/* ── Utilità ────────────────────────────────────────────────────── */
function run(cmd, argv, opts = {}) {
  return new Promise(resolve => {
    execFile(cmd, argv, { cwd: ROOT, env: { ...env, ...opts.env }, timeout: opts.timeout ?? 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}
// The repo's convex CLI run by this same node binary (no npx, no version-manager shim).
const CONVEX_BIN = join(ROOT, "node_modules", "convex", "bin", "main.js");
const convex = (argv, opts) => run(process.execPath, [CONVEX_BIN, ...argv], opts);
/* Run the CLI authenticated ONLY by a deploy key: an empty HOME hides the
   logged-in ~/.convex token (which the CLI would otherwise prefer for
   project-level calls) and CONVEX_DEPLOYMENT from the env is dropped, so a
   revoked or fake key fails instead of passing on the user's login. */
async function convexWithKeyOnly(key, argv) {
  const home = mkdtempSync(join(tmpdir(), "check-setup-convex-"));
  const clean = { ...env, HOME: home, CONVEX_DEPLOY_KEY: key };
  for (const k of ["CONVEX_DEPLOYMENT", "CONVEX_DEPLOYMENT_TOKEN", "CONVEX_OVERRIDE_ACCESS_TOKEN"]) delete clean[k];
  try {
    return await new Promise(resolve => execFile(process.execPath, [CONVEX_BIN, ...argv], { cwd: ROOT, env: clean, timeout: 120_000 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })));
  } finally { rmSync(home, { recursive: true, force: true }); }
}
// The part of a Convex deploy key before "|" is not secret ("prod:<name>", "preview:<team>:<project>").
const keyKind = key => (key || "").split("|")[0];
const names = out => out.split("\n").map(l => l.trim()).filter(l => /^[A-Z][A-Z0-9_]*$/.test(l));
// The most telling line of a CLI's output: its error line if any, else the last one.
const firstLine = s => {
  const lines = scrub(s).split("\n").map(l => l.trim()).filter(Boolean);
  return (lines.find(l => /✖|error|unauthorized|forbidden/i.test(l)) ?? lines.slice(-1)[0] ?? "").slice(0, 160);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function http(url, init = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), ...init });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, headers: res.headers, text, json };
}
const isHttpsOrLocal = u => u.protocol === "https:" || ["localhost", "127.0.0.1"].includes(u.hostname);

/* ── Risultati ──────────────────────────────────────────────────── */
const results = [];
const add = (service, check, status, reason) => results.push({ service, check, status, reason: scrub(reason ?? "") });
async function service(name, fn) {
  if (ONLY && !ONLY.has(keyOf(name))) return;
  try { await fn((check, status, reason) => add(name, check, status, reason)); }
  catch (err) { add(name, "esecuzione", "KO", `errore inatteso (${err?.name ?? "Error"}): ${err?.message ?? err}`); }
}
// Required local vars must exist and be clean: a value with newlines/spaces at
// the edges is a damaged paste and would be rejected (and quoted) by fetch.
const need = (r, ...vars) => {
  const missing = vars.filter(v => !env[v]);
  if (missing.length) { r("variabili locali", "KO", `mancano ${missing.join(", ")} (fnox set NOME, poi t3-env-sync)`); return false; }
  const damaged = vars.filter(v => /[\r\n\0]/.test(env[v]) || env[v] !== env[v].trim());
  if (damaged.length) { r("variabili locali", "KO", `${damaged.join(", ")} contiene a-capo o spazi: rifallo con fnox set`); return false; }
  return true;
};

/* ── Convex ─────────────────────────────────────────────────────── */
// Values read from Convex, kept for the Better Auth / Google checks.
const convexValues = {};
async function convexGet(target, name) {
  const res = await convex(["env", "get", name, ...target.flags]);
  if (res.code !== 0) return null;
  const value = res.stdout.replace(/\n$/, "");
  // SITE_URL and the trusted origins are public URLs: only secrets go to scrub()
  return /SECRET|KEY|TOKEN/.test(name) ? remember(value) : value;
}

async function checkConvex(r) {
  if (!need(r, "VITE_CONVEX_URL", "CONVEX_DEPLOYMENT")) return;
  const login = await convex(["login", "status"]);
  if (!/Status: Logged in/.test(login.stdout + login.stderr)) { r("login CLI", "KO", "npx convex login non fatto"); return; }

  const v = await http(`${env.VITE_CONVEX_URL}/version`).catch(e => ({ status: 0, text: e.message }));
  r("dev raggiungibile", v.status === 200 ? "OK" : "KO", `${new URL(env.VITE_CONVEX_URL).host} → HTTP ${v.status}`);

  for (const t of CONVEX_TARGETS) {
    const res = await convex(["env", "list", "--names-only", ...t.flags]);
    if (res.code !== 0) { r(`env ${t.label}`, "KO", firstLine(res.stderr || res.stdout)); continue; }
    const got = new Set(names(res.stdout));
    const missing = CONVEX_REQUIRED.filter(n => !got.has(n));
    const optional = CONVEX_OPTIONAL.filter(n => got.has(n));
    r(`env ${t.label}`, missing.length ? "KO" : "OK",
      missing.length ? `mancano: ${missing.join(", ")}` : `${CONVEX_REQUIRED.length} attese presenti${optional.length ? ` + ${optional.join(", ")}` : ""}`);
    convexValues[t.label] = {};
    for (const n of ["BETTER_AUTH_SECRET", "SITE_URL", "BETTER_AUTH_TRUSTED_ORIGINS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])
      if (got.has(n)) convexValues[t.label][n] = await convexGet(t, n);
  }

  const def = await convex(["env", "default", "list", "--names-only", "--type", "preview"]);
  if (def.code !== 0) r("default preview", "KO", firstLine(def.stderr || def.stdout));
  else {
    const got = new Set(names(def.stdout));
    const missing = CONVEX_REQUIRED.filter(n => !got.has(n));
    r("default preview", missing.length ? "KO" : "OK", missing.length ? `mancano: ${missing.join(", ")}` : "valgono per ogni nuovo branch");
    convexValues["default preview"] = {};
    for (const n of ["BETTER_AUTH_SECRET", "SITE_URL", "BETTER_AUTH_TRUSTED_ORIGINS"]) {
      const g = await convex(["env", "default", "get", n, "--type", "preview"]);
      if (g.code !== 0) continue;
      const value = g.stdout.replace(/\n$/, "");
      convexValues["default preview"][n] = n === "BETTER_AUTH_SECRET" ? remember(value) : value;
    }
  }

  // Deploy keys: right kind/target (non-secret prefix), then a read-only call
  // authenticated by the key alone (env list), so a revoked key fails.
  const prodKey = env.CONVEX_DEPLOY_KEY_PROD;
  // The prod key lives in the fnox "prod" profile, loaded only on request.
  if (!prodKey) r("deploy key prod", "SKIP", "nel profilo fnox prod: fnox -P prod exec -- pnpm check:setup");
  else if (keyKind(prodKey) !== `prod:${CONVEX_PROD_DEPLOYMENT}`)
    r("deploy key prod", "KO", `è una chiave "${keyKind(prodKey).split(":")[0]}", non del deployment prod ${CONVEX_PROD_DEPLOYMENT}`);
  else {
    const res = await convexWithKeyOnly(prodKey, ["env", "list", "--names-only"]);
    r("deploy key prod", res.code === 0 ? "OK" : "KO", res.code === 0 ? `si autentica da sola su ${CONVEX_PROD_DEPLOYMENT}` : firstLine(res.stderr || res.stdout));
  }
  const previewKey = env.CONVEX_DEPLOY_KEY_PREVIEW;
  if (!previewKey) r("deploy key preview", "KO", "manca CONVEX_DEPLOY_KEY_PREVIEW in fnox");
  else if (!new RegExp(`^preview:[^:|]+:${CONVEX_PROJECT}$`).test(keyKind(previewKey)))
    r("deploy key preview", "KO", `non è una preview deploy key del progetto ${CONVEX_PROJECT} (tipo "${keyKind(previewKey).split(":")[0]}")`);
  else {
    const res = await convexWithKeyOnly(previewKey, ["env", "list", "--names-only", "--preview-name", "multiutente"]);
    r("deploy key preview", res.code === 0 ? "OK" : "KO", res.code === 0 ? "si autentica da sola sulla preview multiutente" : firstLine(res.stderr || res.stdout));
  }
}

/* ── Vercel ─────────────────────────────────────────────────────── */
async function checkVercel(r) {
  const who = await run("vercel", ["whoami"]);
  if (who.code !== 0) { r("login CLI", "KO", "vercel login non fatto"); return; }
  const ls = await run("vercel", ["env", "ls", "--json"]);
  let envs = null;
  try { envs = JSON.parse(ls.stdout).envs; } catch {}
  if (!envs) { r("vercel env ls", "KO", ls.code ? firstLine(ls.stderr) : "output non leggibile (cartella collegata? vercel link)"); return; }
  for (const target of ["production", "preview"]) {
    const here = envs.filter(e => e.target?.includes(target) && !e.gitBranch);
    const keys = new Set(here.map(e => e.key));
    const missing = VERCEL_REQUIRED.filter(k => !keys.has(k));
    const notSensitive = VERCEL_SENSITIVE.filter(k => here.some(e => e.key === k && e.type !== "sensitive"));
    r(`env ${target}`, missing.length ? "KO" : notSensitive.length ? "AVVISO" : "OK",
      missing.length ? `mancano: ${missing.join(", ")}`
        : notSensitive.length ? `non "sensitive": ${notSensitive.join(", ")}` : `${VERCEL_REQUIRED.length} attese presenti, segreti come sensitive`);
  }
  const p = await run("vercel", ["api", `/v9/projects/${VERCEL_PROJECT}`, "--scope", VERCEL_SCOPE, "--raw"]);
  let proj = null;
  try { proj = JSON.parse(p.stdout); } catch {}
  if (!proj) r("progetto", "KO", firstLine(p.stderr || p.stdout) || "progetto non leggibile");
  else {
    const issues = [];
    if (proj.framework !== "tanstack-start") issues.push(`framework ${proj.framework}`);
    if (proj.link?.productionBranch !== "main") issues.push(`production branch ${proj.link?.productionBranch}`);
    if (!proj.link?.repo) issues.push("repo GitHub non collegata");
    r("progetto", issues.length ? "KO" : "OK", issues.length ? issues.join("; ") : `TanStack Start, Node ${proj.nodeVersion}, ${proj.link.org}/${proj.link.repo}, production = main`);
    r("build di produzione", proj.commandForIgnoringBuildStep ? "AVVISO" : "OK",
      proj.commandForIgnoringBuildStep ? "bloccati dall'Ignored Build Step: toglierlo allo switch" : "attivi");
  }
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    const plain = await http(`${BRANCH_URL}/`, { redirect: "manual" }).catch(e => ({ status: 0 }));
    const bypass = await http(`${BRANCH_URL}/`, { redirect: "manual", headers: { "x-vercel-protection-bypass": env.VERCEL_AUTOMATION_BYPASS_SECRET } }).catch(e => ({ status: 0 }));
    r("preview del branch", bypass.status === 200 && plain.status !== 200 ? "OK" : "KO",
      `senza bypass HTTP ${plain.status} (protetta), con bypass HTTP ${bypass.status}`);
  } else r("preview del branch", "KO", "manca VERCEL_AUTOMATION_BYPASS_SECRET in fnox");
}

/* ── Better Auth ────────────────────────────────────────────────── */
function originOf(s) {
  try { const u = new URL(s); return u.pathname === "/" && !u.search && !u.hash ? u.origin : null; } catch { return null; }
}
async function checkBetterAuth(r) {
  if (!Object.keys(convexValues).length) { r("dati da Convex", "KO", "servono i controlli Convex (esegui anche --only=convex)"); return; }
  const expect = {
    dev: { site: SITE_URL_DEV, mustTrust: [SITE_URL_DEV] },
    prod: { site: PROD_URL, mustTrust: [PROD_URL, CUSTOM_DOMAIN] },
    "preview/multiutente": { site: BRANCH_URL, mustTrust: [BRANCH_URL] },
    "default preview": { site: BRANCH_URL, mustTrust: [BRANCH_URL] },
  };
  const hashes = {};
  for (const [label, want] of Object.entries(expect)) {
    const vals = convexValues[label];
    if (!vals) { r(label, "KO", "env non leggibile"); continue; }
    const problems = [];
    const secret = vals.BETTER_AUTH_SECRET;
    if (!secret) problems.push("BETTER_AUTH_SECRET assente");
    else if (secret.length < 32) problems.push(`segreto troppo corto (${secret.length} caratteri, minimo 32)`);
    else hashes[label] = sha(secret);
    const site = originOf(vals.SITE_URL ?? "");
    if (!site) problems.push("SITE_URL non è un'origine valida");
    else {
      if (!isHttpsOrLocal(new URL(site))) problems.push("SITE_URL non è https");
      if (site !== want.site) problems.push(`SITE_URL ${site} invece di ${want.site}`);
    }
    const trusted = (vals.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
    const bad = trusted.filter(t => !originOf(t));
    const wild = trusted.filter(t => t.includes("*"));
    if (!trusted.length) problems.push("BETTER_AUTH_TRUSTED_ORIGINS vuota");
    if (bad.length) problems.push(`origini non valide: ${bad.join(", ")}`);
    if (wild.length) problems.push(`jolly non ammessi: ${wild.join(", ")}`);
    const missing = want.mustTrust.filter(m => !trusted.includes(m));
    if (missing.length) problems.push(`manca tra le trusted: ${missing.join(", ")}`);
    if (site && !trusted.includes(site)) problems.push("SITE_URL non è tra le trusted");
    r(label, problems.length ? "KO" : "OK",
      problems.length ? problems.join("; ") : `segreto ${secret.length} caratteri, SITE_URL ${site}, ${trusted.length} trusted origin esatte`);
  }
  // Every pair across environments must differ; the two preview entries are one
  // environment and may share theirs.
  const group = { dev: "dev", prod: "prod", "default preview": "preview", "preview/multiutente": "preview" };
  const labels = Object.keys(hashes);
  const clashes = [];
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++)
    if (group[labels[i]] !== group[labels[j]] && hashes[labels[i]] === hashes[labels[j]]) clashes.push(`${labels[i]} = ${labels[j]}`);
  const core = ["dev", "prod", "default preview"].every(l => hashes[l]);
  r("segreti distinti", core && !clashes.length ? "OK" : "KO",
    !core ? "segreto mancante su dev, prod o default preview" : clashes.length ? `stesso segreto: ${clashes.join("; ")}` : "dev, preview e prod hanno segreti diversi");
  if (hashes["preview/multiutente"] && hashes["default preview"])
    r("preview allineata", hashes["preview/multiutente"] === hashes["default preview"] ? "OK" : "AVVISO",
      hashes["preview/multiutente"] === hashes["default preview"] ? "preview/multiutente usa il segreto di default delle preview" : "preview/multiutente ha un segreto diverso dal default");
}

/* ── Google OAuth ───────────────────────────────────────────────── */
function decodeAuthError(location) {
  const ae = new URL(location).searchParams.get("authError");
  if (!ae) return "errore senza dettaglio";
  const txt = Buffer.from(ae.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
  return (txt.match(/redirect_uri_mismatch|invalid_client|deleted_client|disabled_client|unauthorized_client|org_internal|access_denied/) || ["errore OAuth"])[0];
}
async function checkGoogle(r) {
  if (!need(r, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")) return;
  const id = env.GOOGLE_CLIENT_ID;
  r("formato client id", /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(id) ? "OK" : "KO", "…apps.googleusercontent.com");
  for (const base of [LOCAL_URL, SITE_URL_DEV]) {
    const q = new URLSearchParams({ client_id: id, redirect_uri: `${base}/api/auth/callback/google`, response_type: "code", scope: "openid email profile" });
    const res = await http(`https://accounts.google.com/o/oauth2/v2/auth?${q}`, { redirect: "manual" });
    const loc = res.headers.get("location") || "";
    const ok = res.status === 302 && loc.startsWith("https://accounts.google.com/") && !loc.includes("/signin/oauth/error");
    r(`redirect ${new URL(base).host}`, ok ? "OK" : "KO", ok ? "accettato (porta al login Google)" : `${decodeAuthError(loc || "https://x/?")} (HTTP ${res.status})`);
  }
  // A fake authorization code: Google answers invalid_grant when id+secret are right, invalid_client otherwise.
  const tok = await http("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: "check-setup-fake-code", client_id: id, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${LOCAL_URL}/api/auth/callback/google`, grant_type: "authorization_code" }),
  });
  const err = tok.json?.error;
  r("client secret", err === "invalid_grant" ? "OK" : "KO", err === "invalid_grant" ? "valido (codice finto rifiutato come invalid_grant)" : `risposta ${err ?? tok.status}`);
  const mismatched = Object.entries(convexValues).filter(([, v]) => v.GOOGLE_CLIENT_ID && (v.GOOGLE_CLIENT_ID !== id || v.GOOGLE_CLIENT_SECRET !== env.GOOGLE_CLIENT_SECRET)).map(([k]) => k);
  if (Object.keys(convexValues).length)
    r("allineato con Convex", mismatched.length ? "KO" : "OK", mismatched.length ? `credenziali diverse da fnox su: ${mismatched.join(", ")}` : "stesse credenziali su tutti i deployment letti");
}

/* ── Resend (facoltativo, vedi DECISIONI.md) ────────────────────── */
async function checkResend(r) {
  if (!env.RESEND_API_KEY) { r("configurazione", "SKIP", "non configurato: login solo Google (DECISIONI.md)"); return; }
  const domain = EMAIL_FROM.match(/@([^>\s]+)/)?.[1];
  const dkim = await resolveTxt(`resend._domainkey.${domain}`).then(t => t.flat().join("").startsWith("p=")).catch(() => false);
  const mx = await resolveMx(`send.${domain}`).then(m => m.some(x => /amazonses\.com$/.test(x.exchange))).catch(() => false);
  r("DNS", dkim && mx ? "OK" : "KO", `DKIM resend._domainkey.${domain} ${dkim ? "presente" : "assente"}, MX send.${domain} ${mx ? "presente" : "assente"}`);
  if (SKIP_EVENTS) { r("email di prova", "SKIP", "--skip-events"); return; }
  const to = typeof args.to === "string" ? args.to : (await run("git", ["config", "user.email"])).stdout.trim();
  const res = await http("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject: `Prova check-setup ${RUN_ID}`, text: `Email di prova di scripts/check-setup.mjs (run ${RUN_ID}). Se la ricevi, Resend e il dominio funzionano.` }),
  });
  r("email di prova", res.status === 200 ? "DA CONFERMARE" : "KO",
    res.status === 200 ? `inviata a ${to} da ${EMAIL_FROM}: conferma di averla ricevuta (oggetto "Prova check-setup ${RUN_ID}")` : `HTTP ${res.status}: ${res.json?.message ?? ""} (un dominio non verificato viene rifiutato qui)`);
}

/* ── Mapbox + geocoding OpenStreetMap ───────────────────────────── */
async function checkMapbox(r) {
  if (!need(r, "VITE_MAPBOX_TOKEN")) return;
  const tok = env.VITE_MAPBOX_TOKEN;
  r("tipo di token", tok.startsWith("pk.") ? "OK" : "KO", tok.startsWith("pk.") ? "pubblico (pk.)" : "non è un token pubblico pk.");
  const style = await http(`https://api.mapbox.com/styles/v1/mapbox/dark-v11?access_token=${tok}`, { headers: { Origin: LOCAL_URL, Referer: `${LOCAL_URL}/` } });
  r("stile da localhost", style.status === 200 ? "OK" : "KO", `dark-v11 con Origin ${LOCAL_URL} → HTTP ${style.status}`);
  const tile = `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/1/1/0.vector.pbf?access_token=${tok}`;
  const allowed = [LOCAL_URL, SITE_URL_DEV, BRANCH_URL, PROD_URL, CUSTOM_DOMAIN];
  const codes = await Promise.all(allowed.map(o => http(tile, { headers: { Referer: `${o}/` } }).then(x => x.status)));
  const refused = allowed.filter((_, i) => codes[i] !== 200);
  r("tile da origini ammesse", refused.length ? "KO" : "OK", refused.length ? `rifiutate: ${refused.join(", ")}` : `${allowed.length} origini → HTTP 200`);
  const evil = await http(tile, { headers: { Referer: "https://evil.example.com/" } });
  const none = await http(tile);
  r("tile da origine non ammessa", evil.status === 403 && none.status === 403 ? "OK" : "KO",
    `evil.example.com → HTTP ${evil.status}, senza Referer → HTTP ${none.status} (atteso 403: token limitato per URL)`);
  const q = new URLSearchParams({ q: "Forum di Assago", format: "jsonv2", limit: "1", countrycodes: "it", "accept-language": "it" });
  const geo = await http(`${NOMINATIM_URL}/search?${q}`, { headers: { "User-Agent": USER_AGENT } });
  const hit = geo.json?.[0];
  const near = hit && Math.abs(+hit.lon - 9.1422) < 0.01 && Math.abs(+hit.lat - 45.4014) < 0.01;
  r("geocoding \"Forum di Assago\"", near ? "OK" : "KO",
    near ? `OpenStreetMap: ${hit.name} (${hit.category}/${hit.type}) a meno di 1 km dalle coordinate attuali` : `HTTP ${geo.status}, risultato ${hit ? `${hit.name} ${hit.lon},${hit.lat}` : "assente"}`);
}

/* ── Sentry ─────────────────────────────────────────────────────── */
async function checkSentry(r) {
  if (!need(r, "VITE_SENTRY_DSN", "SENTRY_AUTH_TOKEN")) return;
  let dsn;
  try { dsn = new URL(env.VITE_SENTRY_DSN); } catch { r("DSN", "KO", "non è un URL"); return; }
  const eu = dsn.host.endsWith(".de.sentry.io");
  r("DSN", eu ? "OK" : "KO", eu ? `regione EU (ingest.de.sentry.io), progetto ${dsn.pathname.slice(1)}` : `host ${dsn.host.replace(/^o\d+\./, "o…")} non è EU`);
  const rel = await http(`https://de.sentry.io/api/0/organizations/${SENTRY_ORG}/releases/?per_page=1`, { headers: { Authorization: `Bearer ${env.SENTRY_AUTH_TOKEN}` } });
  r("auth token (source map)", rel.status === 200 ? "OK" : "KO", `releases di ${SENTRY_ORG} → HTTP ${rel.status}`);
  if (SKIP_EVENTS) { r("evento di prova", "SKIP", "--skip-events"); return; }
  const eventId = randomUUID().replace(/-/g, "");
  const now = new Date().toISOString();
  const event = { event_id: eventId, timestamp: now, platform: "javascript", level: "info", environment: "check-setup", logger: "check-setup",
    message: { formatted: `check-setup ${RUN_ID}: evento di prova` }, tags: { source: "check-setup", run: RUN_ID } };
  const body = [JSON.stringify({ event_id: eventId, sent_at: now }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
  const res = await http(`${dsn.protocol}//${dsn.host}/api${dsn.pathname}/envelope/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.username}, sentry_client=check-setup/1.0` },
    body,
  });
  r("evento di prova", res.status === 200 ? "DA CONFERMARE" : "KO",
    res.status === 200 ? `accettato: cerca "check-setup ${RUN_ID}" in https://${SENTRY_ORG}.sentry.io/issues/?query=${eventId} (ambiente check-setup)` : `HTTP ${res.status}`);
}

/* ── PostHog ────────────────────────────────────────────────────── */
async function checkPostHog(r) {
  if (!need(r, "VITE_POSTHOG_KEY")) return;
  const key = env.VITE_POSTHOG_KEY;
  // /flags validates the key (unlike the ingest endpoint, which accepts anything)
  // and with config=true returns the remote config posthog-js reads.
  const flags = host => http(`https://${host}/flags/?v=2&config=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: key, distinct_id: "check-setup" }) });
  const [eu, us] = await Promise.all([flags("eu.i.posthog.com"), flags("us.i.posthog.com")]);
  r("progetto in EU", eu.status === 200 && us.status !== 200 ? "OK" : "KO", `key valida su eu.i.posthog.com (HTTP ${eu.status}), non su US (HTTP ${us.status})`);
  if (eu.status === 200)
    r("session replay", eu.json?.sessionRecording === false ? "OK" : "KO",
      eu.json?.sessionRecording === false ? "spento nelle impostazioni del progetto" : "acceso: Settings → Project → Session replay → OFF");
  // Cookieless server hash mode is a project setting only a personal API key can read.
  if (env.POSTHOG_PERSONAL_API_KEY) {
    const p = await http("https://eu.posthog.com/api/projects/@current/", { headers: { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}` } });
    const mode = p.json?.cookieless_server_hash_mode;
    r("modalità senza cookie", p.status === 200 && mode ? "OK" : "KO", p.status === 200 ? `cookieless_server_hash_mode = ${mode}` : `HTTP ${p.status}`);
  } else r("modalità senza cookie", "SKIP", "impostazione di progetto non leggibile senza POSTHOG_PERSONAL_API_KEY (attivata a mano il 2026-10-21)");
  if (SKIP_EVENTS) { r("evento di prova", "SKIP", "--skip-events"); return; }
  const res = await http("https://eu.i.posthog.com/i/v0/e/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, event: "check_setup", distinct_id: `check-setup-${RUN_ID}`, properties: { $process_person_profile: false, run: RUN_ID } }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  r("evento di prova", res.status === 200 && !cookies.length ? "OK" : "KO",
    `HTTP ${res.status}, evento check_setup (run ${RUN_ID}) accettato${cookies.length ? `, ma ${cookies.length} cookie impostati` : ", nessun cookie"}; la key la verifica la riga "progetto in EU"`);
}

/* ── Gemini ─────────────────────────────────────────────────────── */
async function checkGemini(r) {
  if (!need(r, "GEMINI_API_KEY")) return;
  const res = await http(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Rispondi solo: ok" }] }], generationConfig: { maxOutputTokens: 10 } }),
  });
  const text = res.json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  r(`chiamata ${GEMINI_MODEL}`, res.status === 200 && text ? "OK" : "KO",
    res.status === 200 ? `risposta "${(text ?? "").slice(0, 20)}" (${res.json?.modelVersion ?? GEMINI_MODEL})` : `HTTP ${res.status}: ${res.json?.error?.status ?? ""}`);
}

/* ── Upstash (storico chat da migrare, sola lettura) ────────────── */
async function checkUpstash(r) {
  if (!need(r, "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN_RW")) return;
  const cmd = c => http(env.UPSTASH_REDIS_REST_URL, { method: "POST", headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN_RW}` }, body: JSON.stringify(c) });
  const [prod, prev] = await Promise.all([cmd(["ZCARD", "concerti:chat:log:index"]), cmd(["ZCARD", "concerti:chat:log:preview:index"])]);
  r("lettura indice storico", prod.status === 200 ? "OK" : "KO",
    prod.status === 200 ? `${prod.json.result} conversazioni in produzione, ${prev.json?.result ?? "?"} nelle preview` : `HTTP ${prod.status}: ${prod.json?.error ?? ""}`);
  const who = await cmd(["ACL", "WHOAMI"]);
  const user = who.json?.result;
  r("permessi del token", user === "default_ro" ? "OK" : "AVVISO",
    user === "default_ro" ? "sola lettura" : `OK, ma con permessi di scrittura (utente ${user ?? "?"}): scelta di Gabri, lo script di migrazione usa solo letture`);
}

/* ── Esecuzione e tabella ───────────────────────────────────────── */
const started = Date.now();
await Promise.all([
  service("Convex", checkConvex).then(() => service("Better Auth", checkBetterAuth)).then(() => service("Google", checkGoogle)),
  service("Vercel", checkVercel),
  service("Resend", checkResend),
  service("Mapbox", checkMapbox),
  service("Sentry", checkSentry),
  service("PostHog", checkPostHog),
  service("Gemini", checkGemini),
  service("Upstash", checkUpstash),
]);

const ORDER = ["Convex", "Vercel", "Better Auth", "Google", "Resend", "Mapbox", "Sentry", "PostHog", "Gemini", "Upstash"];
results.sort((a, b) => ORDER.indexOf(a.service) - ORDER.indexOf(b.service));
const W = { s: 12, c: 28, st: 14 };
const pad = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
const ICON = { OK: "✓ OK", KO: "✗ KO", AVVISO: "! AVVISO", SKIP: "– SKIP", "DA CONFERMARE": "? CONFERMA" };
console.log(`\ncheck-setup — run ${RUN_ID} — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n`);
console.log(`${pad("Servizio", W.s)} ${pad("Controllo", W.c)} ${pad("Esito", W.st)} Motivo`);
console.log("─".repeat(W.s + W.c + W.st + 40));
let prev = "";
for (const x of results) {
  console.log(scrub(`${pad(x.service === prev ? "" : x.service, W.s)} ${pad(x.check, W.c)} ${pad(ICON[x.status] ?? x.status, W.st)} ${x.reason}`));
  prev = x.service;
}
const count = s => results.filter(x => x.status === s).length;
console.log("─".repeat(W.s + W.c + W.st + 40));
console.log(`${count("OK")} OK · ${count("KO")} KO · ${count("AVVISO")} avvisi · ${count("SKIP")} saltati · ${count("DA CONFERMARE")} da confermare a mano · ${((Date.now() - started) / 1000).toFixed(0)} s`);
process.exit(count("KO") ? 1 : 0);
