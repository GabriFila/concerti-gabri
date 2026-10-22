/* scripts/migra-storico-chat.mjs (PIANO T9) con un Upstash FINTO: nessun test
   contatta il vero Upstash né legge UPSTASH_* (l'ambiente è un oggetto di
   prova e il fetch globale è bloccato). */

import { createHash } from "node:crypto";
import { spawn, spawnSync, type SpawnSyncOptions } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHIAVI, COMANDI_LETTURA, LIMITE_ARGOMENTO, analizza, converti, convexRun, lotti, main, opzioni, upstash,
} from "./migra-storico-chat.mjs";

// il dry-run non deve mai lanciare la CLI Convex: qualunque processo figlio è un errore.
// --apply passa da spawnSync: i test lo simulano (nessuna CLI vera, nessun deployment)
vi.mock("node:child_process", () => ({ spawn: vi.fn(), spawnSync: vi.fn() }));

const URL_FINTO = "https://upstash-finto.example";
const TOKEN_FINTO = "token-finto-rw";
const ENV = { UPSTASH_REDIS_REST_URL: URL_FINTO, UPSTASH_REDIS_REST_TOKEN_RW: TOKEN_FINTO };
const NOW = Date.parse("2026-10-21T20:00:00Z");
const GIORNO = 86_400_000;

const IP = "203.0.113.77";
const CHIAVE = "chiave-segreta-del-browser-123";
const ID_1 = "thread-1729512345678-abcdef";
const ID_2 = "6f1c2a9e-1b2c-4d5e-8f90-123456789abc";
const ID_SCADUTO = "scaduto-123456";
const ID_ROTTO = "rotto-1234567";
const ID_NON_VALIDI = ["con spazio!", "x", "preview", "titles", "a".repeat(65), "preview:index"];

const messaggi = (domanda: string, risposta: string) => [
  { role: "user", content: domanda },
  { role: "assistant", content: "", toolCalls: [{ id: "call_1", type: "function", function: { name: "query_concerts", arguments: "{\"anno\":2025}" } }] },
  { role: "tool", content: "{\"count\":12}", toolCallId: "call_1" },
  { role: "assistant", content: risposta },
];
const MSG_1 = messaggi("Quanti concerti nel 2025? TESTO-PRIVATO-UNO", "Dodici. TESTO-PRIVATO-DUE");
const MSG_2 = messaggi("Chi ho visto più spesso? TESTO-PRIVATO-TRE", "Caparezza. TESTO-PRIVATO-QUATTRO");

type Rec = { valore: string | null; pttl: number };
interface Db {
  index: Array<[string, number]>;
  records: Record<string, Rec>;
  titles: Record<string, string>;
  keys: Record<string, string>;
  authors: Record<string, string>;
}

const record = (threadId: string, messages: unknown[], updatedAt: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ threadId, ip: IP, updatedAt, messages, ...extra });

function dbBase(): Db {
  return {
    index: [[ID_1, Date.parse("2026-10-01T10:00:00Z")], [ID_2, Date.parse("2026-10-05T10:00:00Z")], [ID_SCADUTO, Date.parse("2026-07-01T10:00:00Z")], ...ID_NON_VALIDI.map((id, i): [string, number] => [id, 1000 + i])],
    records: {
      [ID_1]: { valore: record(ID_1, MSG_1, "2026-10-01T10:00:00.000Z", { author: "Marta" }), pttl: 70 * GIORNO },
      [ID_2]: { valore: record(ID_2, MSG_2, "2026-10-05T10:00:00.000Z"), pttl: 74 * GIORNO },
    },
    titles: { [ID_1]: "Quanti concerti nel 2025? TESTO-PRIVATO-UNO" },
    keys: { [ID_1]: CHIAVE },
    authors: { [ID_1]: "Marta" },
  };
}

