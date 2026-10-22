#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────
   Storico dell'Oracolo da Upstash (era Netlify) a Convex (PIANO §1.26,
   traguardo 9). Dal checkout principale, MAI dentro `wt exec` (che toglie
   UPSTASH_* dall'ambiente):

     fnox exec -- node scripts/migra-storico-chat.mjs             dry-run (predefinito)
     fnox exec -- node scripts/migra-storico-chat.mjs --apply --deployment <nome>

   In Fase 3 si esegue SOLO il dry-run: `--apply` è un passo dello switch.

   Lettura (DECISIONI, "Upstash"):
   - credenziali UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN_RW. Il
     token ha anche permessi di scrittura: si usano solo letture. Mai
     `Redis.fromEnv()` né UPSTASH_REDIS_REST_TOKEN;
   - REST via POST, un array JSON per comando (`["GET", chiave]`). Prima
     della rete ogni comando passa da `controllaComando`: solo le letture di
     COMANDI_LETTURA e solo chiavi dello storico di produzione. SET, DEL,
     SCAN, KEYS e il namespace `preview:` lanciano un errore;
   - si parte da `concerti:chat:log:index`; per ogni id valido (THREAD_ID_RE,
     non riservato) si leggono il record, `titles`, `keys`, `authors` e il
     PTTL del record.

   Conversione (`converti`): stesso threadId, titolo e autore; la chiave di
   scrittura diventa SHA-256 in esadecimale (o resta assente: il thread
   resta rivendicabile); l'IP si scarta; `expiresAt` = adesso + PTTL.
   Profilo `gabrifila` e `visibility: "pubblica"` li mette
   migrations:importChatThreads (interna, idempotente).

   Output: conteggi, errori (per posizione nell'indice) e dimensioni. Mai
   id, chiavi, IP o testi delle conversazioni. Esce con 1 se ci sono errori.

   --apply: `convex run --deployment <nome> migrations:importChatThreads` a
   lotti, ognuno sotto LIMITE_ARGOMENTO (Linux accetta al massimo 128 KiB
   per argomento), con l'ambiente senza segreti di child-env.mjs e senza
   CONVEX_DEPLOYMENT (sceglie solo `--deployment`). Un errore riporta il
   motivo del server, mai il JSON inviato. Il dry-run non lancia mai la CLI
   Convex.
   ────────────────────────────────────────────────────────────── */

import { fileURLToPath } from "node:url";
import { isValidThreadId } from "../shared/chat/ids.ts";
import { senzaSegreti } from "./child-env.mjs";

const RADICE = "concerti:chat:log";
export const CHIAVI = {
  index: `${RADICE}:index`,
  titles: `${RADICE}:titles`,
  keys: `${RADICE}:keys`,
  authors: `${RADICE}:authors`,
};
const chiaveRecord = threadId => `${RADICE}:${threadId}`;

export const COMANDI_LETTURA = new Set(["GET", "MGET", "ZRANGE", "ZCARD", "HGET", "HMGET", "HGETALL", "PTTL"]);

/** Byte massimi degli argomenti JSON di una chiamata `convex run`. */
export const LIMITE_ARGOMENTO = 120_000;

/** Record senza scadenza in Redis (anomalo): scade come su Netlify, 90 giorni dopo l'ultimo messaggio. */
const TTL_DI_RISERVA_MS = 90 * 86_400_000;

/* ── Upstash in sola lettura ───────────────────────────────────── */

/** Solo le chiavi dello storico di produzione: le quattro fisse e i record con un id valido (mai `preview:`). */
const chiaveAmmessa = k =>
  typeof k === "string" &&
  (Object.values(CHIAVI).includes(k) || (k.startsWith(`${RADICE}:`) && isValidThreadId(k.slice(RADICE.length + 1))));

/** Lancia se il comando non è una lettura ammessa sullo storico di produzione. */
export function controllaComando(cmd) {
  if (!Array.isArray(cmd) || !COMANDI_LETTURA.has(cmd[0])) {
    throw new Error(`comando Redis rifiutato: sono ammesse solo le letture ${[...COMANDI_LETTURA].join(", ")}`);
  }
  const chiavi = cmd[0] === "MGET" ? cmd.slice(1) : cmd.slice(1, 2);
  if (!chiavi.length || !chiavi.every(chiaveAmmessa) || !cmd.every(x => typeof x === "string")) {
    throw new Error(`${cmd[0]} rifiutato: si legge solo lo storico di produzione (${RADICE}:*, mai preview:)`);
  }
}

/** Il client REST: una funzione `redis(cmd)` che controlla il comando PRIMA della rete. */
export function upstash({ url, token, fetch: f = globalThis.fetch }) {
  if (!url || !token) {
    throw new Error("mancano UPSTASH_REDIS_REST_URL o UPSTASH_REDIS_REST_TOKEN_RW: `fnox exec -- node scripts/migra-storico-chat.mjs` dal checkout principale");
  }
  let https = false;
  try {
    https = new URL(url).protocol === "https:";
  } catch {}
  if (!https) throw new Error("UPSTASH_REDIS_REST_URL non è un URL https");
  return async cmd => {
    controllaComando(cmd);
    const res = await f(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    const body = await res.json().catch(() => null);
    // il testo d'errore di Upstash non si stampa: basta il comando e lo stato
    if (!res.ok || !body || typeof body !== "object" || "error" in body) throw new Error(`Upstash: ${cmd[0]} non riuscito (HTTP ${res.status})`);
    return body.result;
  };
}

/** L'indice e, per ogni id valido, record, titolo, chiave, autore e PTTL (dati grezzi, mai stampati). */
export async function leggiStorico(redis) {
  const piatto = await redis(["ZRANGE", CHIAVI.index, "0", "-1", "WITHSCORES"]);
  if (!Array.isArray(piatto)) throw new Error("indice dello storico non leggibile");
  const voci = [];
  for (let i = 0; i + 1 < piatto.length; i += 2) voci.push({ posizione: i / 2 + 1, threadId: String(piatto[i]), score: Number(piatto[i + 1]) });
  const valide = voci.filter(x => isValidThreadId(x.threadId));
  const conversazioni = [];
  if (valide.length) {
    const ids = valide.map(x => x.threadId);
    const [titoli, chiavi, autori] = await Promise.all([CHIAVI.titles, CHIAVI.keys, CHIAVI.authors].map(h => redis(["HMGET", h, ...ids])));
    for (const [i, x] of valide.entries()) {
      const [grezzo, pttl] = await Promise.all([redis(["GET", chiaveRecord(x.threadId)]), redis(["PTTL", chiaveRecord(x.threadId)])]);
      conversazioni.push({ ...x, grezzo, pttl: Number(pttl), titolo: titoli?.[i], chiave: chiavi?.[i], autore: autori?.[i] });
    }
  }
  return { voci: voci.length, scartate: voci.length - valide.length, conversazioni };
}

/* ── conversione ───────────────────────────────────────────────── */

const testo = x => (typeof x === "string" && x.trim() ? x : undefined);

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Titolo di riserva, come chatTitle dell'era Netlify: il primo messaggio dell'utente. */
function titoloDa(messages) {
  const c = messages.find(m => m?.role === "user")?.content;
  const t = typeof c === "string" ? c : Array.isArray(c) ? c.filter(p => p?.type === "text").map(p => p.content).join(" ") : "";
  return t.trim().slice(0, 80) || "Chat";
}

/** Nomi di campo che Convex accetta (convex/values: niente `$` iniziale, ASCII stampabile) e array fino a 8192. */
function salvabileInConvex(x) {
  if (Array.isArray(x)) return x.length <= 8192 && x.every(salvabileInConvex);
  if (x && typeof x === "object") {
    return Object.entries(x).every(([k, y]) => k.length <= 1024 && !k.startsWith("$") && /^[\x20-\x7e]*$/.test(k) && salvabileInConvex(y));
  }
  return true;
}

/**
 * Una conversazione grezza di `leggiStorico` → `{ thread }` (l'input di
 * migrations:importChatThreads), `{ scaduta: true }` oppure `{ errore }`
 * (un motivo senza valori).
 */
export async function converti(c, now) {
  if (c.grezzo == null || c.pttl === -2) return { scaduta: true }; // l'indice si pota in ritardo
  let rec;
  try {
    rec = typeof c.grezzo === "string" ? JSON.parse(c.grezzo) : c.grezzo;
  } catch {
    return { errore: "record non leggibile (JSON)" };
  }
  if (!rec || typeof rec !== "object" || !Array.isArray(rec.messages) || !rec.messages.length) return { errore: "record senza messaggi" };
  if (!salvabileInConvex(rec.messages)) return { errore: "messaggi con nomi di campo che Convex non accetta" };
  const updatedAt = Math.round(Number.isFinite(Date.parse(rec.updatedAt)) ? Date.parse(rec.updatedAt) : c.score);
  if (!(updatedAt > 0)) return { errore: "data dell'ultimo messaggio mancante" };
  const senzaScadenza = c.pttl === -1;
  const expiresAt = Math.round(c.pttl > 0 ? now + c.pttl : updatedAt + TTL_DI_RISERVA_MS);
  if (expiresAt <= now) return { scaduta: true };
  const author = testo(c.autore) ?? testo(rec.author);
  const chiave = testo(c.chiave);
  return {
    senzaScadenza,
    thread: {
      threadId: c.threadId,
      title: testo(c.titolo) ?? titoloDa(rec.messages),
      ...(author && { author }),
      ...(chiave && { writeKeyHash: await sha256Hex(chiave) }),
      messages: rec.messages,
      updatedAt,
      expiresAt,
    },
  };
}

/* ── lotti per `convex run` ────────────────────────────────────── */

export const argomenti = threads => JSON.stringify({ threads });
const byte = s => new TextEncoder().encode(s).length;

/** Lotti in ordine, ognuno con argomenti JSON sotto `limite` byte (una conversazione più grande resta da sola). */
export function lotti(threads, limite = LIMITE_ARGOMENTO) {
  const out = [];
  let lotto = [];
  for (const t of threads) {
    if (lotto.length && byte(argomenti([...lotto, t])) > limite) {
      out.push(lotto);
      lotto = [];
    }
    lotto.push(t);
  }
  if (lotto.length) out.push(lotto);
  return out;
}

/* ── analisi e riepilogo ───────────────────────────────────────── */

export async function analizza(redis, now) {
  const storico = await leggiStorico(redis);
  const threads = [];
  const errori = [];
  let scadute = 0;
  let senzaScadenza = 0;
  for (const c of storico.conversazioni) {
    const r = await converti(c, now);
    const dim = r.thread ? byte(argomenti([r.thread])) : 0;
    if (r.scaduta) scadute++;
    else if (r.errore) errori.push(`n. ${c.posizione} dell'indice: ${r.errore}`);
    else if (dim > LIMITE_ARGOMENTO) errori.push(`n. ${c.posizione} dell'indice: ${kb(dim)} KB, troppo per una chiamata a convex run (${kb(LIMITE_ARGOMENTO)} KB)`);
    else {
      threads.push(r.thread);
      if (r.senzaScadenza) senzaScadenza++;
    }
  }
  return { voci: storico.voci, scartate: storico.scartate, scadute, senzaScadenza, errori, threads };
}

const kb = n => (n / 1024).toFixed(1);

/** Le righe del riepilogo: solo numeri e motivi, mai id, chiavi, IP o testi. */
export function riepilogo(a) {
  const conChiave = a.threads.filter(t => t.writeKeyHash).length;
  const messaggi = a.threads.map(t => t.messages.length);
  const dimensioni = a.threads.map(t => byte(JSON.stringify(t)));
  const righe = [
    `indice: ${a.voci} voci, ${a.scartate} con id non valido (scartate)`,
    `da migrare: ${a.threads.length} conversazioni (${conChiave} con chiave di scrittura → SHA-256, ${a.threads.length - conChiave} senza: restano rivendicabili; ${a.threads.filter(t => t.author).length} con autore)`,
    `scadute: ${a.scadute} (record già scaduto su Upstash)`,
  ];
  if (a.senzaScadenza) righe.push(`senza scadenza su Upstash: ${a.senzaScadenza} (scadono 90 giorni dopo l'ultimo messaggio)`);
  if (a.threads.length) {
    righe.push(
      `messaggi: ${messaggi.reduce((s, n) => s + n, 0)} (da ${Math.min(...messaggi)} a ${Math.max(...messaggi)} per conversazione)`,
      `dimensione: ${kb(dimensioni.reduce((s, n) => s + n, 0))} KB, la più grande ${kb(Math.max(...dimensioni))} KB → ${lotti(a.threads).length} chiamate a convex run (al massimo ${kb(LIMITE_ARGOMENTO)} KB l'una)`,
    );
  }
  righe.push(`errori: ${a.errori.length}`, ...a.errori.map(e => `  - ${e}`));
  return righe;
}

/* ── opzioni e Convex ──────────────────────────────────────────── */

export function opzioni(argv) {
  const o = { apply: false, dryRun: false, deployment: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") o.apply = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--deployment") o.deployment = argv[++i];
    else if (a.startsWith("--deployment=")) o.deployment = a.slice("--deployment=".length);
    else throw new Error(`argomento sconosciuto: ${a.slice(0, 40)} (uso: [--dry-run] | --apply --deployment <nome>)`);
  }
  if (o.apply && o.dryRun) throw new Error("--apply e --dry-run insieme: scegline uno");
  if (o.deployment !== undefined && !o.apply) throw new Error("--deployment vale solo con --apply");
  if (o.apply && !/^[A-Za-z0-9][\w/:-]*$/.test(o.deployment ?? "")) throw new Error("--apply vuole --deployment <nome> esplicito");
  return o;
}

/** L'ambiente della CLI: senza segreti (child-env.mjs), senza Upstash e senza un deployment preselezionato, così sceglie solo `--deployment`. */
export const envConvex = env =>
  Object.fromEntries(Object.entries(senzaSegreti(env)).filter(([k]) => !/^(VITE_)?CONVEX_(DEPLOYMENT|URL|SITE_URL|SELF_HOSTED_)|^UPSTASH_/.test(k)));

/**
 * Il motivo di un `convex run` fallito, mai il JSON inviato: la riga
 * `Uncaught …` del server (o la prima con `Error:`, o l'ultima), tagliata
 * prima di `{`/`[`. Di un ConvexError restano `code`, `messaggio` e `campo`,
 * che importChatThreads scrive senza valori (convex/lib/errors.ts).
 */
export function motivoErrore(stderr = "") {
  const righe = stderr.replace(/\x1b\[[0-9;]*m/g, "").split("\n").map(r => r.trim()).filter(Boolean);
  const riga = righe.find(r => r.startsWith("Uncaught ")) ?? righe.find(r => r.includes("Error:")) ?? righe.at(-1) ?? "";
  const dati = riga.match(/ConvexError: (\{.*\})$/)?.[1];
  if (dati) {
    try {
      const { code, messaggio, campo } = JSON.parse(dati);
      return [code, messaggio, campo && `campo ${campo}`].filter(x => typeof x === "string").join(", ").slice(0, 300);
    } catch {}
  }
  return riga.split(/[{[]/)[0].trim().slice(0, 200);
}

/** `convex run` sul deployment scelto, con `envConvex`; restituisce l'esito della mutation. */
export async function convexRun(deployment, json, env = process.env) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("pnpm", ["exec", "convex", "run", "--deployment", deployment, "migrations:importChatThreads", json], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: envConvex(env),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 16 << 20,
  });
  if (r.error || r.status !== 0) {
    throw new Error(`convex run non riuscito (${r.error?.code ?? `codice ${r.status}`}): ${motivoErrore(r.stderr ?? "")}`);
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error("convex run: esito non leggibile (atteso il JSON di importChatThreads)");
  }
}

export async function main({ argv = process.argv.slice(2), env = process.env, fetch: f = globalThis.fetch, run = convexRun, log = console.log, now = Date.now() } = {}) {
  const o = opzioni(argv);
  const redis = upstash({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN_RW, fetch: f });
  log(o.apply ? `migra-storico-chat: --apply sul deployment ${o.deployment}` : "migra-storico-chat: dry-run (sola lettura su Upstash, Convex non si tocca)");
  const a = await analizza(redis, now);
  for (const r of riepilogo(a)) log(r);
  if (!o.apply) return a.errori.length ? 1 : 0;

  const somma = { inserite: 0, aggiornate: 0, invariate: 0, conflitti: 0 };
  const gruppi = lotti(a.threads);
  for (const [i, lotto] of gruppi.entries()) {
    const esito = await run(o.deployment, argomenti(lotto), env);
    for (const k of Object.keys(somma)) somma[k] += Number(esito?.[k]) || 0;
    log(`lotto ${i + 1}/${gruppi.length}: ${lotto.length} conversazioni inviate`);
  }
  log(`Convex: ${somma.inserite} inserite, ${somma.aggiornate} aggiornate, ${somma.invariate} invariate, ${somma.conflitti} in conflitto (thread di un altro profilo: non toccati)`);
  return a.errori.length || somma.conflitti ? 1 : 0;
}

if (import.meta.main) {
  main().then(
    code => process.exit(code),
    e => {
      console.error(`migra-storico-chat: ${e?.message ?? e}`);
      process.exit(1);
    },
  );
}
