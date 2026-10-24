/* ──────────────────────────────────────────────────────────────
   L'Oracolo in scrittura (PIANO §1.27, traguardo 6), dentro
   /<handle>/modifica: il corpo della chat. La cornice (il <dialog
   id="oracolo"> agganciato a destra o a tutto schermo, i pulsanti per
   aprirlo, Esc e il focus) è di oracolo/Contenitore.tsx, che la rende
   una volta sola e non la smonta mai: chiusa resta viva, col suo flusso
   e le approvazioni in sospeso. L'Oracolo dei visitatori qui si fa da
   parte (src/chat/ChatWidget.tsx).

   - Parla con POST /api/chat/scrittura (src/server/oracolo/scrittura.ts):
     sessione e handle del proprietario li controlla il server, l'Origin è
     quello della pagina. Gli strumenti sono le operazioni del catalogo,
     chiamate come "Oracolo": ogni modifica arriva dal vivo nelle sezioni
     della pagina e nel registro di #attivita, da dove si annulla.
   - Cancellazioni, import, annullamenti, unioni di persone e la wishlist
     sostituita chiedono l'approvazione: lo strumento si ferma e qui
     compaiono "Conferma" e "Rifiuta". La domanda dice su cosa si agisce,
     letto da Convex con gli id dello strumento: non si fida della
     descrizione del modello. La risposta
     riprende il run interrotto (`interrupts` di useChat, TanStack AI
     0.71): gli strumenti stanno solo sul server, quindi per il client
     l'interruzione è "generica" e si risolve con `{approved}`.
   - Le conversazioni sono private (`proprietario`): lo storico si legge
     con chat.myThreads / chat.myThread, solo da qui.
   - Solo nel browser, dopo l'idratazione: nell'HTML SSR non c'è niente.
   ────────────────────────────────────────────────────────────── */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { ModelMessage } from "@tanstack/ai";
import { createChatClientOptions, type BoundInterrupts } from "@tanstack/ai-client";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { api } from "../../convex/_generated/api";
import { logMessagesToUIMessages } from "../chat/chatlog.ts";
import { Message, Puntini, fmtWhen, randomId } from "../chat/parti.tsx";
import { TestaOracolo } from "./oracolo/Contenitore.tsx";
import { useOracolo, useRichiestaOracolo } from "./oracolo/contesto.tsx";
import { useConvex, useDati } from "./sezioni/comuni.tsx";

/** Gli errori della route in italiano (il client vede solo lo stato HTTP). */
function erroreScrittura(err: Error | undefined): string | null {
  if (!err) return null;
  const m = err.message || "";
  if (/401/.test(m)) return "La sessione è scaduta: entra di nuovo per continuare.";
  if (/403/.test(m)) return "L'Oracolo in scrittura funziona solo sulla tua pagina.";
  if (/429|Troppi|[Ll]imite/.test(m)) return "Hai raggiunto il limite di messaggi. Riprova più tardi.";
  if (/troppo lung/i.test(m)) return "Conversazione troppo lunga: apri una nuova chat.";
  return "Qualcosa è andato storto. Riprova, o apri una nuova chat.";
}

const SUGGERIMENTI = [
  "Quali concerti devo ancora completare?",
  "Aggiungi un concerto",
  "Annulla l'ultima modifica",
];

/* ── strumenti: in corso / fatto ─────────────────────────────── */

const ETICHETTE: Record<string, [string, string]> = {
  query_concerts: ["Consulto i dati…", "Dati consultati"],
  report_unsupported_query: ["Lo segnalo…", "Domanda segnalata"],
  get_profile: ["Leggo il profilo…", "Profilo letto"],
  list_concerts: ["Leggo i concerti…", "Concerti letti"],
  get_concert: ["Leggo il concerto…", "Concerto letto"],
  list_people: ["Leggo le persone…", "Persone lette"],
  list_departures: ["Leggo le partenze…", "Partenze lette"],
  list_gifters: ["Leggo i “regalato da”…", "“Regalato da” letti"],
  list_wishlist: ["Leggo la wishlist…", "Wishlist letta"],
  search_venue: ["Cerco la venue…", "Venue cercata"],
  get_stats: ["Calcolo le statistiche…", "Statistiche calcolate"],
  list_activity: ["Leggo le attività…", "Attività lette"],
  add_concert: ["Aggiungo il concerto…", "Concerto aggiunto"],
  update_concert: ["Modifico il concerto…", "Concerto modificato"],
  delete_concert: ["Cancello il concerto…", "Concerto cancellato"],
  add_person: ["Aggiungo la persona…", "Persona aggiunta"],
  rename_person: ["Rinomino la persona…", "Persona rinominata"],
  merge_person: ["Unisco le persone…", "Persone unite"],
  delete_person: ["Cancello la persona…", "Persona cancellata"],
  add_departure: ["Aggiungo la partenza…", "Partenza aggiunta"],
  rename_departure: ["Rinomino la partenza…", "Partenza rinominata"],
  delete_departure: ["Cancello la partenza…", "Partenza cancellata"],
  add_venue: ["Aggiungo la venue…", "Venue aggiunta al catalogo"],
  add_gifter: ["Aggiungo il “regalato da”…", "“Regalato da” aggiunto"],
  update_gifter: ["Modifico il “regalato da”…", "“Regalato da” modificato"],
  delete_gifter: ["Cancello il “regalato da”…", "“Regalato da” cancellato"],
  set_gifter_logo: ["Imposto il logo…", "Logo impostato"],
  set_wishlist: ["Aggiorno la wishlist…", "Wishlist aggiornata"],
  update_profile: ["Aggiorno il profilo…", "Profilo aggiornato"],
  set_theme: ["Cambio lo stile…", "Stile aggiornato"],
  import_concerts: ["Importo i concerti…", "Concerti importati"],
  undo: ["Annullo…", "Modifica annullata"],
};

