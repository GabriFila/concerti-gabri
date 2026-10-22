/* ──────────────────────────────────────────────────────────────
   Il pannello di accesso (PIANO traguardo 3): Google e, se il deployment
   ha un sender (authFlags.emailLogin), "Entra con email" con un codice
   di 6 cifre. Lo usano la finestra della landing e /accedi.

   L'account nasce al primo accesso. Dopo un accesso riuscito la pagina si
   ricarica per intero verso `next` (lib/auth-client.ts). Nessun dato
   inserito qui finisce in log o URL: email e codice vanno solo a
   /api/auth con una POST.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { entraConCodice, entraConGoogle, inviaCodice } from "../lib/auth-client.ts";

export interface FlagsAccesso {
  emailLogin: boolean;
  googleLogin: boolean;
}

type Fase = "scelta" | "email" | "codice";

export function PannelloAccesso({ next, flags, erroreIniziale }: { next: string; flags: FlagsAccesso; erroreIniziale?: string }) {
  const [fase, setFase] = useState<Fase>(flags.googleLogin ? "scelta" : "email");
  const [email, setEmail] = useState("");
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState<string | null>(erroreIniziale ?? null);
  const [attesa, setAttesa] = useState(false);

  const nessuno = !flags.emailLogin && !flags.googleLogin;

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
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
          </svg>
          Continua con Google
        </button>
      )}

      {flags.emailLogin && fase === "scelta" && (
        <button type="button" className="acc-btn acc-btn--ghost" onClick={() => setFase("email")}>
          Entra con email
        </button>
      )}

      {flags.emailLogin && fase === "email" && (
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

      {flags.emailLogin && fase === "codice" && (
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
        Se è la prima volta, la tua pagina nasce adesso. <a href="/privacy">Privacy</a>
      </p>
    </div>
  );
}
