/* ──────────────────────────────────────────────────────────────
   L'Oracolo finto dei test locali (ORACOLO_FAKE=1): `fakeText()` di
   TanStack AI al posto di Gemini, senza rete né chiave. Vale SOLO con
   E2E=1 e fuori da Vercel (PIANO §10: queste variabili non esistono mai su
   Vercel), così un ORACOLO_FAKE dimenticato non spegne mai l'Oracolo vero.

   Copione: a una domanda chiama query_concerts senza filtri (così l'SSE
   contiene la stessa strada server dei dati veri), al risultato risponde
   con il conteggio. Se la domanda chiede il "tema chiaro" chiama invece lo
   strumento CLIENT set_visitor_theme (il giro interruzione → browser →
   ripresa di TanStack AI 0.71) e al risultato risponde "Fatto: tema
   chiaro.". Le spec di e2e/ lo usano per storico, chiavi, limiti e
   strumenti del browser.

   In scrittura (/api/chat/scrittura, e2e/oracolo-scrittura.spec.ts e
   oracolo-scheda.spec.ts) concerti e festival passano dalla scheda
   (propose_concert, che ferma il run finché il proprietario non salva):
   - "aggiungi un concerto" → una scheda vuota;
   - "aggiungi il concerto di X" → X, 20/11/2026, Fabrique, Milano;
   - "ho visto X al V [con A [e B]] [partito/a da P][, voto N]" → X al V
     (Milano) il 18/10/2025, con quei compagni, quella partenza, quel voto;
   - "aggiungi il festival F con A, B e C" → F (20/06/2026, Fabrique) con
     quella lineup;
   - "aggiungi i concerti di A e B" → due schede nello stesso passo
     (21 e 22/11/2026);
   - "cambia il voto di X in N" → list_concerts, poi la scheda di modifica
     {id, voto: N} del primo trovato;
   - "togli A dal festival F" → list_concerts {artista: A}, poi la scheda
     di modifica {id, remove_concerts: [A]} del primo festival trovato;
   - "cancella il concerto di X" → list_concerts, poi delete_concert sul
     primo trovato (approvazione nella chat).
   Ai risultati delle schede risponde "Fatto: concerto aggiunto." (o
   festival, modificato; più "Mancano: …" se manca qualcosa), "Fatto: N
   concerti salvati.", "Fatto: k salvati, j scartati.", "Va bene, non lo
   salvo." (scartata) o "Non ci sono riuscito: …" (errore); a una
   correzione rifà la scheda partendo dalla bozza (o dalla chiamata di
   prima) con la nota applicata ("voto 3", "posizione 6", "con Luca e
   Sara", "era il 2025-10-17"), altrimenti "Ok: dimmi cosa cambiare.". Alle
   cancellazioni "Fatto: concerto cancellato." o, se l'approvazione è
   negata, "Va bene, non lo cancello.". Il resto passa da query_concerts
   come in lettura.
   ────────────────────────────────────────────────────────────── */

import type { ModelMessage } from "@tanstack/ai";
import type { FakeResponse, FakeTextAdapter } from "@tanstack/ai/testing";

type Env = Record<string, string | undefined>;

export const oracoloFinto = (env: Env): boolean => env.ORACOLO_FAKE === "1" && env.E2E === "1" && !env.VERCEL;

