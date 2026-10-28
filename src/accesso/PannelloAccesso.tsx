/* ──────────────────────────────────────────────────────────────
   Il pannello di accesso (PIANO traguardo 3): Google e, solo se il codice
   arriva davvero a chi lo chiede (Resend, o nei build e2e: flags.ts),
   "Entra con email" con un codice di 6 cifre. Lo usano la finestra della
   landing e /accedi (dove porta anche /autorizza, il consenso MCP).

   L'account nasce al primo accesso. Dopo un accesso riuscito la pagina si
   ricarica per intero verso `next` (lib/auth-client.ts). Nessun dato
   inserito qui finisce in log o URL: email e codice vanno solo a
   /api/auth con una POST.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { entraConCodice, entraConGoogle, inviaCodice } from "../lib/auth-client.ts";
import { emailVisibile, type FlagsAccesso } from "./flags.ts";

export type { FlagsAccesso };

type Fase = "scelta" | "email" | "codice";

export function PannelloAccesso({ next, flags, erroreIniziale }: { next: string; flags: FlagsAccesso; erroreIniziale?: string }) {
  const [fase, setFase] = useState<Fase>(flags.googleLogin ? "scelta" : "email");
  const [email, setEmail] = useState("");
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState<string | null>(erroreIniziale ?? null);
  const [attesa, setAttesa] = useState(false);

  const conEmail = emailVisibile(flags);
  const nessuno = !conEmail && !flags.googleLogin;

  async function google() {
    setErrore(null);
    setAttesa(true);
    const e = await entraConGoogle(next);
    // se va bene il browser è già partito verso Google
    if (e) {
      setErrore(e);
      setAttesa(false);
    }
  }

  async function chiediCodice(ev?: { preventDefault(): void }) {
    ev?.preventDefault();
    setErrore(null);
    setAttesa(true);
    const e = await inviaCodice(email);
    setAttesa(false);
    if (e) setErrore(e);
    else {
      setCodice("");
      setFase("codice");
    }
  }

  async function entra(ev?: { preventDefault(): void }) {
    ev?.preventDefault();
    setErrore(null);
    setAttesa(true);
    const e = await entraConCodice(email, codice, next);
    // se va bene la pagina si sta già ricaricando: resta "in attesa"
    if (e) {
      setErrore(e);
      setAttesa(false);
    }
  }

  return (
    <div className="acc-pannello">
      {nessuno && <p className="acc-nota">L'accesso non è disponibile su questo sito in questo momento.</p>}

      {flags.googleLogin && fase !== "codice" && (
        <button type="button" className="acc-btn acc-btn--google" onClick={google} disabled={attesa}>
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          Continua con Google
        </button>
      )}

      {conEmail && fase === "scelta" && (
        <button type="button" className="acc-btn acc-btn--ghost" onClick={() => setFase("email")}>
          Entra con email
        </button>
      )}

      {conEmail && fase === "email" && (
        <form className="acc-form" onSubmit={chiediCodice}>
          <label className="acc-campo">
            <span>Email</span>
            <input type="email" name="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} autoFocus />
          </label>
          <button type="submit" className="acc-btn" disabled={attesa || !email.trim()}>
            Mandami il codice
          </button>
        </form>
      )}

      {conEmail && fase === "codice" && (
        <form className="acc-form" onSubmit={entra}>
          <p className="acc-nota">Ti abbiamo mandato un codice di 6 cifre: vale 10 minuti.</p>
          <label className="acc-campo">
            <span>Codice</span>
            <input
              name="codice"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={codice}
              onChange={e => setCodice(e.target.value.replace(/\D/g, ""))}
              autoFocus
            />
          </label>
          <button type="submit" className="acc-btn" disabled={attesa || codice.length !== 6}>
            Entra
          </button>
          <div className="acc-righe">
            <button type="button" className="acc-link" onClick={() => setFase("email")} disabled={attesa}>
              Cambia email
            </button>
            <button type="button" className="acc-link" onClick={chiediCodice} disabled={attesa}>
              Mandami un altro codice
            </button>
          </div>
        </form>
      )}

      {errore && (
        <p className="acc-errore" role="alert">
          {errore}
        </p>
      )}
      <p className="acc-piccolo">
        <a href="/privacy">Privacy</a>
      </p>
    </div>
  );
}
