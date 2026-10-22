import { useEffect, useState } from "react";
import { createFileRoute, useHydrated } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { Errore, erroreDi, useDatiProprietario, type ErroreUi } from "../import/comuni.tsx";

/* ──────────────────────────────────────────────────────────────
   /autorizza: il consenso MCP (PIANO traguardo 7, §1.29). Better Auth
   (mcp() con prompt=consent sempre forzato) ci manda qui con
   `consent_code`, `client_id` e `scope`.

   - L'host del redirect_uri, cioè dove finirà il codice, è la cosa più in
     vista: il nome del client lo sceglie chi l'ha registrato (DCR aperta)
     e non vale come garanzia. Lo dice agents.consenso, solo al
     proprietario che ha avviato la richiesta.
   - Non si incornicia: X-Frame-Options DENY e frame-ancestors 'none' (in
     più a vercel.json, che vale solo su Vercel); dentro un frame la pagina
     non mostra nemmeno i bottoni.
   - Il consenso è un POST a /api/auth/oauth2/consent (Better Auth, con la
     sessione); la risposta dice dove mandare il browser. Il POST consuma la
     richiesta, quindi da lì la query di agents.consenso risponde not_found:
     dopo la scelta conta solo quello che si era già letto, e la pagina dice
     "fatto" (un'app con uno schema proprio, es. cursor://, lascia il
     browser qui).
   ────────────────────────────────────────────────────────────── */

const CODICE_RE = /^[A-Za-z0-9]{32}$/;

export const Route = createFileRoute("/autorizza")({
  validateSearch: (s: Record<string, unknown>) => ({
    consent_code: typeof s.consent_code === "string" ? s.consent_code : undefined,
  }),
  headers: () => ({
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
    // l'URL contiene il consent_code: non va a nessun altro sito
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
  }),
  head: () => ({
    meta: [{ title: "Collega un agente · Concerti" }, { name: "robots", content: "noindex" }],
  }),
  component: Autorizza,
});

function Autorizza() {
  const idratata = useHydrated();
  const { consent_code } = Route.useSearch();
  let corpo;
  if (!idratata) corpo = <p className="ag-attesa" aria-busy="true">Carico…</p>;
  else if (window.top !== window.self) corpo = <p className="ag-errore">Questa pagina non si apre dentro un'altra: aprila da sola.</p>;
  else if (!consent_code || !CODICE_RE.test(consent_code)) corpo = <Richiesta stato="non_valida" />;
  else corpo = <Consenso codice={consent_code} />;
  return (
    <main className="ag-pagina">
      <div className="ag-carta">
        <p className="ag-sopra">Concerti · collega un agente</p>
        {corpo}
      </div>
    </main>
  );
}

function Richiesta({ stato }: { stato: "non_valida" | "entra" | "profilo" }) {
  if (stato === "entra") {
    const qui = window.location.pathname + window.location.search;
    return (
      <>
        <h1>Entra per continuare</h1>
        <p>Per collegare un agente alla tua pagina devi aver fatto l'accesso.</p>
        <a className="ag-btn ag-primario" href={`/accedi?next=${encodeURIComponent(qui)}`}>
          Entra
        </a>
      </>
    );
  }
  if (stato === "profilo") {
    return (
      <>
        <h1>Prima crea la tua pagina</h1>
        <p>Un agente può scrivere solo su una pagina che esiste: completa il primo passo, poi ricollega l'agente.</p>
        <a className="ag-btn ag-primario" href="/benvenuto">
          Crea la tua pagina
        </a>
      </>
    );
  }
  return (
    <>
      <h1>Richiesta non valida</h1>
      <p>Il collegamento è scaduto, è già stato usato o non viene da qui. Ricomincia dall'app che vuoi collegare.</p>
    </>
  );
}

type DatiConsenso = FunctionReturnType<typeof api.agents.consenso>;

