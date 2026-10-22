/* ──────────────────────────────────────────────────────────────
   "L'Oracolo" — the AI chat widget: trigger button (lives in the
   bottom bar) plus the chat modal. Talks to /api/chat (Start server
   route, logic in src/server/oracolo/) via the TanStack AI SSE
   connection; filter/navigation/theme tool calls from the model run
   here in the browser through the `ctx` callbacks that the Shell
   provides (it owns the real filter and theme state).

   Each conversation gets its own thread id and a secret write key:
   the id is public, the key stays in this browser's localStorage and
   is sent with every message. "Nuova chat" rotates both. Every page has
   its own Oracolo and its own history (PIANO traguardo 6): the widget
   sends the page's `handle`, and each owned thread remembers the page it
   belongs to (entries saved before multi-user have none: they are
   gabrifila's).

   The history button shows two tabs, read from Convex with useQuery
   (chat.listThreads / chat.getThread: only this page's public threads,
   never keys or IPs): "Le mie" (this page's threads whose write key this
   device holds — continuable, resumed by rebuilding the chat client
   with initialMessages) and "Tutte" (every visitor's chats on this
   page, public by design — read-only viewer for the ones you don't own,
   live while you read it). A chat is shared as /<handle>?chat=<id>.

   On /<handle>/modifica the widget steps aside: there the owner's
   Oracolo is the write-mode one (src/modifica/ChatScrittura.tsx).

   SSR: localStorage is read only in effects (the modal is closed on the
   server anyway), and a shared `?chat=<id>` link is read from the
   router's search, then dropped from the URL with a router navigation;
   the thread itself is only ever fetched in the browser.
   ────────────────────────────────────────────────────────────── */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import type { ModelMessage } from "@tanstack/ai";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { createChatClientOptions } from "@tanstack/ai-client";
import { api } from "../../convex/_generated/api";
import { SECTIONS } from "../../shared/sections.ts";
import { isPlanned } from "../../shared/lib/dates.ts";
import { useProfile } from "../profile/ProfileContext.tsx";
import type { Tema } from "../theme/tema.ts";
import { logMessagesToUIMessages } from "./chatlog.ts";
import { Message, Puntini, copyText, firstUserText, fmtWhen, friendlyError, randomId } from "./parti.tsx";
import { chatToolDefs, type ChatVocab } from "./tools.ts";

export type ThemeMode = Tema;

/* Implemented by the Shell, which owns filters, the theme and the page. */
export interface ChatSiteContext {
  applyFilters(input: any): { matchCount: number; summary: string };
  clearFilters(): { matchCount: number };
  goToSection(id: string): { ok: boolean; label: string };
  setVisitorTheme(theme: ThemeMode): { ok: boolean; theme: ThemeMode };
}

/* The client half of the tools: same definitions (and enums) as the server,
   built from the profile's vocabulary, with the browser-side execution. */
function clientTools(vocab: ChatVocab) {
  const d = chatToolDefs(vocab);
  return [
    d.setFiltersDef.client<ChatSiteContext>((input, c) => {
      const r = c.context.applyFilters(input);
      return { ok: true, matchCount: r.matchCount, summary: r.summary };
    }),
    d.clearFiltersDef.client<ChatSiteContext>((_input, c) => {
      return { ok: true, matchCount: c.context.clearFilters().matchCount };
    }),
    d.goToSectionDef.client<ChatSiteContext>((input, c) => {
      return c.context.goToSection(input.section);
    }),
    d.setVisitorThemeDef.client<ChatSiteContext>((input, c) => {
      return c.context.setVisitorTheme(input.theme);
    }),
  ];
}

/* Starter questions, about this page's owner: the spending one asks about
   the latest year with concerts already seen (none yet: no year). */
function suggestions(nome: string, anno: number | null): string[] {
  return [
    `Quanto ha speso ${nome} in concerti${anno ? ` nel ${anno}` : ""}?`,
    "Chi fa parte degli Imagine Dragons?",
    "Mostra solo i concerti in programma",
    "Portami alla mappa",
  ];
}

const SECTION_LABEL: Record<string, string> = Object.fromEntries(SECTIONS.map(s => [s.id, s.label]));

