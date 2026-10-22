/* ──────────────────────────────────────────────────────────────
   Gli errori di /mcp: sempre `{code, messaggio}` (PIANO §1.25), mai il
   testo grezzo di un errore Convex o del server, che potrebbe ripetere
   argomenti (un token, un indirizzo). Un errore Convex del nostro codice
   (ConvexError con `data.code`) passa con i suoi campi, già senza valori;
   tutto il resto diventa un errore generico.
   ────────────────────────────────────────────────────────────── */

export interface ErroreMcp {
  code: string;
  messaggio: string;
  campo?: string;
  fix?: string;
  [k: string]: unknown;
}

/** I campi che un ConvexError del nostro codice può portare fuori (lib/errors.ts). */
const CAMPI = ["code", "messaggio", "campo", "fix", "righe", "concerti", "retryAfter"] as const;

const daConvex = (e: unknown): Record<string, unknown> | null => {
  const data = (e as { data?: unknown } | null)?.data;
  return data && typeof data === "object" && typeof (data as { code?: unknown }).code === "string" ? (data as Record<string, unknown>) : null;
};

export function erroreStrumento(e: unknown, origine: string): ErroreMcp {
  const data = daConvex(e);
  if (data) {
    const out: ErroreMcp = { code: String(data.code), messaggio: typeof data.messaggio === "string" ? data.messaggio : "errore" };
    for (const k of CAMPI) if (data[k] !== undefined && k !== "code" && k !== "messaggio") (out as Record<string, unknown>)[k] = data[k];
    if (typeof out.fix === "string" && out.fix.startsWith("/")) out.fix = `${origine}${out.fix}`;
    return out;
  }
  const msg = e instanceof Error ? e.message : "";
  if (/Could not find (public )?function/i.test(msg)) {
    return { code: "non_disponibile", messaggio: "operazione non ancora disponibile su questo server" };
  }
  return { code: "non_disponibile", messaggio: "errore interno: riprova più tardi" };
}

/** Una risposta HTTP di errore `{code, messaggio}` (401, 403, 405…). */
export function rispostaErrore(status: number, code: string, messaggio: string, headers: Record<string, string> = {}): Response {
  return Response.json({ code, messaggio } satisfies ErroreMcp, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