/** Dopo Consenti/Rifiuta: il browser sta tornando all'app (o resta qui, se l'app ha uno schema proprio). */
function Fatto({ consentito, cliente, handle }: { consentito: boolean; cliente?: string; handle: string | null }) {
  if (!consentito) {
    return (
      <>
        <h1>Richiesta rifiutata</h1>
        <p role="status">L'app non ha ricevuto nessun accesso. Puoi chiudere questa pagina.</p>
      </>
    );
  }
  return (
    <>
      <h1>Fatto</h1>
      <p role="status">
        Hai consentito l'accesso{cliente ? <> a «{cliente}»</> : null}: torna all'app, che finisce il collegamento da sola. Se non si
        apre, puoi chiudere questa pagina.
      </p>
      <p className="ag-hint">
        La scolleghi quando vuoi da {handle ? <a href={`/${handle}/modifica#agenti`}>#agenti</a> : "#agenti"}.
      </p>
    </>
  );
}

function Consenso({ codice }: { codice: string }) {
  const q = useDatiProprietario(api.agents.consenso, { consentCode: codice });
  // la richiesta letta l'ultima volta: dopo Consenti/Rifiuta la query risponde not_found
  const [letta, setLetta] = useState<DatiConsenso | null>(null);
  const [inCorso, setInCorso] = useState<"si" | "no" | null>(null);
  const [fatto, setFatto] = useState<"si" | "no" | null>(null);
  const [errore, setErrore] = useState<ErroreUi | null>(null);
  useEffect(() => {
    if (q.data) setLetta(q.data);
  }, [q.data]);
  const decisa = inCorso !== null || fatto !== null;

  if (fatto) return <Fatto consentito={fatto === "si"} cliente={letta?.cliente} handle={letta?.handle ?? null} />;
  if (q.error && !decisa) {
    const e = erroreDi(q.error);
    if (e.code === "unauthorized") return <Richiesta stato="entra" />;
    if (e.code === "no_profile") return <Richiesta stato="profilo" />;
    if (e.code === "not_found" || e.code === "input_non_valido") return <Richiesta stato="non_valida" />;
    return <Errore errore={e} />;
  }
  const r = q.data ?? letta;
  if (!r) return <p className="ag-attesa" aria-busy="true">Carico…</p>;

  async function rispondi(accept: boolean) {
    setInCorso(accept ? "si" : "no");
    setErrore(null);
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ accept, consent_code: codice }),
      });
      const dati = (await res.json().catch(() => null)) as { redirectURI?: unknown } | null;
      if (!res.ok || typeof dati?.redirectURI !== "string") throw new Error("consenso");
      setFatto(accept ? "si" : "no");
      setInCorso(null);
      window.location.assign(dati.redirectURI);
    } catch {
      setErrore({ code: "errore", messaggio: "non è andata: la richiesta potrebbe essere scaduta, ricomincia dall'app che vuoi collegare" });
      setInCorso(null);
    }
  }

  return (
    <>
      <h1>Consentire l'accesso alla tua pagina?</h1>
      <p>
        Un'app che si presenta come <b>«{r.cliente}»</b> chiede di leggere e modificare i dati della tua pagina di concerti.
      </p>
      <div className="ag-host">
        <span className="ag-mini">Se consenti, il browser torna a</span>
        <strong className="ag-host-nome" data-testid="host-redirect">{r.host}</strong>
        {r.tipo === "locale" ? (
          <span className="ag-hint">cioè un programma su questo computer, come Claude Code.</span>
        ) : r.tipo === "app" ? (
          <span className="ag-hint">cioè un'app installata su questo dispositivo, che si apre con questo indirizzo.</span>
        ) : r.tipo === "http" ? (
          <span className="ag-attenzione">Attenzione: collegamento non cifrato (http).</span>
        ) : null}
      </div>
      <p className="ag-hint">
        Il nome lo sceglie l'app stessa: fidati dell'indirizzo qui sopra. Se non hai appena collegato tu un agente, o
        l'indirizzo non è quello che ti aspetti, rifiuta.
      </p>
      <ul className="ag-istruzioni">
        <li>
          <b>Potrà</b> leggere e scrivere concerti, persone, partenze (solo i nomi), "regalato da", wishlist e stile, e annullare
          le modifiche dal registro.
        </li>
        <li>
          <b>Non potrà</b> vedere la tua email né gli indirizzi delle partenze, esportare o eliminare l'account, né creare altre
          chiavi.
        </li>
        <li>
          La scolleghi quando vuoi da{" "}
          {r.handle ? <a href={`/${r.handle}/modifica#agenti`}>#agenti</a> : "#agenti"}.
        </li>
      </ul>
      <div className="ag-riga">
        <button type="button" className="ag-btn ag-primario" onClick={() => rispondi(true)} disabled={!!inCorso}>
          {inCorso === "si" ? "Un attimo…" : "Consenti"}
        </button>
        <button type="button" className="ag-btn" onClick={() => rispondi(false)} disabled={!!inCorso}>
          {inCorso === "no" ? "Un attimo…" : "Rifiuta"}
        </button>
      </div>
      <Errore errore={errore} />
    </>
  );
}