/* ── Owned threads: id + secret write key + page + list metadata ──
   localStorage is the only place the write keys live; losing it means
   those chats become read-only (still visible in the "Tutte" tab).
   `handle` is the page the thread belongs to: entries written before
   multi-user don't have it and are gabrifila's. */
interface OwnedThread { id: string; key: string; handle?: string; title: string; updatedAt: number }
interface PublicThread { id: string; title: string; updatedAt: number; author?: string }
const LS_THREADS = "concerti-chat-threads";
const MAX_OWNED = 50;
const HANDLE_LEGACY = "gabrifila";
const pageOf = (t: OwnedThread) => t.handle ?? HANDLE_LEGACY;
const SCADUTA = "Questa chat è scaduta e non è più disponibile.";

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

const THEME_LABEL: Record<string, string> = { dark: "Scuro", light: "Chiaro", system: "Sistema" };

const STRUMENTI_DEL_BROWSER = new Set(["set_filters", "clear_filters", "go_to_section", "set_visitor_theme"]);

function ToolChip({ part }: { part: any }) {
  const done = part.output != null;
  let icon = "✓", text = "", hint = true;
  // uno strumento del browser non andato (o mai ripreso: il server lo chiude con {ok:false, error})
  const fallito = done && STRUMENTI_DEL_BROWSER.has(part.name) && (part.output.ok === false || typeof part.output.error === "string");
  if (fallito) {
    return (
      <div className="chat-tool done">
        <span className="chat-tool-ic" aria-hidden="true">✕</span>
        <span>Non eseguito</span>
      </div>
    );
  }
  if (part.name === "set_filters") {
    const n = Number(part.output?.matchCount);
    text = done ? (Number.isFinite(n) ? `Filtri applicati: ${n} concerti` : "Filtri applicati") : "Applico i filtri…";
  } else if (part.name === "clear_filters") {
    text = done ? "Filtri azzerati" : "Azzero i filtri…";
  } else if (part.name === "go_to_section") {
    // the Shell answers with the title the profile gives the section (bersaglioSezione)
    const label = (typeof part.output?.label === "string" && part.output.label) || SECTION_LABEL[part.input?.section] || "sezione";
    text = done ? `Pagina portata su “${label}”` : "Scorro la pagina…";
    icon = "→";
  } else if (part.name === "set_visitor_theme") {
    const label = THEME_LABEL[part.input?.theme] || part.input?.theme || "tema";
    text = done ? `Tema impostato: ${label}` : "Cambio il tema…";
    hint = false; // the new theme is already visible, chat included
  } else if (part.name === "web_search") {
    const q = typeof part.input?.query === "string" ? part.input.query : "";
    const grounded = part.output?.grounded;
    const sources: string[] = (part.output?.sources || []).filter(Boolean);
    return (
      <div className={"chat-tool chat-ws" + (done ? " done" : "")}>
        <span className={"chat-ws-ic" + (done ? "" : " live")} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </span>
        <span>{done ? (grounded === false ? "Ricerca web non disponibile" : "Cercato sul web") : "Cerco sul web…"}</span>
        {q && <span className="chat-ws-q">“{q}”</span>}
        {done && grounded === false && <span className="chat-tool-hint">Risposta dalla memoria dell'AI: potrebbe non essere aggiornata.</span>}
        {done && grounded !== false && sources.length > 0 && <span className="chat-tool-hint">Fonti: {sources.join(" · ")}</span>}
      </div>
    );
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

/* Optional imperative handle: lets the page (e.g. the Ritratto's final act)
   open the chat and, optionally, submit a starter question. */
export interface ChatApi { open(question?: string): void }

export default function ChatWidget({ ctx, apiRef, corner }: { ctx: ChatSiteContext; apiRef?: React.MutableRefObject<ChatApi | null>; corner?: boolean }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // useChat (ai-react 0.31) rebuilds its client when `threadId` changes, so
  // rotating the id is what actually starts a new thread. (The ids never
  // reach the HTML: the modal is closed on the server.)
  const [thread, setThread] = useState(() => ({ id: randomId(), key: randomId() }));
  // localStorage is read after mount, never during render (SSR)
  const [name, setName] = useState<string>("");
  const [view, setView] = useState<"chat" | "history" | "viewer">("chat");
  const [histTab, setHistTab] = useState<"mine" | "all">("mine");
  const [owned, setOwned] = useState<OwnedThread[]>([]);
  const [stored, setStored] = useState(false); // name + owned threads read from localStorage
  useEffect(() => { setName(loadName()); setOwned(loadOwned()); setStored(true); }, []);
  const { profile: { handle, displayName }, dataset, today } = useProfile();
  const tools = useMemo(() => clientTools(dataset.vocab), [dataset.vocab]);
  const starters = useMemo(() => {
    const seen = dataset.flat.filter(c => !isPlanned(c, today)).map(c => c.y);
    return suggestions(displayName, seen.length ? Math.max(...seen) : null);
  }, [dataset, today, displayName]);
  // this page's threads among the ones this device holds a key for
  const ownedHere = useMemo(() => owned.filter(t => pageOf(t) === handle), [owned, handle]);
  // transcript fetched from the server, applied only while its id is current
  const [resume, setResume] = useState<{ id: string; messages: any[] } | null>(null);
  // someone else's chat, shown read-only (live, from Convex)
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [histBusy, setHistBusy] = useState<string | null>(null);
  const [histError, setHistError] = useState<string | null>(null);

  // another page (client-side navigation between profiles): a fresh thread,
  // since a thread belongs to the page it started on
  const [threadPage, setThreadPage] = useState(handle);
  if (threadPage !== handle) {
    setThreadPage(handle);
    setThread({ id: randomId(), key: randomId() });
    setResume(null);
    setViewerId(null);
    setView("chat");
  }

  // useChat syncs forwardedProps changes onto its client, so an edited
  // name is picked up by the next message without rebuilding the thread.
  const author = name.trim();
  const chatOptions = useMemo(() => createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools,
    context: ctx,
    threadId: thread.id,
    // handle: the page whose data the Oracolo answers about (server side, per page)
    forwardedProps: { handle, writeKey: thread.key, ...(author && { author }) },
    ...(resume?.id === thread.id && { initialMessages: resume.messages }),
  }), [ctx, tools, thread, resume, author, handle]);
  const { messages, sendMessage, isLoading, error, clear } = useChat(chatOptions);
  const uiError = friendlyError(error);

  // remember this thread (its write key and its page) once it has content
  useEffect(() => {
    if (!messages.length) return;
    const title = firstUserText(messages).slice(0, 80) || "Chat";
    setOwned(prev => {
      const next = [
        { id: thread.id, key: thread.key, handle, title, updatedAt: Date.now() },
        ...prev.filter(t => t.id !== thread.id),
      ].slice(0, MAX_OWNED);
      saveOwned(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, thread]);

  /* ── History from Convex: the page's public list and the thread open in
     the viewer, both live. "skip" (not `enabled: false`) while they're not
     shown: a disabled query would still subscribe every visitor's browser. ── */
  const queryClient = useQueryClient();
  const listShown = open && view === "history" && histTab === "all";
  const list = useQuery(convexQuery(api.chat.listThreads, listShown ? { handle } : "skip"));
  // the public builders don't carry return types: the shape of chat.listThreads' `returns`
  const listed = list.data as { threadId: string; title: string; updatedAt: number; author?: string }[] | undefined;
  const publicThreads: PublicThread[] | null = listed
    ? listed.map(c => ({ id: c.threadId, title: c.title, updatedAt: c.updatedAt, author: c.author }))
    : null; // null = not loaded yet
  const listError = list.isError ? "Impossibile caricare la cronologia, riprova." : null;
  const shown = useQuery(convexQuery(api.chat.getThread, viewerId ? { handle, threadId: viewerId } : "skip"));
  const viewer = useMemo(() => shown.data
    ? { id: shown.data.threadId, author: shown.data.author, messages: logMessagesToUIMessages(shown.data.messages as ModelMessage[]) }
    : null, [shown.data]);

  const showHistory = (tab: "mine" | "all") => {
    setView("history");
    setHistTab(tab);
    setHistError(null);
  };

  const dropOwned = (id: string) => setOwned(prev => {
    const next = prev.filter(t => t.id !== id);
    saveOwned(next);
    return next;
  });

  const openThread = async (id: string) => {
    const own = ownedHere.find(t => t.id === id);
    if (id === thread.id && own) { setView("chat"); return; }
    setHistBusy(id);
    setHistError(null);
    try {
      let data;
      try {
        data = await queryClient.fetchQuery(convexQuery(api.chat.getThread, { handle, threadId: id }));
      } catch {
        throw new Error("Impossibile caricare la chat, riprova.");
      }
      if (!data) {
        // expired on the server (or not this page's): drop it from this device too
        if (own) dropOwned(id);
        throw new Error(SCADUTA);
      }
      if (own) {
        // continue it: rebuild the chat client on this thread with its key
        setResume({ id, messages: logMessagesToUIMessages(data.messages as ModelMessage[]) });
        setThread({ id, key: own.key || randomId() });
        setViewerId(null);
        setView("chat");
      } else {
        setViewerId(id);
        setView("viewer");
      }
    } catch (e: any) {
      setHistError(e?.message || "Impossibile caricare la chat, riprova.");
    } finally {
      setHistBusy(null);
    }
  };

  /* ── Share: a chat is shareable via /<handle>?chat=<threadId> because
     reading any public thread of the page is already public (Convex). ── */
  const shareId = view === "viewer" && viewerId ? viewerId : view === "chat" && messages.length ? thread.id : null;
  const [shared, setShared] = useState(false);
  const shareTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(shareTimer.current), []);
  const shareChat = async () => {
    if (!shareId) return;
    const url = `${location.origin}/${handle}?chat=${encodeURIComponent(shareId)}`;
    const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer:coarse)").matches;
    if (touch && navigator.share) {
      try { await navigator.share({ title: `L'Oracolo: concerti di ${displayName}`, url }); } catch { /* user closed the share sheet */ }
      return;
    }
    await copyText(url);
    setShared(true);
    window.clearTimeout(shareTimer.current);
    shareTimer.current = window.setTimeout(() => setShared(false), 1500);
  };

  // on /<handle>/modifica the owner's Oracolo is the write-mode one
  const pathname = useRouterState({ select: s => s.location.pathname });
  const hidden = /\/modifica\/?$/.test(pathname);

  // opening from the button or the page always starts from the chat view
  const openChat = () => {
    setView("chat");
    setHistError(null);
    setOpen(true);
  };

  // opened via a shared link? load that thread (owned → continue, else viewer),
  // then drop ?chat from the URL through the router (keeping the rest)
  const navigate = useNavigate();
  const sharedChat = useRouterState({ select: s => (s.location.search as Record<string, unknown>).chat });
  useEffect(() => {
    const id = typeof sharedChat === "string" || typeof sharedChat === "number" ? String(sharedChat) : "";
    if (!id || !stored || hidden) return; // wait for the owned threads: an owned link resumes the chat
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => { const { chat: _drop, ...rest } = prev; return rest; },
      hash: (h: string) => h,
      replace: true,
    } as any);
    setOpen(true);
    void openThread(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedChat, stored]);

  const startNewChat = () => {
    clear();
    setThread({ id: randomId(), key: randomId() });
    setViewerId(null);
    setHistError(null);
    setView("chat");
  };

  // keep the newest message in view
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, open]);

  useEffect(() => {
    if (!open) return;
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
    setHistError(null);
  };

  // Expose an imperative opener to the page. Re-run every render so the
  // captured `send`/`sendMessage` closures stay fresh.
  useEffect(() => {
    if (!apiRef) return;
    if (hidden) { apiRef.current = null; return; }
    apiRef.current = {
      open: (question?: string) => {
        openChat();
        if (question && !isLoading) sendMessage(question);
      },
    };
    return () => { if (apiRef) apiRef.current = null; };
  });

  // grow the textarea with its content (capped in CSS via max-height)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input, view, open]);

  const histItem = (t: { id: string; title: string; updatedAt: number; author?: string }, isOwn: boolean) => (
    <button key={t.id} type="button"
      className={"chat-hist-item" + (t.id === thread.id && isOwn ? " cur" : "")}
      disabled={histBusy !== null || isLoading}
      onClick={() => openThread(t.id)}>
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

  if (hidden) return null;
  const historyError = histError ?? (histTab === "all" ? listError : null);
  return (
    <div className={"chatdock" + (corner ? " chatdock--corner" : "")}>
      {open && (
        <div className="chatmodal" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="chatpop" role="dialog" aria-modal="true" aria-label="L'Oracolo, chat AI">
            <div className="fp-head">
              <span className="fp-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>
                L'Oracolo
              </span>
              <div className="fp-headactions">
                <button type="button" className={"fp-clear" + (messages.length || view === "viewer" ? "" : " dis")}
                  disabled={!messages.length && view !== "viewer"}
                  onClick={startNewChat}>Nuova chat</button>
                {shareId && (
                  <button type="button" className={"fp-close fp-share" + (shared ? " ok" : "")} onClick={shareChat}
                    aria-label={shared ? "Link copiato" : "Condividi chat: copia il link"}
                    title={shared ? "Link copiato!" : "Condividi chat (copia il link)"}>
                    {shared
                      ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 3.98M15.4 6.5l-6.8 3.98"/></svg>}
                  </button>
                )}
                <button type="button" className={"fp-close" + (view === "history" ? " on" : "")}
                  onClick={() => { if (view === "history") setView(viewerId ? "viewer" : "chat"); else showHistory(histTab); }}
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
                {historyError && <div className="chat-error">{historyError}</div>}
                {histTab === "mine" ? (
                  <>
                    {ownedHere.length === 0 && (
                      <div className="chat-empty"><p>Non hai ancora chat su questo dispositivo.</p></div>
                    )}
                    {ownedHere.map(t => histItem(t, true))}
                  </>
                ) : (
                  <>
                    {publicThreads === null && !historyError && <Puntini />}
                    {publicThreads?.length === 0 && (
                      <div className="chat-empty"><p>Ancora nessuna chat: inizia tu la prima!</p></div>
                    )}
                    {publicThreads?.map(t => histItem(t, ownedHere.some(o => o.id === t.id)))}
                  </>
                )}
                <div className="chat-note">
                  {histTab === "mine"
                    ? "Le chat che hai iniziato su questa pagina da questo dispositivo: puoi continuarle. Restano per 90 giorni."
                    : "Cronologia pubblica di questa pagina, di tutti i visitatori (90 giorni): puoi leggerle, ma continuare solo le tue."}
                </div>
              </div>
            ) : view === "viewer" && viewerId ? (
              <>
                <div className="chat-body" ref={bodyRef}>
                  {shown.isPending && <Puntini />}
                  {shown.data === null && <div className="chat-error">{SCADUTA}</div>}
                  {viewer?.messages.map((m: any) => <Message key={m.id} message={m} Strumento={ToolChip} />)}
                </div>
                <div className="chat-note">Chat di {viewer?.author || "un altro visitatore"}, in sola lettura. Vuoi chiedere qualcosa? Apri una nuova chat.</div>
              </>
            ) : (
              <>
                <div className="chat-body" ref={bodyRef}>
                  {messages.length === 0 && histBusy && <Puntini />}
                  {messages.length === 0 && histError && <div className="chat-error">{histError}</div>}
                  {messages.length === 0 && !histBusy && (
                    <div className="chat-empty">
                      <p>Sono L'Oracolo: chiedimi qualcosa sui concerti di {displayName}. Posso rispondere sui dati, cercare sul web curiosità musicali (artisti, band, tour), cambiare i filtri della pagina, portarti a una sezione o cambiare il tema.</p>
                      <div className="chat-sugg">
                        {starters.map(s => (
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
                  {messages.map((m: any) => <Message key={m.id} message={m} Strumento={ToolChip} />)}
                  {isLoading && <Puntini />}
                  {uiError && <div className="chat-error">{uiError}</div>}
                </div>
                <form className="chat-inputrow" onSubmit={e => { e.preventDefault(); send(input); }}>
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Scrivi un messaggio…"
                    maxLength={1500}
                    rows={1}
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
        onClick={() => (open ? setOpen(false) : openChat())}
        aria-label="Apri L'Oracolo, la chat AI"
        aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>
        <span className="filterbtn-lbl">L'Oracolo</span>
      </button>
    </div>
  );
}