/** Perché uno strumento non è andato: approvazione negata o errore di Convex (`{errore}`), altrimenti null. */
function esitoNegativo(part: any): string | null {
  if (part.approval?.approved === false) return "rifiutato";
  const out = part.output;
  if (!out || typeof out !== "object") return null;
  if (out.errore) return `non riuscito (${out.errore.messaggio || "errore"})`;
  if (typeof out.error === "string") return /declined|denied/i.test(out.error) ? "rifiutato" : "non riuscito";
  return null;
}

/* ── approvazioni ────────────────────────────────────────────── */

/** Le interruzioni del run in corso (useChat): ognuna si risolve una volta sola. */
const Interruzioni = createContext<BoundInterrupts>([]);

const DOMANDE: Record<string, string> = {
  delete_concert: "Cancellare il concerto",
  delete_person: "Cancellare la persona",
  delete_departure: "Cancellare la partenza",
  delete_gifter: "Cancellare il “regalato da”",
  import_concerts: "Importare i concerti",
  undo: "Annullare",
  merge_person: "Unire la persona",
  set_wishlist: "Sostituire la wishlist",
};

const Nome = ({ nome }: { nome: string | null | undefined }) => (nome ? <> «{nome}»</> : null);

function Concerto({ id }: { id: string }) {
  const q = useDati(api.entries.get, { id });
  const c = q.data as { artist?: string; name?: string; date?: string } | undefined;
  return <Nome nome={c && `${c.artist ?? c.name ?? "concerto"}${c.date ? ` del ${c.date}` : ""}`} />;
}
const ConcertoDaCancellare = ({ input }: { input: any }) => (typeof input.id === "string" ? <Concerto id={input.id} /> : null);
function PersonaDaCancellare({ input }: { input: any }) {
  return <Nome nome={useDati(api.people.list).data?.people.find(p => p.id === input.id)?.name} />;
}
function PartenzaDaCancellare({ input }: { input: any }) {
  return <Nome nome={useDati(api.departures.list).data?.departures.find(p => p.id === input.id)?.name} />;
}
function RegaloDaCancellare({ input }: { input: any }) {
  return <Nome nome={useDati(api.gifters.list).data?.gifters.find(g => g.id === input.id)?.label} />;
}
function VoceDaAnnullare({ input }: { input: any }) {
  return <Nome nome={useDati(api.activity.list, { limite: 100 }).data?.voci.find(v => v.id === input.activityId)?.riassunto} />;
}
function PersoneDaUnire({ input }: { input: any }) {
  const people = useDati(api.people.list).data?.people;
  const into = people?.find(p => p.id === input.into)?.name;
  return <><Nome nome={people?.find(p => p.id === input.from)?.name} />{into && <> con «{into}», che resta</>}</>;
}
function NuovaWishlist({ input }: { input: any }) {
  const n = Array.isArray(input.artists) ? input.artists.length : null;
  return n === null ? null : <> con {n === 1 ? "1 artista" : `${n} artisti`}</>;
}
/** Su cosa agisce lo strumento, letto da Convex con i suoi id (mai dal testo del modello). */
const OGGETTO: Record<string, ComponentType<{ input: any }>> = {
  delete_concert: ConcertoDaCancellare,
  delete_person: PersonaDaCancellare,
  delete_departure: PartenzaDaCancellare,
  delete_gifter: RegaloDaCancellare,
  undo: VoceDaAnnullare,
  merge_person: PersoneDaUnire,
  set_wishlist: NuovaWishlist,
};

