/* Controlli di /api/chat prima di spendere una chiamata Gemini: origini
   ammesse per ambiente (PIANO §1.8, mai dall'header Host) e limiti di
   dimensione della richiesta. */

import { describe, expect, it } from "vitest";
import {
  allowedOrigins, deployKind, isAllowedOrigin, MAX_BODY_CHARS, MAX_MESSAGES, MAX_USER_TEXT, originOk, validate,
} from "./validate.ts";

const PROD = { VERCEL_ENV: "production" };
const BRANCH = "concerti-gabri-git-multiutente-gabrifilas-projects.vercel.app";
const PREVIEW = { VERCEL_ENV: "preview", VERCEL_BRANCH_URL: BRANCH };
const LOCAL = {};

describe("origini per ambiente", () => {
  it("riconosce l'ambiente da VERCEL_ENV", () => {
    expect(deployKind(PROD)).toBe("production");
    expect(deployKind(PREVIEW)).toBe("preview");
    expect(deployKind(LOCAL)).toBe("local");
    // `vercel dev` dice "development": vale come fuori da Vercel
    expect(deployKind({ VERCEL_ENV: "development" })).toBe("local");
  });

  it("produzione: solo il dominio e concerti-gabri.vercel.app", () => {
    expect(allowedOrigins(PROD)).toEqual(["https://concerti.gabrifila.me", "https://concerti-gabri.vercel.app"]);
    expect(isAllowedOrigin("https://concerti.gabrifila.me", PROD)).toBe(true);
    expect(isAllowedOrigin("https://concerti-gabri.vercel.app", PROD)).toBe(true);
    expect(isAllowedOrigin(`https://${BRANCH}`, PROD)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3100", PROD)).toBe(false);
    expect(isAllowedOrigin("https://concerti-gabri.localhost:1355", PROD)).toBe(false);
    expect(isAllowedOrigin("http://concerti.gabrifila.me", PROD)).toBe(false); // niente http
  });

  it("preview: solo l'URL del branch, mai i jolly su vercel.app", () => {
    expect(allowedOrigins(PREVIEW)).toEqual([`https://${BRANCH}`]);
    expect(isAllowedOrigin(`https://${BRANCH}`, PREVIEW)).toBe(true);
    expect(isAllowedOrigin("https://concerti-gabri-abc123-gabrifilas-projects.vercel.app", PREVIEW)).toBe(false);
    expect(isAllowedOrigin("https://concerti.gabrifila.me", PREVIEW)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3100", PREVIEW)).toBe(false);
    // VERCEL_BRANCH_URL con schema o barra finale si normalizza
    expect(allowedOrigins({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: `https://${BRANCH}/` })).toEqual([`https://${BRANCH}`]);
    // senza VERCEL_BRANCH_URL nessuna origine è ammessa
    expect(allowedOrigins({ VERCEL_ENV: "preview" })).toEqual([]);
    expect(isAllowedOrigin(`https://${BRANCH}`, { VERCEL_ENV: "preview" })).toBe(false);
  });

  it("fuori da Vercel: localhost:3100, tailnet e i worktree portless", () => {
    expect(isAllowedOrigin("http://localhost:3100", LOCAL)).toBe(true);
    expect(isAllowedOrigin("https://t3node.tail4a8e3b.ts.net:8444", LOCAL)).toBe(true);
    expect(isAllowedOrigin("https://concerti-gabri.localhost:1355", LOCAL)).toBe(true);
    expect(isAllowedOrigin("https://fase3-m4.concerti-gabri.localhost:1355", LOCAL)).toBe(true);
    // il jolly è solo per i sottodomini di concerti-gabri, sulla porta di portless, in https
    expect(isAllowedOrigin("https://altro.localhost:1355", LOCAL)).toBe(false);
    expect(isAllowedOrigin("https://evil.concerti-gabri.localhost.attacker.com:1355", LOCAL)).toBe(false);
    expect(isAllowedOrigin("http://concerti-gabri.localhost:1355", LOCAL)).toBe(false);
    expect(isAllowedOrigin("https://concerti-gabri.localhost:1356", LOCAL)).toBe(false);
    expect(isAllowedOrigin("http://localhost:3101", LOCAL)).toBe(false);
    expect(isAllowedOrigin("https://concerti.gabrifila.me", LOCAL)).toBe(false);
  });

  it("originOk: un Origin assente passa (curl, server-to-server), uno estraneo no", () => {
    expect(originOk(null, PROD)).toBe(true);
    expect(originOk("https://evil.example", PROD)).toBe(false);
    expect(originOk("null", PROD)).toBe(false); // iframe sandbox, file://
    expect(originOk("https://concerti.gabrifila.me", PROD)).toBe(true);
  });

  it("maiuscole e spazi attorno all'Origin non cambiano l'esito", () => {
    expect(isAllowedOrigin(" HTTPS://Concerti.Gabrifila.ME ", PROD)).toBe(true);
  });
});

describe("validate: forma e dimensioni della richiesta", () => {
  const user = (content: string) => ({ role: "user", content });
  const body = (o: unknown) => JSON.stringify(o);

  it("accetta una domanda semplice e genera un threadId se manca", () => {
    const r = validate(body({ messages: [user("quanti concerti ho visto nel 2025?")] }));
    expect("error" in r).toBe(false);
    if ("error" in r) return;
    expect(r.messages).toHaveLength(1);
    expect(r.threadId).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.writeKey).toBeUndefined();
  });

  it("tiene threadId, chiave di scrittura e firma valide", () => {
    const r = validate(body({
      messages: [user("ciao")], threadId: "abc123_def",
      forwardedProps: { writeKey: "k".repeat(32), author: "  Gabri \n F. " },
    }));
    if ("error" in r) throw new Error(r.error);
    expect(r.threadId).toBe("abc123_def");
    expect(r.writeKey).toBe("k".repeat(32));
    expect(r.author).toBe("Gabri F.");
  });

  it("scarta threadId riservati o malformati e chiavi non valide", () => {
    for (const threadId of ["preview", "titles", "a/b/c/d/e", "x", "z".repeat(65)]) {
      const r = validate(body({ messages: [user("ciao")], threadId, forwardedProps: { writeKey: "corta" } }));
      if ("error" in r) throw new Error(r.error);
      expect(r.threadId).not.toBe(threadId);
      expect(r.writeKey).toBeUndefined();
    }
  });

  it(`corpo oltre ${MAX_BODY_CHARS} caratteri: "troppo lunga"`, () => {
    const big = body({ messages: [user("a".repeat(MAX_BODY_CHARS))] });
    expect(validate(big)).toEqual({ error: "Conversazione troppo lunga: apri una nuova chat." });
  });

  it(`più di ${MAX_MESSAGES} messaggi: "troppo lunga"`, () => {
    const many = Array.from({ length: MAX_MESSAGES + 1 }, (_, i) => user("m" + i));
    expect(validate(body({ messages: many }))).toEqual({ error: "Conversazione troppo lunga: apri una nuova chat." });
    const ok = validate(body({ messages: many.slice(0, MAX_MESSAGES) }));
    expect("error" in ok).toBe(false);
  });

  it(`messaggio dell'utente oltre ${MAX_USER_TEXT} caratteri: "troppo lungo"`, () => {
    expect(validate(body({ messages: [user("a".repeat(MAX_USER_TEXT + 1))] })))
      .toEqual({ error: `Messaggio troppo lungo (max ${MAX_USER_TEXT} caratteri).` });
    expect("error" in validate(body({ messages: [user("a".repeat(MAX_USER_TEXT))] }))).toBe(false);
    // il limite vale per l'utente: le risposte dell'assistente possono essere più lunghe
    expect("error" in validate(body({ messages: [user("ciao"), { role: "assistant", content: "b".repeat(MAX_USER_TEXT + 1) }] }))).toBe(false);
  });

  it("JSON rotto, messaggi assenti o malformati: richiesta non valida", () => {
    const bad = { error: "Richiesta non valida." };
    expect(validate("{")).toEqual(bad);
    expect(validate(body({}))).toEqual(bad);
    expect(validate(body({ messages: [] }))).toEqual(bad);
    expect(validate(body({ messages: "ciao" }))).toEqual(bad);
    expect(validate(body({ messages: [null] }))).toEqual(bad);
    expect(validate(body({ messages: [{ content: "senza ruolo" }] }))).toEqual(bad);
  });
});
