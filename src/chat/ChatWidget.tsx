/* ──────────────────────────────────────────────────────────────
   AI chat widget: trigger button (lives in the bottom bar) plus
   the chat modal. Talks to /api/chat (Netlify function) via the
   TanStack AI SSE connection; filter/navigation tool calls from
   the model run here in the browser through the `ctx` callbacks
   that App provides (they own the real filter state).
   Each conversation gets its own thread id (the server keys the
   Redis transcript log on it, see netlify/functions/chat.mts);
   "Nuova chat" rotates the id so a fresh conversation never
   overwrites the previous one's log. In the browser chats stay
   ephemeral: nothing is restored on reload.
   ────────────────────────────────────────────────────────────── */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";
import { createChatClientOptions } from "@tanstack/ai-client";
import { setFiltersDef, clearFiltersDef, goToSectionDef, SECTIONS } from "./tools.ts";

/* Implemented by App, which owns filters and the page. */
export interface ChatSiteContext {
  applyFilters(input: any): { matchCount: number; summary: string };
  clearFilters(): { matchCount: number };
  goToSection(id: string): { ok: boolean; label: string };
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

const SUGGESTIONS = [
  "Quanto ha speso Gabri in concerti nel 2025?",
  "Mostra solo i concerti in programma",
  "Portami alla mappa",
];

const SECTION_LABEL = Object.fromEntries(SECTIONS.map(s => [s.id, s.label]));

// randomUUID needs a secure context (https/localhost); fall back to the
// same shape TanStack generates so the server-side key stays valid.
const newChatId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function friendlyError(err: Error | undefined): string | null {
  if (!err) return null;
  const m = err.message || "";
  if (/429|Troppi|[Ll]imite/.test(m)) return "Hai raggiunto il limite di messaggi. Riprova più tardi.";
  if (/troppo lung/i.test(m)) return "Conversazione troppo lunga: apri una nuova chat.";
  return "Qualcosa è andato storto. Riprova, o apri una nuova chat.";
}

function ToolChip({ part }: { part: any }) {
  const done = part.output != null;
  let icon = "✓", text = "";
  if (part.name === "set_filters") {
    text = done ? `Filtri applicati — ${part.output.matchCount} concerti` : "Applico i filtri…";
  } else if (part.name === "clear_filters") {
    text = done ? "Filtri azzerati" : "Azzero i filtri…";
  } else if (part.name === "go_to_section") {
    const label = SECTION_LABEL[part.input?.section] || "sezione";
    text = done ? `Pagina portata su “${label}”` : "Scorro la pagina…";
    icon = "→";
  } else {
    return null;
  }
  return (
    <div className={"chat-tool" + (done ? " done" : "")}>
      <span className="chat-tool-ic" aria-hidden="true">{done ? icon : "…"}</span>
      <span>{text}</span>
      {done && <span className="chat-tool-hint">Chiudi la chat per vedere la pagina.</span>}
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
  const [chatId, setChatId] = useState(newChatId);
  const chatOptions = useMemo(() => createChatClientOptions({
    connection: fetchServerSentEvents("/api/chat"),
    tools: [setFiltersTool, clearFiltersTool, goToSectionTool],
    context: ctx,
    id: chatId,
    threadId: chatId,
  }), [ctx, chatId]);
  const { messages, sendMessage, isLoading, error, clear } = useChat(chatOptions);
  const uiError = friendlyError(error);

  // keep the newest message in view
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading, open]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  // NOTE: unlike the filter modal, body scroll stays enabled so that
  // go_to_section can scroll the page behind the chat.

  const send = (text: string) => {
    const t = text.trim();
    if (!t || isLoading) return;
    sendMessage(t);
    setInput("");
  };

  return (
    <div className="chatdock">
      {open && (
        <div className="chatmodal" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="chatpop" role="dialog" aria-modal="true" aria-label="Chat AI">
            <div className="fp-head">
              <span className="fp-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></svg>
                Chat AI
              </span>
              <div className="fp-headactions">
                <button type="button" className={"fp-clear" + (messages.length ? "" : " dis")} disabled={!messages.length}
                  onClick={() => { clear(); setChatId(newChatId()); }}>Nuova chat</button>
                <button type="button" className="fp-close" onClick={() => setOpen(false)} aria-label="Chiudi">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div className="chat-body" ref={bodyRef}>
              {messages.length === 0 && (
                <div className="chat-empty">
                  <p>Chiedimi qualcosa sui concerti di Gabri: posso rispondere sui dati, cambiare i filtri della pagina o portarti a una sezione.</p>
                  <div className="chat-sugg">
                    {SUGGESTIONS.map(s => (
                      <button key={s} type="button" className="fchip" onClick={() => send(s)}>{s}</button>
                    ))}
                  </div>
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
            <div className="chat-note">Risposte generate dall'AI: possono contenere errori.</div>
          </div>
        </div>
      )}
      <button
        type="button"
        className={"chatbtn" + (open ? " open" : "")}
        onClick={() => setOpen(o => !o)}
        aria-label="Apri la chat AI"
        aria-expanded={open}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>
        <span className="filterbtn-lbl">Chat</span>
      </button>
    </div>
  );
}
