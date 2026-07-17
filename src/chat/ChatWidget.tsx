/* ──────────────────────────────────────────────────────────────
   "L'Oracolo" — the AI chat widget: trigger button (lives in the
   bottom bar) plus the chat modal. Talks to /api/chat (Netlify
   function) via the
   TanStack AI SSE connection; filter/navigation tool calls from
   the model run here in the browser through the `ctx` callbacks
   that App provides (they own the real filter state).

   Each conversation gets its own thread id (the server keys the
   Redis transcript log on it, see netlify/functions/chat.mts) and
   a secret write key: the id is public, the key stays in this
   browser's localStorage and is sent with every message — the
   server refuses to continue a thread without the matching key.
   "Nuova chat" rotates both.

   The history button shows two tabs backed by /api/chat/history
   (chat-history.mts): "Le mie" (threads whose write key this
   device holds — continuable, resumed by rebuilding the chat
   client with initialMessages) and "Tutte" (every visitor's chats,
   public by design — read-only viewer for the ones you don't own).
   ────────────────────────────────────────────────────────────── */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { createChatClientOptions } from "@tanstack/ai-client";
import { setFiltersDef, clearFiltersDef, goToSectionDef, setThemeDef, SECTIONS } from "./tools.ts";

export type ThemeMode = "dark" | "light" | "system";

/* Implemented by App, which owns filters, the theme and the page. */
export interface ChatSiteContext {
  applyFilters(input: any): { matchCount: number; summary: string };
  clearFilters(): { matchCount: number };
  goToSection(id: string): { ok: boolean; label: string };
  setTheme(theme: ThemeMode): { ok: boolean; theme: ThemeMode };
}

const setFiltersTool = setFiltersDef.client<ChatSiteContext>((input, c) => {
  const r = c.context.applyFilters(input);
  return { ok: true, matchCount: r.matchCount, summary: r.summary };
});
const clearFiltersTool = clearFiltersDef.client<ChatSiteContext>((_input, c) => {
  return { ok: true, matchCount: c.context.clearFilters().matchCount };
});
const goToSectionTool = goToSectionDef.client<ChatSiteContext>((input, c) => {
  return c.context.goToSection(input.section);
});
const setThemeTool = setThemeDef.client<ChatSiteContext>((input, c) => {
  return c.context.setTheme(input.theme);
});

const SUGGESTIONS = [
  "Quanto ha speso Gabri in concerti nel 2025?",
  "Chi fa parte degli Imagine Dragons?",
  "Mostra solo i concerti in programma",
  "Portami alla mappa",
];

const SECTION_LABEL = Object.fromEntries(SECTIONS.map(s => [s.id, s.label]));

// randomUUID needs a secure context (https/localhost); fall back to the
// same shape TanStack generates so the server-side key stays valid.
const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ── Owned threads: id + secret write key + list metadata ──────
   localStorage is the only place the write keys live; losing it means
   those chats become read-only (still visible in the "Tutte" tab). */
interface OwnedThread { id: string; key: string; title: string; updatedAt: number }
interface PublicThread { id: string; title: string; updatedAt: number; author?: string }
const LS_THREADS = "concerti-chat-threads";
const MAX_OWNED = 50;

/* Optional visitor signature: shown next to their chats in the public
   history. Kept per-device, sent with every message; the server caps it
   at the same length and stores it per-thread. */
const LS_NAME = "concerti-chat-name";
const MAX_NAME = 40;
function loadName(): string {
  try { return (localStorage.getItem(LS_NAME) || "").slice(0, MAX_NAME); } catch { return ""; }
}
function saveName(name: string) {
  try { localStorage.setItem(LS_NAME, name); } catch { /* private mode etc. */ }
}

function loadOwned(): OwnedThread[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_THREADS) || "[]");
    return Array.isArray(v) ? v.filter(t => t && typeof t.id === "string") : [];
  } catch { return []; }
}
function saveOwned(threads: OwnedThread[]) {
  try { localStorage.setItem(LS_THREADS, JSON.stringify(threads.slice(0, MAX_OWNED))); } catch { /* private mode etc. */ }
}

const fmtWhen = (ts: number) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

const firstUserText = (messages: any[]): string => {
  const m = messages.find((x: any) => x.role === "user");
  return (m?.parts || [])
    .filter((p: any) => p.type === "text" && p.content)
    .map((p: any) => p.content)
    .join(" ")
    .trim();
};