function Approvazione({ part }: { part: any }) {
  const interruzione = useContext(Interruzioni).find(i => i.interruptId === part.approval.id);
  const [scelta, setScelta] = useState<boolean | null>(null);
  const input = part.input ?? {};
  const Oggetto = OGGETTO[part.name];
  // risolvibile solo finché aspetta (una chat ripresa dallo storico non ha più il run interrotto)
  const aperta = !!interruzione && interruzione.canResolve && interruzione.status === "pending" && scelta === null;
  const rispondi = (approved: boolean) => {
    if (!aperta) return;
    setScelta(approved);
    // gli strumenti stanno solo sul server: per il client è un'interruzione generica, e la risposta è la busta {approved}
    (interruzione as unknown as { resolveInterrupt(p: unknown): void }).resolveInterrupt({ approved });
  };
  return (
    <div className="chat-tool chat-approva" role="group" aria-label="Conferma richiesta">
      <span>
        {DOMANDE[part.name] ?? "Procedere"}
        {Oggetto && <Oggetto input={input} />}
        {part.name === "import_concerts" && typeof input.formato === "string" ? ` dal ${input.formato.toUpperCase()}` : ""}?
        {" "}Si può annullare da Attività.
      </span>
      {scelta !== null ? (
        <span className="chat-tool-hint">{scelta ? "Confermato: procedo…" : "Rifiutato."}</span>
      ) : interruzione ? (
        <span style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="mod-btn mod-pericolo" disabled={!aperta} onClick={() => rispondi(true)}>Conferma</button>
          <button type="button" className="mod-btn" disabled={!aperta} onClick={() => rispondi(false)}>Rifiuta</button>
        </span>
      ) : (
        <span className="chat-tool-hint">Richiesta non più valida: chiedi di nuovo.</span>
      )}
    </div>
  );
}

/** Uno strumento nella chat: la sua etichetta, o la domanda se aspetta l'approvazione. */
function Strumento({ part }: { part: any }) {
  if (part.state === "approval-requested" && part.approval && part.output == null) return <Approvazione part={part} />;
  const [inCorso, fatto] = ETICHETTE[part.name] ?? ["Lavoro…", "Fatto"];
  const negativo = esitoNegativo(part);
  const done = part.output != null || negativo !== null;
  return (
    <div className={"chat-tool" + (done ? " done" : "")}>
      <span className="chat-tool-ic" aria-hidden="true">{done ? (negativo ? "✕" : "✓") : "…"}</span>
      <span>{!done ? inCorso : negativo ? `${inCorso.replace(/…$/, "")}: ${negativo}` : fatto}</span>
    </div>
  );
}

/* ── il corpo della chat ─────────────────────────────────────── */

export function ChatScrittura({ handle }: { handle: string }) {
  // dati del proprietario e bottoni solo nel browser (come le sezioni)
  return useHydrated() ? <Pannello handle={handle} /> : null;
}

