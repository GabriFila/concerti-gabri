/* ──────────────────────────────────────────────────────────────
   Storico e limiti dell'Oracolo su Convex, dal lato della route Start
   (PIANO §1.25–1.26): le due httpAction `/oracolo/turno` (prima di Gemini:
   limiti, pagina del thread, chiave; risponde con la conversazione salvata)
   e `/oracolo/trascrizione` (alla fine: i messaggi). CHAT_SERVER_SECRET
   viaggia SOLO come `Authorization: Bearer`, mai nel corpo, nei log o negli
   errori.

   Prima di lasciare il server Start:
   - la chiave di scrittura diventa il suo SHA-256 (Convex non la vede mai);
   - l'IP diventa un HMAC-SHA-256 con una chiave derivata via HKDF da
     CHAT_SERVER_SECRET (`info: "concerti/ip"`): niente variabili nuove, e
     senza il segreto l'HMAC non si rovescia.
   ────────────────────────────────────────────────────────────── */

import { createHash, createHmac, hkdfSync } from "node:crypto";

export type Visibilita = "pubblica" | "proprietario";

/** Il turno o la trascrizione di un thread, come li vede Convex. */
export interface ChiaveTurno {
  handle: string;
  threadId: string;
  visibility: Visibilita;
  writeKeyHash?: string;
  ipHmac: string;
}

export interface Trascrizione extends ChiaveTurno {
  author?: string;
  messages: unknown[];
}

/** La risposta di un'httpAction: `ok`, oppure `{code, messaggio}` con lo stato HTTP. */
export interface EsitoStorico {
  ok: boolean;
  status: number;
  code?: string;
  messaggio?: string;
  nuovo?: boolean;
  /** Il turno: la conversazione salvata del thread (vuota se è nuovo), l'unica che torna al modello. */
  messages?: unknown[];
}

export const MIN_SEGRETO = 16;

export const hashChiave = (writeKey: string): string => createHash("sha256").update(writeKey).digest("hex");

const chiaviIp = new Map<string, Buffer>();
/** HMAC dell'IP con la chiave HKDF del segreto (calcolata una volta per segreto). */
export function ipHmac(ip: string, secret: string): string {
  let k = chiaviIp.get(secret);
  if (!k) {
    k = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "concerti/ip", 32));
    chiaviIp.clear();
    chiaviIp.set(secret, k);
  }
  return createHmac("sha256", k).update(ip).digest("hex");
}

/** L'URL delle httpAction del deployment (inserito al build, come VITE_CONVEX_URL: PIANO §1.6). */
export function convexSiteUrl(): string {
  const url = import.meta.env.VITE_CONVEX_SITE_URL;
  if (!url) throw new Error("VITE_CONVEX_SITE_URL mancante al build: l'Oracolo non sa dove salvare lo storico");
  return url;
}

export interface Storico {
  turno(k: ChiaveTurno): Promise<EsitoStorico>;
  salva(t: Trascrizione): Promise<EsitoStorico>;
}

/** Le chiamate vere alle httpAction, legate a un segreto e a un URL (senza URL al build:
    l'errore arriva alla prima chiamata, dove la route lo traduce in 503). */
export function storicoConvex(secret: string, siteUrl?: string, fetchFn: typeof fetch = fetch): Storico {
  const chiama = async (percorso: "turno" | "trascrizione", corpo: unknown): Promise<EsitoStorico> => {
    const res = await fetchFn(new URL(`/oracolo/${percorso}`, siteUrl ?? convexSiteUrl()), {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: res.ok,
      status: res.status,
      ...(typeof data.code === "string" ? { code: data.code } : {}),
      ...(typeof data.messaggio === "string" ? { messaggio: data.messaggio } : {}),
      ...(typeof data.nuovo === "boolean" ? { nuovo: data.nuovo } : {}),
      ...(Array.isArray(data.messages) ? { messages: data.messages } : {}),
    };
  };
  return { turno: k => chiama("turno", k), salva: t => chiama("trascrizione", t) };
}
