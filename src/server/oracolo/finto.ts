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

   In scrittura (/api/chat/scrittura, e2e/oracolo-scrittura.spec.ts) il
   copione usa gli strumenti del catalogo: "aggiungi il concerto di X"
   chiama add_concert (X, 20/11/2026, Fabrique, Milano); "cancella il
   concerto di X" chiama list_concerts e poi delete_concert sul primo
   trovato, che chiede l'approvazione nella chat. Al risultato risponde
   "Fatto: concerto aggiunto." / "Fatto: concerto cancellato." o, se
   l'approvazione è negata, "Va bene, non lo cancello.". Il resto passa
   da query_concerts come in lettura.
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

/** Il nome dello strumento a cui risponde un messaggio `tool`. */
function strumentoDi(messages: readonly ModelMessage[], toolCallId: string): string | undefined {
  for (const m of messages) {
    const call = m.role === "assistant" ? m.toolCalls?.find(c => c.id === toolCallId) : undefined;
    if (call) return call.function.name;
  }
  return undefined;
}

const AGGIUNGI_RE = /^aggiungi il concerto di (.+?)\.?$/i;
const CANCELLA_RE = /^cancella il concerto di (.+?)\.?$/i;

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

/** Il copione in scrittura: strumenti del catalogo, con l'approvazione per le cancellazioni. */
export function passoFintoScrittura(messages: readonly ModelMessage[]): FakeResponse {
  const ultimo = messages[messages.length - 1];
  if (ultimo?.role === "tool") {
    const nome = strumentoDi(messages, ultimo.toolCallId ?? "");
    const r = risultato(ultimo);
    if (nome === "list_concerts") {
      const trovato = (r.concerts as { id?: unknown }[] | undefined)?.find(c => typeof c.id === "string");
      return trovato ? { toolCalls: [{ name: "delete_concert", input: { id: trovato.id, confirm: true } }] } : { text: "Non trovo quel concerto." };
    }
    // approvazione negata ({error}) o errore di Convex ({errore: {code, messaggio}})
    if (typeof r.error === "string") return { text: "Va bene, non lo cancello." };
    if (r.errore) return { text: `Non ci sono riuscito: ${String((r.errore as { messaggio?: unknown }).messaggio ?? "")}` };
    if (nome === "add_concert") return { text: "Fatto: concerto aggiunto." };
    if (nome === "delete_concert") return { text: "Fatto: concerto cancellato." };
    return passoFinto(messages);
  }
  const testo = ultimo?.role === "user" && typeof ultimo.content === "string" ? ultimo.content.trim() : "";
  const aggiungi = AGGIUNGI_RE.exec(testo);
  if (aggiungi) {
    return { toolCalls: [{ name: "add_concert", input: { kind: "concert", date: "2026-11-20", artist: aggiungi[1], venue: "Fabrique", city: "Milano" } }] };
  }
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