function Pannello({ handle }: { handle: string }) {
  const { aperto, segnalaRisposta } = useOracolo();
  const { richiesta, consumata } = useRichiestaOracolo();
  const [view, setView] = useState<"chat" | "storico">("chat");
  const [input, setInput] = useState("");
  const [thread, setThread] = useState(randomId);
  const [resume, setResume] = useState<{ id: string; messages: any[] } | null>(null);
  const [caricando, setCaricando] = useState<string | null>(null);
  const [erroreStorico, setErroreStorico] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const convex = useConvex();

  const chatOptions = useMemo(() => createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat/scrittura"),
    threadId: thread,
    forwardedProps: { handle },
    ...(resume?.id === thread && { initialMessages: resume.messages }),
  }), [thread, resume, handle]);
  const { messages, sendMessage, isLoading, error, clear, interrupts } = useChat(chatOptions);
  const uiError = erroreScrittura(error);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || isLoading) return;
    void sendMessage(t);
    setInput("");
  };

  const nuova = () => {
    clear();
    setThread(randomId());
    setResume(null);
    setErroreStorico(null);
    setView("chat");
  };

  const riprendi = async (id: string) => {
    if (id === thread) { setView("chat"); return; }
    setCaricando(id);
    setErroreStorico(null);
    try {
      const t = await convex.query(api.chat.myThread, { threadId: id });
      setResume({ id, messages: logMessagesToUIMessages(t.messages as ModelMessage[]) });
      setThread(id);
      setView("chat");
    } catch {
      setErroreStorico("Impossibile caricare la chat: forse è scaduta.");
    } finally {
      setCaricando(null);
    }
  };

  // l'ultimo messaggio in vista (anche quando il pannello si riapre)
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, aperto, view]);

  // tornando dallo storico alla chat, il focus nella casella
  const vistaPrima = useRef(view);
  useEffect(() => {
    if (view === "chat" && vistaPrima.current !== "chat" && aperto) inputRef.current?.focus();
    vistaPrima.current = view;
  }, [view, aperto]);

  // un testo chiesto da un'altra parte di /modifica (useOracolo().apri({ testo })): nella casella, mai inviato
  useEffect(() => {
    if (!richiesta) return;
    setView("chat");
    setInput(richiesta.testo);
    consumata(richiesta.nonce);
    inputRef.current?.focus();
  }, [richiesta, consumata]);

  // una risposta finita mentre l'Oracolo è chiuso: il puntino sui pulsanti
  const caricavaPrima = useRef(isLoading);
  useEffect(() => {
    if (caricavaPrima.current && !isLoading) segnalaRisposta();
    caricavaPrima.current = isLoading;
  }, [isLoading, segnalaRisposta]);

  // la casella cresce col testo (fino al max-height del CSS)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input, view, aperto]);

  return (
    <>
      <TestaOracolo azioni={
        <>
          <button type="button" className={"fp-clear" + (messages.length ? "" : " dis")} disabled={!messages.length} onClick={nuova}>Nuova chat</button>
          <button type="button" className={"fp-close" + (view === "storico" ? " on" : "")}
            onClick={() => { setErroreStorico(null); setView(v => (v === "storico" ? "chat" : "storico")); }}
            aria-label="Le tue chat private" aria-pressed={view === "storico"} title="Le tue chat private">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/></svg>
          </button>
        </>
      } />
      <div className="mf-oracolo-corpo">
        {view === "storico" ? (
          <div className="chat-body" ref={bodyRef}>
            {erroreStorico && <div className="chat-error">{erroreStorico}</div>}
            <Storico corrente={thread} caricando={caricando} occupato={isLoading} apri={id => void riprendi(id)} />
            <div className="chat-note">Le tue conversazioni con l'Oracolo in scrittura: private, le vedi solo tu, qui. Restano per 90 giorni.</div>
          </div>
        ) : (
          <>
            <div className="chat-body" ref={bodyRef}>
              {messages.length === 0 && (
                <div className="chat-empty">
                  <p>Sono L'Oracolo, in modalità scrittura: dimmi cosa aggiungere o cambiare (concerti, persone, wishlist, stile…) e lo faccio io. Ogni modifica compare subito nella pagina e in Attività, da dove si annulla; cancellazioni e annullamenti te li faccio confermare.</p>
                  <div className="chat-sugg">
                    {SUGGERIMENTI.map(s => (
                      <button key={s} type="button" className="fchip" onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              <Interruzioni.Provider value={interrupts}>
                {messages.map((m: any) => <Message key={m.id} message={m} Strumento={Strumento} />)}
              </Interruzioni.Provider>
              {isLoading && <Puntini />}
              {uiError && <div className="chat-error">{uiError}</div>}
            </div>
            <form className="chat-inputrow" onSubmit={e => { e.preventDefault(); send(input); }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Cosa aggiungo o cambio?"
                maxLength={1500}
                rows={1}
                aria-label="Messaggio per l'Oracolo"
                data-autofocus
              />
              <button type="submit" className="chat-send" disabled={!input.trim() || isLoading} aria-label="Invia">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>
              </button>
            </form>
            <div className="chat-note">Chat privata: la vedi solo tu. Gli indirizzi delle partenze si impostano solo in Partenze. Risposte generate dall'AI: controlla le modifiche in Attività.</div>
          </>
        )}
      </div>
    </>
  );
}

/** Le chat private del proprietario (chat.myThreads), sottoscritte solo mentre lo storico è aperto. */
function Storico({ corrente, caricando, occupato, apri }: { corrente: string; caricando: string | null; occupato: boolean; apri: (id: string) => void }) {
  const q = useDati(api.chat.myThreads);
  if (q.isPending) return <Puntini />;
  if (q.isError) return <div className="chat-error">Impossibile caricare le chat, riprova.</div>;
  const threads = q.data.threads;
  if (threads.length === 0) return <div className="chat-empty"><p>Ancora nessuna chat in scrittura.</p></div>;
  return (
    <>
      {threads.map(t => (
        <button key={t.threadId} type="button" className={"chat-hist-item" + (t.threadId === corrente ? " cur" : "")}
          disabled={caricando !== null || occupato} onClick={() => apri(t.threadId)}>
          <span className="chat-hist-title">{t.title}</span>
          <span className="chat-hist-meta">{caricando === t.threadId ? "carico…" : t.threadId === corrente ? "chat aperta" : fmtWhen(t.updatedAt)}</span>
        </button>
      ))}
    </>
  );
}