/** Un Upstash REST finto: registra ogni comando e risponde dal db in memoria. */
function upstashFinto(db: Db) {
  const comandi: string[][] = [];
  const rispondi = ([op, k, ...resto]: string[]): unknown => {
    const id = k?.startsWith("concerti:chat:log:") ? k.slice("concerti:chat:log:".length) : "";
    if (op === "ZRANGE" && k === CHIAVI.index) return db.index.flatMap(([m, s]) => [m, String(s)]);
    if (op === "ZCARD" && k === CHIAVI.index) return db.index.length;
    if (op === "HMGET") {
      const h = { [CHIAVI.titles]: db.titles, [CHIAVI.keys]: db.keys, [CHIAVI.authors]: db.authors }[k] ?? {};
      return resto.map(x => h[x] ?? null);
    }
    if (op === "GET") return db.records[id]?.valore ?? null;
    if (op === "PTTL") return db.records[id] ? db.records[id].pttl : -2;
    throw new Error(`comando inatteso nell'Upstash finto: ${op}`);
  };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    expect(url).toBe(URL_FINTO);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN_FINTO}`);
    const cmd = JSON.parse(String(init.body));
    comandi.push(cmd);
    return Response.json({ result: rispondi(cmd) });
  });
  return { fetch, comandi };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("rete vera vietata nei test");
  }));
  vi.mocked(spawn).mockReset();
  vi.mocked(spawnSync).mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Upstash in sola lettura", () => {
  it("un comando di scrittura viene rifiutato prima della rete", async () => {
    const { fetch } = upstashFinto(dbBase());
    const redis = upstash({ url: URL_FINTO, token: TOKEN_FINTO, fetch });
    for (const cmd of [
      ["SET", CHIAVI.index, "x"], ["DEL", CHIAVI.index], ["HSET", CHIAVI.keys, ID_1, "k"], ["HDEL", CHIAVI.keys, ID_1],
      ["ZADD", CHIAVI.index, "1", ID_1], ["ZREM", CHIAVI.index, ID_1], ["EXPIRE", `concerti:chat:log:${ID_1}`, "1"],
      ["PERSIST", `concerti:chat:log:${ID_1}`], ["UNLINK", CHIAVI.index], ["FLUSHALL"], ["EVAL", "return 1", "0"],
      ["ACL", "WHOAMI"], ["get", CHIAVI.index], [], "GET",
    ]) {
      await expect(redis(cmd), JSON.stringify(cmd)).rejects.toThrow(/rifiutato/);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect([...COMANDI_LETTURA].sort()).toEqual(["GET", "HGET", "HGETALL", "HMGET", "MGET", "PTTL", "ZCARD", "ZRANGE"]);
  });

  it("niente SCAN né KEYS", async () => {
    const { fetch } = upstashFinto(dbBase());
    const redis = upstash({ url: URL_FINTO, token: TOKEN_FINTO, fetch });
    await expect(redis(["SCAN", "0", "MATCH", "concerti:chat:log:*"])).rejects.toThrow(/rifiutato/);
    await expect(redis(["KEYS", "concerti:chat:log:*"])).rejects.toThrow(/rifiutato/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("solo chiavi dello storico di produzione: il namespace preview: non si tocca", async () => {
    const { fetch } = upstashFinto(dbBase());
    const redis = upstash({ url: URL_FINTO, token: TOKEN_FINTO, fetch });
    for (const cmd of [
      ["ZRANGE", "concerti:chat:log:preview:index", "0", "-1"], ["ZCARD", "concerti:chat:log:preview:index"],
      ["HMGET", "concerti:chat:log:preview:titles", ID_1], ["GET", `concerti:chat:log:preview:${ID_1}`],
      ["MGET", `concerti:chat:log:${ID_1}`, `concerti:chat:log:preview:${ID_1}`], ["GET", "concerti:chat:ip-m:1.2.3.4"],
      ["HGETALL", "altro"], ["GET"], ["ZRANGE", CHIAVI.index, 0, -1],
    ]) {
      await expect(redis(cmd), JSON.stringify(cmd)).rejects.toThrow(/rifiutato/);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(await redis(["ZCARD", CHIAVI.index])).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("credenziali: servono UPSTASH_REDIS_REST_URL (https) e UPSTASH_REDIS_REST_TOKEN_RW, mai UPSTASH_REDIS_REST_TOKEN", async () => {
    const { fetch } = upstashFinto(dbBase());
    const log = vi.fn();
    const senzaRw = { UPSTASH_REDIS_REST_URL: URL_FINTO, UPSTASH_REDIS_REST_TOKEN: "token-ro-finto" };
    const e = await main({ argv: [], env: senzaRw, fetch, log }).catch((x: Error) => x);
    expect(String(e)).toMatch(/UPSTASH_REDIS_REST_TOKEN_RW/);
    expect(String(e)).not.toContain("token-ro-finto");
    expect(String(e)).not.toContain(URL_FINTO);
    expect(() => upstash({ url: "http://upstash-finto.example", token: TOKEN_FINTO, fetch })).toThrow(/https/);
    expect(() => upstash({ url: "non un url", token: TOKEN_FINTO, fetch })).toThrow(/https/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("un errore di Upstash non ne ripete il testo", async () => {
    const fetch = vi.fn(async () => Response.json({ error: `WRONGPASS ${CHIAVE}` }, { status: 401 }));
    const redis = upstash({ url: URL_FINTO, token: TOKEN_FINTO, fetch });
    const e = await redis(["ZCARD", CHIAVI.index]).catch((x: Error) => x);
    expect(String(e)).toMatch(/ZCARD non riuscito \(HTTP 401\)/);
    expect(String(e)).not.toContain(CHIAVE);
  });
});

describe("lettura e conversione", () => {
  it("parte dall'indice, scarta gli id non validi e legge per gli altri solo record, titles, keys, authors e PTTL", async () => {
    const { fetch, comandi } = upstashFinto(dbBase());
    const a = await analizza(upstash({ url: URL_FINTO, token: TOKEN_FINTO, fetch }), NOW);
    expect(a).toMatchObject({ voci: 9, scartate: ID_NON_VALIDI.length, scadute: 1, errori: [] });
    expect(a.threads.map(t => t.threadId)).toEqual([ID_1, ID_2]);

    const validi = [ID_1, ID_2, ID_SCADUTO];
    expect(comandi[0]).toEqual(["ZRANGE", CHIAVI.index, "0", "-1", "WITHSCORES"]);
    expect(comandi.filter(c => c[0] === "HMGET")).toEqual([CHIAVI.titles, CHIAVI.keys, CHIAVI.authors].map(h => ["HMGET", h, ...validi]));
    expect(comandi.filter(c => c[0] === "GET").map(c => c[1]).sort()).toEqual(validi.map(id => `concerti:chat:log:${id}`).sort());
    expect(comandi.filter(c => c[0] === "PTTL").map(c => c[1]).sort()).toEqual(validi.map(id => `concerti:chat:log:${id}`).sort());
    // solo letture ammesse, mai SCAN/KEYS, mai preview:, mai un id scartato
    expect(comandi.every(c => COMANDI_LETTURA.has(c[0]))).toBe(true);
    expect(comandi.flat().some(x => /preview/.test(x))).toBe(false);
    const record = comandi.filter(c => c[0] === "GET" || c[0] === "PTTL").map(c => c[1]);
    const campi = comandi.filter(c => c[0] === "HMGET").flatMap(c => c.slice(2));
    for (const id of ID_NON_VALIDI) {
      expect(record, id).not.toContain(`concerti:chat:log:${id}`);
      expect(campi, id).not.toContain(id);
    }
  });

  it("conversione: stesso threadId, titolo e autore; chiave → SHA-256 (o assente); IP scartato; scadenza dal TTL", async () => {
    const { fetch } = upstashFinto(dbBase());
    const { threads } = await analizza(upstash({ url: URL_FINTO, token: TOKEN_FINTO, fetch }), NOW);
    expect(threads[0]).toEqual({
      threadId: ID_1,
      title: "Quanti concerti nel 2025? TESTO-PRIVATO-UNO",
      author: "Marta",
      writeKeyHash: sha(CHIAVE),
      messages: MSG_1,
      updatedAt: Date.parse("2026-10-01T10:00:00Z"),
      expiresAt: NOW + 70 * GIORNO,
    });
    // senza chiave né autore né titolo nell'hash: titolo dal primo messaggio, thread rivendicabile
    expect(threads[1]).toEqual({
      threadId: ID_2,
      title: "Chi ho visto più spesso? TESTO-PRIVATO-TRE",
      messages: MSG_2,
      updatedAt: Date.parse("2026-10-05T10:00:00Z"),
      expiresAt: NOW + 74 * GIORNO,
    });
    const json = JSON.stringify(threads);
    expect(json).not.toContain(IP);
    expect(json).not.toContain(CHIAVE);
    expect(threads.every(t => !("ip" in t) && !("visibility" in t) && !("profileId" in t))).toBe(true);
  });

  it("record scaduti, senza TTL o non leggibili", async () => {
    const base = { posizione: 1, threadId: ID_1, score: Date.parse("2026-10-01T10:00:00Z"), titolo: "t", chiave: null, autore: null };
    const valore = record(ID_1, MSG_1, "2026-10-01T10:00:00.000Z");
    expect(await converti({ ...base, grezzo: null, pttl: -2 }, NOW)).toEqual({ scaduta: true });
    expect(await converti({ ...base, grezzo: valore, pttl: -2 }, NOW)).toEqual({ scaduta: true });
    // senza scadenza in Redis: 90 giorni dopo l'ultimo messaggio
    const r = await converti({ ...base, grezzo: valore, pttl: -1 }, NOW);
    expect(r).toMatchObject({ senzaScadenza: true, thread: { expiresAt: Date.parse("2026-10-01T10:00:00Z") + 90 * GIORNO } });
    expect(await converti({ ...base, grezzo: record(ID_1, MSG_1, "2026-01-01T10:00:00.000Z"), pttl: -1 }, NOW)).toEqual({ scaduta: true });
    // updatedAt illeggibile: vale il punteggio dell'indice
    expect(await converti({ ...base, grezzo: record(ID_1, MSG_1, "boh"), pttl: GIORNO }, NOW)).toMatchObject({ thread: { updatedAt: base.score } });
    expect(await converti({ ...base, grezzo: "{non json", pttl: GIORNO }, NOW)).toEqual({ errore: "record non leggibile (JSON)" });
    expect(await converti({ ...base, grezzo: record(ID_1, [], "2026-10-01T10:00:00.000Z"), pttl: GIORNO }, NOW)).toEqual({ errore: "record senza messaggi" });
    expect(await converti({ ...base, grezzo: record(ID_1, [{ role: "user", content: "x", $tipo: 1 }], "2026-10-01T10:00:00.000Z"), pttl: GIORNO }, NOW))
      .toMatchObject({ errore: expect.stringMatching(/Convex/) });
  });
});

describe("dry-run e --apply", () => {
  it("il dry-run (predefinito o esplicito) non chiama mai Convex", async () => {
    for (const argv of [[], ["--dry-run"]]) {
      const { fetch } = upstashFinto(dbBase());
      const run = vi.fn();
      expect(await main({ argv, env: ENV, fetch, run, log: vi.fn(), now: NOW })).toBe(0);
      expect(run).not.toHaveBeenCalled();
      // nemmeno con l'esecutore vero: nessun processo figlio (la CLI Convex)
      expect(await main({ argv, env: ENV, fetch, log: vi.fn(), now: NOW })).toBe(0);
    }
    expect(spawn).not.toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it("stampa solo conteggi, errori e dimensioni: mai id, chiavi, IP o testi", async () => {
    const db = dbBase();
    db.index.push([ID_ROTTO, 5]);
    db.records[ID_ROTTO] = { valore: `{rotto ${IP} ${CHIAVE}`, pttl: GIORNO };
    const { fetch } = upstashFinto(db);
    const righe: string[] = [];
    expect(await main({ argv: [], env: ENV, fetch, log: (r: string) => righe.push(r), now: NOW })).toBe(1);
    const out = righe.join("\n");
    expect(out).toMatch(/indice: 10 voci, 6 con id non valido/);
    expect(out).toMatch(/da migrare: 2 conversazioni \(1 con chiave di scrittura → SHA-256, 1 senza/);
    expect(out).toMatch(/scadute: 1/);
    expect(out).toMatch(/messaggi: 8/);
    expect(out).toMatch(/dimensione: .* KB/);
    expect(out).toMatch(/errori: 1\n {2}- n\. 10 dell'indice: record non leggibile/);
    for (const segreto of [ID_1, ID_2, ID_SCADUTO, ID_ROTTO, ...ID_NON_VALIDI.filter(x => x.length > 1), CHIAVE, sha(CHIAVE), IP, "TESTO-PRIVATO", "Marta", "Caparezza", URL_FINTO, TOKEN_FINTO]) {
      expect(out, segreto).not.toContain(segreto);
    }
  });

  it("--apply manda lotti sotto il limite di un argomento, con la chiave hashata e senza IP", async () => {
    const db = dbBase();
    const lungo = "x".repeat(20_000);
    const altri = Array.from({ length: 12 }, (_, i) => `lungo-${String(i).padStart(4, "0")}`);
    for (const id of altri) {
      db.index.push([id, Date.parse("2026-10-10T10:00:00Z")]);
      db.records[id] = { valore: record(id, messaggi(`domanda ${lungo}`, "risposta"), "2026-10-10T10:00:00.000Z"), pttl: 80 * GIORNO };
      db.keys[id] = `${CHIAVE}-${id}`;
    }
    const { fetch } = upstashFinto(db);
    const run = vi.fn(async (_d: string, json: string) => ({ inserite: JSON.parse(json).threads.length, aggiornate: 0, invariate: 0, conflitti: 0 }));
    const righe: string[] = [];
    expect(await main({ argv: ["--apply", "--deployment", "local-di-prova"], env: ENV, fetch, run, log: (r: string) => righe.push(r), now: NOW })).toBe(0);

    expect(run.mock.calls.length).toBeGreaterThan(1);
    const inviati: string[] = [];
    for (const [deployment, json] of run.mock.calls) {
      expect(deployment).toBe("local-di-prova");
      expect(new TextEncoder().encode(json).length).toBeLessThanOrEqual(LIMITE_ARGOMENTO);
      expect(json).not.toContain(IP);
      expect(json).not.toContain(CHIAVE);
      inviati.push(...JSON.parse(json).threads.map((t: { threadId: string }) => t.threadId));
    }
    expect(inviati).toEqual([ID_1, ID_2, ...altri]);
    expect(righe.at(-1)).toMatch(/Convex: 14 inserite, 0 aggiornate, 0 invariate, 0 in conflitto/);
  });

  it("una conversazione troppo grande per un argomento di convex run è un errore già nel dry-run", async () => {
    const db = dbBase();
    db.records[ID_2] = { valore: record(ID_2, messaggi(`TESTO-PRIVATO ${"y".repeat(LIMITE_ARGOMENTO)}`, "ok"), "2026-10-05T10:00:00.000Z"), pttl: GIORNO };
    const { fetch } = upstashFinto(db);
    const righe: string[] = [];
    expect(await main({ argv: [], env: ENV, fetch, log: (r: string) => righe.push(r), now: NOW })).toBe(1);
    expect(righe.join("\n")).toMatch(/n\. 2 dell'indice: \d+\.\d KB, troppo per una chiamata a convex run/);
    expect(righe.join("\n")).not.toContain("TESTO-PRIVATO");
  });

  it("lotti: in ordine, ognuno sotto il limite", () => {
    const t = (n: number) => ({ threadId: `t-${String(n).padStart(6, "0")}`, messages: ["z".repeat(n * 10)] });
    const tutti = [5, 30, 2, 45, 1, 1, 60].map(t);
    const gruppi = lotti(tutti, 1000);
    expect(gruppi.length).toBeGreaterThan(1);
    expect(gruppi.flat()).toEqual(tutti);
    for (const g of gruppi) expect(JSON.stringify({ threads: g }).length).toBeLessThanOrEqual(1000);
    expect(lotti([], 1000)).toEqual([]);
    // una sola conversazione oltre il limite resta da sola (il dry-run la segnala come errore)
    expect(lotti([t(1), t(200), t(1)], 1000)).toEqual([[t(1)], [t(200)], [t(1)]]);
  });

  it("opzioni: --apply vuole --deployment esplicito; niente combinazioni ambigue", () => {
    expect(opzioni([])).toMatchObject({ apply: false });
    expect(opzioni(["--dry-run"])).toMatchObject({ apply: false, dryRun: true });
    expect(opzioni(["--apply", "--deployment", "preview/multiutente"])).toMatchObject({ apply: true, deployment: "preview/multiutente" });
    expect(opzioni(["--apply", "--deployment=dev"])).toMatchObject({ apply: true, deployment: "dev" });
    expect(() => opzioni(["--apply"])).toThrow(/--deployment/);
    expect(() => opzioni(["--apply", "--deployment"])).toThrow(/--deployment/);
    expect(() => opzioni(["--apply", "--deployment", "--prod"])).toThrow(/--deployment/);
    expect(() => opzioni(["--apply", "--dry-run", "--deployment", "dev"])).toThrow(/insieme/);
    expect(() => opzioni(["--deployment", "dev"])).toThrow(/solo con --apply/);
    expect(() => opzioni(["--prod"])).toThrow(/sconosciuto/);
  });
});

describe("--apply: la CLI Convex (spawnSync simulato)", () => {
  const RADICE_REPO = fileURLToPath(new URL("..", import.meta.url));
  const JSON_VUOTO = JSON.stringify({ threads: [] });
  const esito = (o: Partial<Record<"inserite" | "aggiornate" | "invariate" | "conflitti", number>> = {}) =>
    ({ status: 0, stdout: JSON.stringify({ inserite: 0, aggiornate: 0, invariate: 0, conflitti: 0, ...o }, null, 2), stderr: "" });
  const chiamata = (i = 0) => vi.mocked(spawnSync).mock.calls[i] as unknown as [string, string[], SpawnSyncOptions];
  // l'ambiente di `fnox exec` dal checkout principale: valori finti
  const ENV_FNOX = {
    ...ENV, PATH: "/usr/bin", HOME: "/home/finto",
    CONVEX_DEPLOYMENT: "dev:deployment-finto", VITE_CONVEX_URL: "https://finto.convex.cloud", CONVEX_SITE_URL: "https://finto.convex.site",
    CONVEX_DEPLOY_KEY: "deploy-key-finta", CONVEX_DEPLOY_KEY_PROD: "deploy-key-prod-finta", BETTER_AUTH_SECRET: "auth-finto",
    CHAT_SERVER_SECRET: "chat-finto", GEMINI_API_KEY: "gemini-finto", VERCEL_TOKEN: "vercel-finto", SENTRY_DSN_PROD: "dsn-finto",
    UPSTASH_REDIS_REST_TOKEN: "ro-finto",
  };

  it("lancia `pnpm exec convex run --deployment <nome> migrations:importChatThreads <json>` dalla radice del repo", async () => {
    vi.mocked(spawnSync).mockReturnValue(esito({ inserite: 2 }) as never);
    expect(await convexRun("local-di-prova", JSON_VUOTO, ENV_FNOX)).toEqual({ inserite: 2, aggiornate: 0, invariate: 0, conflitti: 0 });
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = chiamata();
    expect(cmd).toBe("pnpm");
    expect(args).toEqual(["exec", "convex", "run", "--deployment", "local-di-prova", "migrations:importChatThreads", JSON_VUOTO]);
    expect(resolve(String(opts.cwd))).toBe(resolve(RADICE_REPO));
    expect(spawn).not.toHaveBeenCalled();
  });

  it("alla CLI non arrivano segreti, Upstash né un deployment preselezionato: sceglie solo --deployment", async () => {
    vi.mocked(spawnSync).mockReturnValue(esito() as never);
    await convexRun("local-di-prova", JSON_VUOTO, ENV_FNOX);
    const env = chiamata()[2].env as Record<string, string>;
    expect(Object.keys(env).sort()).toEqual(["HOME", "PATH"]);
    for (const nome of Object.keys(ENV_FNOX)) {
      if (/TOKEN|SECRET|_KEY|CONVEX_DEPLOY|_PROD|CONVEX_|UPSTASH_/.test(nome)) expect(env, nome).not.toHaveProperty(nome);
    }
    const valori = Object.values(env).join("\n");
    for (const v of ["deploy-key", "finto.convex", "upstash-finto", TOKEN_FINTO, "ro-finto", "auth-finto", "chat-finto", "gemini-finto", "vercel-finto"]) {
      expect(valori, v).not.toContain(v);
    }
  });

  it("un errore riporta il motivo del server, mai il JSON inviato, le chiavi o i testi", async () => {
    const json = JSON.stringify({ threads: [{ threadId: ID_1, title: "TESTO-PRIVATO-UNO", writeKeyHash: sha(CHIAVE), messages: MSG_1 }] });
    const stderr = (motivo: string) => [
      "\x1b[31m✖ Failed to run function \"migrations:importChatThreads\":",
      `Args: ${json}`,
      "ConvexError: [Request ID: 0123abcd] Server Error",
      motivo,
      `    at handler (../convex/migrations.ts:61:22) ${json}`,
      "  Called by client\x1b[39m",
    ].join("\n");
    const casi: Array<[string, RegExp]> = [
      [
        `Uncaught ConvexError: {"code":"input_non_valido","messaggio":"input non valido — threads.0: chiave non ammessa","campo":"threads.0"}`,
        /\(codice 1\): input_non_valido, input non valido — threads\.0: chiave non ammessa, campo threads\.0$/,
      ],
      ["Uncaught Error: migrazione: manca il profilo gabrifila (prima seed:ensure)", /\(codice 1\): Uncaught Error: migrazione: manca il profilo gabrifila \(prima seed:ensure\)$/],
      [`Uncaught Error: Value is too large ${json}`, /\(codice 1\): Uncaught Error: Value is too large$/],
    ];
    for (const [motivo, atteso] of casi) {
      vi.mocked(spawnSync).mockReturnValueOnce({ status: 1, stdout: "", stderr: stderr(motivo) } as never);
      const e = await convexRun("local-di-prova", json, ENV).catch((x: Error) => x);
      expect(e).toBeInstanceOf(Error);
      expect(String(e)).toMatch(atteso);
      for (const s of [ID_1, "TESTO-PRIVATO", sha(CHIAVE), "threads\":", "query_concerts", "\x1b"]) expect(String(e), s).not.toContain(s);
    }
    // la CLI non parte (argomento troppo lungo): solo il codice
    vi.mocked(spawnSync).mockReturnValueOnce({ error: Object.assign(new Error(`spawnSync pnpm E2BIG ${json}`), { code: "E2BIG" }), status: null, stdout: "", stderr: "" } as never);
    const e2big = await convexRun("local-di-prova", json, ENV).catch((x: Error) => x);
    expect(String(e2big)).toMatch(/\(E2BIG\)/);
    expect(String(e2big)).not.toContain("TESTO-PRIVATO");
    // uscita 0 ma stdout non JSON: errore senza ripeterlo
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 0, stdout: `TESTO-PRIVATO ${json}`, stderr: "" } as never);
    const illeggibile = await convexRun("local-di-prova", json, ENV).catch((x: Error) => x);
    expect(String(illeggibile)).toMatch(/esito non leggibile/);
    expect(String(illeggibile)).not.toContain("TESTO-PRIVATO");
  });

  it("main --apply con la CLI: un `convex run` per lotto, esiti sommati, conflitti → uscita 1", async () => {
    const db = dbBase();
    const altri = Array.from({ length: 8 }, (_, i) => `lungo-${String(i).padStart(4, "0")}`);
    for (const id of altri) {
      db.index.push([id, Date.parse("2026-10-10T10:00:00Z")]);
      db.records[id] = { valore: record(id, messaggi(`domanda ${"x".repeat(20_000)}`, "risposta"), "2026-10-10T10:00:00.000Z"), pttl: 80 * GIORNO };
    }
    vi.mocked(spawnSync).mockImplementation(((_cmd: string, args: string[]) => {
      const n = JSON.parse(args.at(-1)!).threads.length;
      return esito({ inserite: n - 1, invariate: 1 });
    }) as never);
    const righe: string[] = [];
    const { fetch } = upstashFinto(db);
    expect(await main({ argv: ["--apply", "--deployment", "local-di-prova"], env: ENV_FNOX, fetch, log: (r: string) => righe.push(r), now: NOW })).toBe(0);
    const chiamate = vi.mocked(spawnSync).mock.calls.length;
    expect(chiamate).toBeGreaterThan(1);
    for (let i = 0; i < chiamate; i++) {
      const [, args, opts] = chiamata(i);
      expect(args.slice(0, 6)).toEqual(["exec", "convex", "run", "--deployment", "local-di-prova", "migrations:importChatThreads"]);
      expect(new TextEncoder().encode(args[6]).length).toBeLessThanOrEqual(LIMITE_ARGOMENTO);
      expect(Object.keys(opts.env as object).sort()).toEqual(["HOME", "PATH"]);
    }
    expect(righe.at(-1)).toBe(`Convex: ${10 - chiamate} inserite, 0 aggiornate, ${chiamate} invariate, 0 in conflitto (thread di un altro profilo: non toccati)`);

    vi.mocked(spawnSync).mockReset();
    vi.mocked(spawnSync).mockReturnValue(esito({ conflitti: 1 }) as never);
    expect(await main({ argv: ["--apply", "--deployment", "local-di-prova"], env: ENV_FNOX, fetch: upstashFinto(dbBase()).fetch, log: vi.fn(), now: NOW })).toBe(1);
  });
});