function friendlyError(err: Error | undefined): string | null {
  if (!err) return null;
  const m = err.message || "";
  if (/403|appartiene/.test(m)) return "Questa chat appartiene a un altro visitatore: puoi solo leggerla.";
  if (/429|Troppi|[Ll]imite/.test(m)) return "Hai raggiunto il limite di messaggi. Riprova più tardi.";
  if (/troppo lung/i.test(m)) return "Conversazione troppo lunga: apri una nuova chat.";
  return "Qualcosa è andato storto. Riprova, o apri una nuova chat.";
}

const THEME_LABEL: Record<string, string> = { dark: "Scuro", light: "Chiaro", system: "Sistema" };

function ToolChip({ part }: { part: any }) {
  const done = part.output != null;
  let icon = "✓", text = "", hint = true;
  if (part.name === "set_filters") {
    text = done ? `Filtri applicati — ${part.output.matchCount} concerti` : "Applico i filtri…";
  } else if (part.name === "clear_filters") {
    text = done ? "Filtri azzerati" : "Azzero i filtri…";
  } else if (part.name === "go_to_section") {
    const label = SECTION_LABEL[part.input?.section] || "sezione";
    text = done ? `Pagina portata su “${label}”` : "Scorro la pagina…";
    icon = "→";
  } else if (part.name === "set_theme") {
    const label = THEME_LABEL[part.input?.theme] || part.input?.theme || "tema";
    text = done ? `Tema impostato: ${label}` : "Cambio il tema…";
    hint = false; // the new theme is already visible, chat included
  } else {
    return null;
  }
  return (
    <div className={"chat-tool" + (done ? " done" : "")}>
      <span className="chat-tool-ic" aria-hidden="true">{done ? icon : "…"}</span>
      <span>{text}</span>
      {done && hint && <span className="chat-tool-hint">Chiudi la chat per vedere la pagina.</span>}
    </div>
  );
}

function Message({ message }: { message: any }) {
  const isUser = message.role === "user";
  const parts = (message.parts || []).map((part: any, i: number) => {
    if (part.type === "text" && part.content) return <p key={i}>{part.content}</p>;
    if (part.type === "tool-call") return <ToolChip key={i} part={part} />;
    return null;
  }).filter(Boolean);
  if (parts.length === 0) return null;
  return <div className={"chat-msg " + (isUser ? "user" : "ai")}>{parts}</div>;
}

