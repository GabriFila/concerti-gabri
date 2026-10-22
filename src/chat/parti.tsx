/* ──────────────────────────────────────────────────────────────
   I pezzi comuni delle due chat dell'Oracolo: quella pubblica di ogni
   pagina (ChatWidget) e quella in scrittura del proprietario in
   /<handle>/modifica (src/modifica/ChatScrittura.tsx). Messaggi, copia,
   date brevi ed errori leggibili; gli strumenti li disegna ciascuna chat
   a modo suo (`Strumento`).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState, type ComponentType } from "react";

/** Il <crypto.randomUUID> se c'è (serve un contesto sicuro), altrimenti la stessa forma di TanStack. */
export const randomId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `thread-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const fmtWhen = (ts: number) => {
  const d = new Date(ts);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
};

export const firstUserText = (messages: readonly any[]): string => {
  const m = messages.find((x: any) => x.role === "user");
  return (m?.parts || [])
    .filter((p: any) => p.type === "text" && p.content)
    .map((p: any) => p.content)
    .join(" ")
    .trim();
};

/** Gli errori della route in italiano: i testi riconosciuti restano quelli di sempre. */
export function friendlyError(err: Error | undefined): string | null {
  if (!err) return null;
  const m = err.message || "";
  if (/403|appartiene/.test(m)) return "Questa chat appartiene a un altro visitatore: puoi solo leggerla.";
  if (/429|Troppi|[Ll]imite/.test(m)) return "Hai raggiunto il limite di messaggi. Riprova più tardi.";
  if (/troppo lung/i.test(m)) return "Conversazione troppo lunga: apri una nuova chat.";
  return "Qualcosa è andato storto. Riprova, o apri una nuova chat.";
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard API needs a secure context; fall back to execCommand
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } finally { ta.remove(); }
  }
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    await copyText(text);
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button type="button" className={"chat-copy" + (copied ? " ok" : "")}
      onClick={copy} aria-label={copied ? "Copiato" : "Copia messaggio"} title="Copia messaggio">
      {copied
        ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>}
    </button>
  );
}

/** Un messaggio: testo, strumenti (disegnati da `Strumento`) e il bottone per copiarlo. */
export function Message({ message, Strumento }: { message: any; Strumento: ComponentType<{ part: any }> }) {
  const isUser = message.role === "user";
  const parts = (message.parts || []).map((part: any, i: number) => {
    if (part.type === "text" && part.content) return <p key={i}>{part.content}</p>;
    if (part.type === "tool-call") return <Strumento key={i} part={part} />;
    return null;
  }).filter(Boolean);
  if (parts.length === 0) return null;
  const text = (message.parts || [])
    .filter((p: any) => p.type === "text" && p.content)
    .map((p: any) => p.content)
    .join("\n\n")
    .trim();
  return (
    <div className={"chat-row " + (isUser ? "user" : "ai")}>
      <div className={"chat-msg " + (isUser ? "user" : "ai")}>{parts}</div>
      {text && <CopyBtn text={text} />}
    </div>
  );
}

/** I tre puntini mentre l'Oracolo pensa. */
export const Puntini = () => <div className="chat-msg ai"><span className="chat-dots"><i/><i/><i/></span></div>;