/** Il risultato di uno strumento come oggetto, se è JSON. */
function risultato(m: ModelMessage | undefined): Record<string, unknown> {
  if (m?.role !== "tool" || typeof m.content !== "string") return {};
  try {
    const r = JSON.parse(m.content) as unknown;
    return r && typeof r === "object" ? (r as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const vuoleTemaChiaro = (m: ModelMessage | undefined) => m?.role === "user" && typeof m.content === "string" && /tema chiaro/i.test(m.content);

/** La chiamata del modello con quell'id. */
function chiamataDi(messages: readonly ModelMessage[], toolCallId: string) {
  for (const m of messages) {
    const call = m.role === "assistant" ? m.toolCalls?.find(c => c.id === toolCallId) : undefined;
    if (call) return call;
  }
  return undefined;
}

/** Il nome dello strumento a cui risponde un messaggio `tool`. */
const strumentoDi = (messages: readonly ModelMessage[], toolCallId: string): string | undefined => chiamataDi(messages, toolCallId)?.function.name;

/** Gli argomenti (letti dal JSON) di una chiamata del modello. */
export function argomentiDi(messages: readonly ModelMessage[], toolCallId: string): Record<string, unknown> {
  try {
    const a = JSON.parse(chiamataDi(messages, toolCallId)?.function.arguments || "{}") as unknown;
    return a && typeof a === "object" ? (a as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** I risultati in fondo alla conversazione (dalla fine indietro fino a un messaggio che non è `tool`), in ordine. */
export function risultatiFinali(messages: readonly ModelMessage[]): ModelMessage[] {
  let i = messages.length;
  while (i > 0 && messages[i - 1].role === "tool") i--;
  return messages.slice(i);
}

/** Il testo dell'ultima domanda dell'utente. */
export function ultimaDomanda(messages: readonly ModelMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user" && typeof m.content === "string") return m.content.trim();
  }
  return "";
}

export function passoFinto(messages: readonly ModelMessage[]): FakeResponse {
  const ultimo = messages[messages.length - 1];
  if (ultimo?.role === "tool") {
    const r = risultato(ultimo);
    if (r.theme === "light") return { text: "Fatto: tema chiaro." };
    return { text: `Risposta finta dell'Oracolo: ${typeof r.count === "number" ? r.count : "?"} concerti.` };
  }
  if (vuoleTemaChiaro(ultimo)) return { toolCalls: [{ name: "set_visitor_theme", input: { theme: "light" } }] };
  return { toolCalls: [{ name: "query_concerts", input: {} }] };
}

/* ── in scrittura ─────────────────────────────────────────────── */

const AGGIUNGI_VUOTO_RE = /^aggiungi un concerto\.?$/i;
const AGGIUNGI_RE = /^aggiungi il concerto di (.+?)\.?$/i;
const HO_VISTO_RE = /^ho visto (.+?) al (.+?)(?: con (.+?))?(?: partit[oa] da (.+?))?(?:, voto (\d))?\.?$/i;
const FESTIVAL_RE = /^aggiungi il festival (.+?) con (.+?)\.?$/i;
const DUE_RE = /^aggiungi i concerti di (.+?) e (.+?)\.?$/i;
const CAMBIA_VOTO_RE = /^cambia il voto di (.+?) in (\d)\.?$/i;
const TOGLI_RE = /^togli (.+?) dal festival(?: .+?)?\.?$/i;
const CANCELLA_RE = /^cancella il concerto di (.+?)\.?$/i;

/** "Luca e Sara", "A, B e C" → ["Luca", "Sara"], ["A", "B", "C"]. */
const elenco = (s: string) => s.split(/\s*,\s*|\s+e\s+/).map(x => x.trim()).filter(Boolean);

const proponi = (input: Record<string, unknown>) => ({ name: "propose_concert", input });

/** La nota di una correzione applicata alla scheda; null se non cambia niente. */
function correggi(base: Record<string, unknown>, nota: string): Record<string, unknown> | null {
  const cambi: Record<string, unknown> = {};
  const voto = /voto (\d)/i.exec(nota);
  if (voto) cambi.voto = Number(voto[1]);
  const posizione = /posizione (\d)/i.exec(nota);
  if (posizione) cambi.vicinanza = Number(posizione[1]);
  const con = /con ([^,.]+)/i.exec(nota);
  if (con) cambi.with = elenco(con[1]);
  const data = /era il (\d{4}-\d{2}-\d{2})/i.exec(nota);
  if (data) cambi.date = data[1];
  return Object.keys(cambi).length ? { ...base, ...cambi } : null;
}

/** La risposta ai risultati delle schede (tutti di propose_concert). */
function rispostaSchede(messages: readonly ModelMessage[], finali: ModelMessage[]): FakeResponse {
  const esiti = finali.map(m => ({ m, r: risultato(m) }));
  const correzioni = esiti.filter(x => x.r.motivo === "correzione");
  if (correzioni.length) {
    const nuove = correzioni.flatMap(({ m, r }) => {
      const base = (r.bozza as Record<string, unknown> | undefined) ?? argomentiDi(messages, m.toolCallId ?? "");
      const corretta = correggi(base, typeof r.nota === "string" ? r.nota : "");
      return corretta ? [proponi(corretta)] : [];
    });
    return nuove.length ? { toolCalls: nuove } : { text: "Ok: dimmi cosa cambiare." };
  }
  if (esiti.length === 1) {
    const { r } = esiti[0];
    if (r.ok === true) {
      const mancano = Array.isArray(r.mancano) && r.mancano.length ? ` Mancano: ${r.mancano.join(", ")}.` : "";
      return { text: `Fatto: ${r.tipo === "festival" ? "festival" : "concerto"} ${String(r.azione)}.${mancano}` };
    }
    if (r.ok === false && r.errore) return { text: `Non ci sono riuscito: ${String((r.errore as { messaggio?: unknown }).messaggio ?? "")}` };
    // scartata, o mai decisa ({ok: false, error: "non eseguito"})
    return { text: "Va bene, non lo salvo." };
  }
  const salvati = esiti.filter(x => x.r.ok === true).length;
  if (!salvati) return { text: "Va bene, non lo salvo." };
  if (salvati === esiti.length) return { text: `Fatto: ${salvati} concerti salvati.` };
  return { text: `Fatto: ${salvati} salvati, ${esiti.length - salvati} scartati.` };
}

/** Il copione in scrittura: la scheda per i concerti, il catalogo (con l'approvazione) per le cancellazioni. */
export function passoFintoScrittura(messages: readonly ModelMessage[]): FakeResponse {
  const ultimo = messages[messages.length - 1];
  if (ultimo?.role === "tool") {
    const finali = risultatiFinali(messages);
    if (finali.every(m => strumentoDi(messages, m.toolCallId ?? "") === "propose_concert")) return rispostaSchede(messages, finali);
    const nome = strumentoDi(messages, ultimo.toolCallId ?? "");
    const r = risultato(ultimo);
    if (nome === "list_concerts") {
      const concerti = (r.concerts as { id?: unknown; kind?: unknown }[] | undefined) ?? [];
      const togli = TOGLI_RE.exec(ultimaDomanda(messages));
      if (togli) {
        const festival = concerti.find(c => typeof c.id === "string" && c.kind === "festival");
        return festival ? { toolCalls: [proponi({ id: festival.id, remove_concerts: [togli[1]] })] } : { text: "Non trovo quel festival." };
      }
      const trovato = concerti.find(c => typeof c.id === "string");
      if (!trovato) return { text: "Non trovo quel concerto." };
      const cambia = CAMBIA_VOTO_RE.exec(ultimaDomanda(messages));
      if (cambia) return { toolCalls: [proponi({ id: trovato.id, voto: Number(cambia[2]) })] };
      return { toolCalls: [{ name: "delete_concert", input: { id: trovato.id, confirm: true } }] };
    }
    // approvazione negata ({error}) o errore di Convex ({errore: {code, messaggio}})
    if (typeof r.error === "string") return { text: "Va bene, non lo cancello." };
    if (r.errore) return { text: `Non ci sono riuscito: ${String((r.errore as { messaggio?: unknown }).messaggio ?? "")}` };
    if (nome === "delete_concert") return { text: "Fatto: concerto cancellato." };
    return passoFinto(messages);
  }
  const testo = ultimo?.role === "user" && typeof ultimo.content === "string" ? ultimo.content.trim() : "";
  if (AGGIUNGI_VUOTO_RE.test(testo)) return { toolCalls: [proponi({})] };
  const aggiungi = AGGIUNGI_RE.exec(testo);
  if (aggiungi) return { toolCalls: [proponi({ artist: aggiungi[1], date: "2026-11-20", venue: "Fabrique", city: "Milano" })] };
  const visto = HO_VISTO_RE.exec(testo);
  if (visto) {
    const [, artist, venue, con, da, voto] = visto;
    return {
      toolCalls: [proponi({
        artist, date: "2025-10-18", venue, city: "Milano",
        ...(con ? { with: elenco(con) } : {}), ...(da ? { from: da } : {}), ...(voto ? { voto: Number(voto) } : {}),
      })],
    };
  }
  const festival = FESTIVAL_RE.exec(testo);
  if (festival) {
    return { toolCalls: [proponi({ name: festival[1], date: "2026-06-20", venue: "Fabrique", city: "Milano", concerts: elenco(festival[2]).map(artist => ({ artist })) })] };
  }
  const due = DUE_RE.exec(testo);
  if (due) {
    return {
      toolCalls: [
        proponi({ artist: due[1], date: "2026-11-21", venue: "Fabrique", city: "Milano" }),
        proponi({ artist: due[2], date: "2026-11-22", venue: "Fabrique", city: "Milano" }),
      ],
    };
  }
  const cambia = CAMBIA_VOTO_RE.exec(testo);
  if (cambia) return { toolCalls: [{ name: "list_concerts", input: { artista: cambia[1] } }] };
  const togli = TOGLI_RE.exec(testo);
  if (togli) return { toolCalls: [{ name: "list_concerts", input: { artista: togli[1] } }] };
  const cancella = CANCELLA_RE.exec(testo);
  if (cancella) return { toolCalls: [{ name: "list_concerts", input: { artista: cancella[1] } }] };
  return passoFinto(messages);
}

/** Un adapter finto nuovo per ogni richiesta (la coda delle risposte è sua). */
export async function adapterFinto(scrittura = false): Promise<FakeTextAdapter<"oracolo-finto">> {
  const { fakeText } = await import("@tanstack/ai/testing");
  const fake = fakeText({ model: "oracolo-finto" });
  const copione = scrittura ? passoFintoScrittura : passoFinto;
  const passo = ({ request }: { request: { messages: ModelMessage[] } }) => copione(request.messages);
  // una risposta per giro: al massimo 5 in lettura (untilAnswered), 8 in scrittura
  fake.setResponses(Array.from({ length: scrittura ? 8 : 5 }, () => passo));
  return fake;
}