export default function ChatWidget({ ctx }: { ctx: ChatSiteContext }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // id + threadId together: useChat only rebuilds its client when `id`
  // changes, so rotating both is what actually starts a new thread.
  const [thread, setThread] = useState(() => ({ id: randomId(), key: randomId() }));
  const [name, setName] = useState<string>(loadName);
  const [view, setView] = useState<"chat" | "history" | "viewer">("chat");
  const [histTab, setHistTab] = useState<"mine" | "all">("mine");
  const [owned, setOwned] = useState<OwnedThread[]>(loadOwned);
  const [publicThreads, setPublicThreads] = useState<PublicThread[] | null>(null); // null = not loaded yet
  // transcript fetched from the server, applied only while its id is current
  const [resume, setResume] = useState<{ id: string; messages: any[] } | null>(null);
  // someone else's chat, shown read-only
  const [viewer, setViewer] = useState<{ id: string; title: string; messages: any[]; author?: string } | null>(null);
  const [histBusy, setHistBusy] = useState<string | null>(null);
  const [histError, setHistError] = useState<string | null>(null);

  // useChat syncs forwardedProps changes onto its client, so an edited
  // name is picked up by the next message without rebuilding the thread.
  const author = name.trim();
  const chatOptions = useMemo(() => createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools: [setFiltersTool, clearFiltersTool, goToSectionTool, setThemeTool],
    context: ctx,
    id: thread.id,
    threadId: thread.id,
    forwardedProps: { writeKey: thread.key, ...(author && { author }) },
    ...(resume?.id === thread.id && { initialMessages: resume.messages }),
  }), [ctx, thread, resume, author]);
  const { messages, sendMessage, isLoading, error, clear } = useChat(chatOptions);
  const uiError = friendlyError(error);

  // remember this thread (and its write key) once it has content
  useEffect(() => {
    if (!messages.length) return;
    const title = firstUserText(messages).slice(0, 80) || "Chat";
    setOwned(prev => {
      const next = [
        { id: thread.id, key: thread.key, title, updatedAt: Date.now() },
        ...prev.filter(t => t.id !== thread.id),
      ].slice(0, MAX_OWNED);
      saveOwned(next);
      return next;
    });
  }, [messages.length, thread]);

  const showHistory = (tab: "mine" | "all") => {
    setView("history");
    setHistTab(tab);
    setHistError(null);
    if (tab === "all") void loadPublicList();
  };

  const loadPublicList = async () => {
    try {
      const res = await fetch("/api/chat/history");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Impossibile caricare la cronologia, riprova.");
      }
      const data = await res.json();
      setPublicThreads((data.chats || []).map((c: any) => ({ id: c.threadId, title: c.title, updatedAt: c.updatedAt, author: c.author })));
    } catch (e: any) {
      setHistError(e?.message || "Impossibile caricare la cronologia, riprova.");
    }
  };

  const openThread = async (id: string, title: string) => {
    const own = owned.find(t => t.id === id);
    if (id === thread.id && own) { setView("chat"); return; }
    setHistBusy(id);
    setHistError(null);
    try {
      const res = await fetch(`/api/chat/history?threadId=${encodeURIComponent(id)}`);
      if (res.status === 404) {
        // expired on the server: drop it from the lists too
        setPublicThreads(prev => prev && prev.filter(t => t.id !== id));
        if (own) setOwned(prev => {
          const next = prev.filter(t => t.id !== id);
          saveOwned(next);
          return next;
        });
        throw new Error("Questa chat è scaduta e non è più disponibile.");
      }
      if (!res.ok) throw new Error("Impossibile caricare la chat, riprova.");
      const data = await res.json();
      if (own) {
        // continue it: rebuild the chat client on this thread with its key
        setResume({ id, messages: data.messages || [] });
        setThread({ id, key: own.key || randomId() });
        setView("chat");
      } else {
        setViewer({ id, title, messages: data.messages || [], author: data.author });
        setView("viewer");
      }
    } catch (e: any) {
      setHistError(e?.message || "Impossibile caricare la chat, riprova.");
    } finally {
      setHistBusy(null);
    }
  };

  const startNewChat = () => {
    clear();
    setThread({ id: randomId(), key: randomId() });
    setViewer(null);
    setView("chat");
  };

  // keep the newest message in view
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, open]);

  useEffect(() => {
    if (!open) return;
    setView("chat");
    setHistError(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open && view === "chat") inputRef.current?.focus();
  }, [open, view]);
  // NOTE: unlike the filter modal, body scroll stays enabled so that
  // go_to_section can scroll the page behind the chat.

  const send = (text: string) => {
    const t = text.trim();
    if (!t || isLoading) return;
    sendMessage(t);
    setInput("");
  };

  const histItem = (t: { id: string; title: string; updatedAt: number; author?: string }, isOwn: boolean) => (
    <button key={t.id} type="button"
      className={"chat-hist-item" + (t.id === thread.id && isOwn ? " cur" : "")}
      disabled={histBusy !== null || isLoading}
      onClick={() => openThread(t.id, t.title)}>
      <span className="chat-hist-title">{t.title}</span>
      <span className="chat-hist-meta">
        {histBusy === t.id ? "carico…"
          : t.id === thread.id && isOwn ? "chat aperta"
          : fmtWhen(t.updatedAt) + (histTab === "all"
              ? (isOwn ? " · tua" : ` · di ${t.author || "anonimo"} · solo lettura`)
              : "")}
      </span>
    </button>
  );

  return (
    <div className="chatdock">
      {open && (
        <div className="chatmodal" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="chatpop" role="dialog" aria-modal="true" aria-label="L'Oracolo — chat AI">
            <div className="fp-head">
              <span className="fp-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>
                L'Oracolo
              </span>
              <div className="fp-headactions">
                <button type="button" className={"fp-clear" + (messages.length || view === "viewer" ? "" : " dis")}
                  disabled={!messages.length && view !== "viewer"}
                  onClick={startNewChat}>Nuova chat</button>
                <button type="button" className={"fp-close" + (view === "history" ? " on" : "")}
                  onClick={() => { if (view === "history") setView(viewer ? "viewer" : "chat"); else showHistory(histTab); }}
                  aria-label="Cronologia chat" aria-pressed={view === "history"} title="Cronologia chat">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3.5 2"/></svg>
                </button>
                <button type="button" className="fp-close" onClick={() => setOpen(false)} aria-label="Chiudi">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            {view === "history" ? (
              <div className="chat-body" ref={bodyRef}>
                <div className="chat-sugg">
                  <button type="button" className={"fchip" + (histTab === "mine" ? " on" : "")}
                    onClick={() => showHistory("mine")}>Le mie</button>
                  <button type="button" className={"fchip" + (histTab === "all" ? " on" : "")}
                    onClick={() => showHistory("all")}>Tutte</button>
                </div>
                {histError && <div className="chat-error">{histError}</div>}
                {histTab === "mine" ? (
                  <>
                    {owned.length === 0 && (
                      <div className="chat-empty"><p>Non hai ancora chat su questo dispositivo.</p></div>
                    )}
                    {owned.map(t => histItem(t, true))}
                  </>
                ) : (
                  <>
                    {publicThreads === null && !histError && (
                      <div className="chat-msg ai"><span className="chat-dots"><i/><i/><i/></span></div>
                    )}
                    {publicThreads?.length === 0 && (
                      <div className="chat-empty"><p>Ancora nessuna chat: inizia tu la prima!</p></div>
                    )}
                    {publicThreads?.map(t => histItem(t, owned.some(o => o.id === t.id)))}
                  </>
                )}
                <div className="chat-note">
                  {histTab === "mine"
                    ? "Le chat che hai iniziato da questo dispositivo: puoi continuarle. Restano per 90 giorni."
                    : "Cronologia pubblica di tutti i visitatori (90 giorni): puoi leggerle, ma continuare solo le tue."}
                </div>
              </div>
            ) : view === "viewer" && viewer ? (
              <>
                <div className="chat-body" ref={bodyRef}>
                  {viewer.messages.map((m: any) => <Message key={m.id} message={m} />)}
                </div>
                <div className="chat-note">Chat di {viewer.author || "un altro visitatore"}, in sola lettura. Vuoi chiedere qualcosa? Apri una nuova chat.</div>
              </>
            ) : (
              <>
                <div className="chat-body" ref={bodyRef}>
                  {messages.length === 0 && (
                    <div className="chat-empty">
                      <p>Sono L'Oracolo: chiedimi qualcosa sui concerti di Gabri. Posso rispondere sui dati, cercare sul web curiosità musicali (artisti, band, tour), cambiare i filtri della pagina, portarti a una sezione o cambiare il tema.</p>
                      <div className="chat-sugg">
                        {SUGGESTIONS.map(s => (
                          <button key={s} type="button" className="fchip" onClick={() => send(s)}>{s}</button>
                        ))}
                      </div>
                      <label className="chat-name">
                        <span>Firma le tue chat (facoltativo)</span>
                        <input
                          value={name}
                          onChange={e => { setName(e.target.value); saveName(e.target.value); }}
                          placeholder="Il tuo nome"
                          maxLength={MAX_NAME}
                          aria-label="Il tuo nome (facoltativo)"
                        />
                      </label>
                    </div>
                  )}
                  {messages.map((m: any) => <Message key={m.id} message={m} />)}
                  {isLoading && <div className="chat-msg ai"><span className="chat-dots"><i/><i/><i/></span></div>}
                  {uiError && <div className="chat-error">{uiError}</div>}
                </div>
                <form className="chat-inputrow" onSubmit={e => { e.preventDefault(); send(input); }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Scrivi un messaggio…"
                    maxLength={1500}
                    aria-label="Messaggio"
                  />
                  <button type="submit" className="chat-send" disabled={!input.trim() || isLoading} aria-label="Invia">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/></svg>
                  </button>
                </form>
                <div className="chat-note">Risposte generate dall'AI: possono contenere errori. Le chat sono pubbliche: gli altri visitatori potranno leggerle{author ? ` (firmate come “${author}”)` : ""}.</div>
              </>
            )}
          </div>
        </div>
      )}
      <button
        type="button"
        className={"chatbtn" + (open ? " open" : "")}
        onClick={() => setOpen(o => !o)}
        aria-label="Apri L'Oracolo, la chat AI"
        aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>
        <span className="filterbtn-lbl">L'Oracolo</span>
      </button>
    </div>
  );
}
