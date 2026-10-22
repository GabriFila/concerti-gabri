/* ──────────────────────────────────────────────────────────────
   #agenti (corsia 7): collegare un agente AI alla propria pagina.
   - L'indirizzo del server MCP e come collegarlo: Claude, ChatGPT,
     Claude Code (`claude mcp add --transport http …`) e, per script e
     client senza OAuth, una API key nell'header `x-api-key`.
   - Il prompt da dare all'agente (shared/agentPrompt.ts, corsia 3).
   - Le API key: la chiave si vede UNA volta sola, alla creazione (nel
     database c'è solo il suo SHA-256); poi resta elencata e revocabile.
   - Le app collegate con OAuth: scollegarle cancella subito i token.
   - L'import da CSV/JSON (src/import/ImportUpload.tsx).
   Tutto solo dopo l'idratazione e con la sessione: un token agente non
   vede né crea chiavi (agents.* sono dashboardOnly).
   ────────────────────────────────────────────────────────────── */

import { useState, type FormEvent } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { agentPrompt } from "../../../shared/agentPrompt.ts";
import { ImportUpload } from "../../import/ImportUpload.tsx";
import { Copia, Errore, erroreDi, useConvexProprietario, useDatiProprietario, useOrigine, type ErroreUi } from "../../import/comuni.tsx";
import type { SezioneProps } from "../tipi.ts";

type Elenco = FunctionReturnType<typeof api.agents.list>;
type Chiave = Elenco["chiavi"][number];
type Client = Elenco["client"][number];

const data = (ms: number) => new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" }).format(ms);

const SCADENZE = [
  { giorni: 0, etichetta: "Mai" },
  { giorni: 30, etichetta: "Tra 30 giorni" },
  { giorni: 90, etichetta: "Tra 90 giorni" },
  { giorni: 365, etichetta: "Tra un anno" },
];

export function SezioneAgenti({ handle }: SezioneProps) {
  const idratata = useHydrated();
  return (
    <div className="ag-sezione">
      {idratata ? <Contenuto handle={handle} /> : <p className="ag-attesa" aria-busy="true">Carico…</p>}
    </div>
  );
}

function Contenuto({ handle }: { handle: string }) {
  const origine = useOrigine();
  const mcp = `${origine}/mcp`;
  return (
    <>
      <p className="ag-hint">
        Un agente AI (Claude, ChatGPT, Claude Code…) può leggere le email dei biglietti e il calendario e scrivere i concerti
        qui, con gli stessi strumenti della dashboard. Non vede mai gli indirizzi delle partenze e non può esportare né
        eliminare l'account. Quello che scrive compare in #attivita e si annulla da lì.
      </p>

      <div className="ag-blocco">
        <p className="ag-etichetta">Indirizzo del server MCP</p>
        <div className="ag-riga">
          <code className="ag-codice" data-testid="mcp-url">{mcp}</code>
          <Copia testo={mcp} nome="indirizzo del server MCP" />
        </div>
      </div>

      <div className="ag-blocco">
        <p className="ag-etichetta">Come collegarlo</p>
        <ul className="ag-istruzioni">
          <li>
            <b>Claude</b> (sito e app): Impostazioni → Connettori → Aggiungi connettore personalizzato, incolla l'indirizzo e
            premi Connetti. Si apre questo sito: entra e consenti l'accesso.
          </li>
          <li>
            <b>ChatGPT</b>: Impostazioni → App e connettori → Avanzate, attiva la modalità sviluppatore, poi crea un connettore
            con l'indirizzo e autenticazione OAuth (serve un piano che lo permetta).
          </li>
          <li>
            <b>Claude Code</b>: <code className="ag-codice">claude mcp add --transport http concerti {mcp}</code>, poi{" "}
            <code className="ag-codice">/mcp</code> dentro Claude Code per entrare e consentire l'accesso.
          </li>
          <li>
            <b>Con una API key</b> (script e client senza OAuth): creala qui sotto e mandala nell'header{" "}
            <code className="ag-codice">x-api-key</code>, per esempio{" "}
            <code className="ag-codice">claude mcp add --transport http concerti {mcp} --header "x-api-key: cgk_…"</code>.
          </li>
        </ul>
      </div>

      <Prompt handle={handle} origine={origine} />
      <ChiaviApi />
      <AppCollegate />

      <div className="ag-blocco">
        <p className="ag-etichetta">Importa da un file</p>
        <p className="ag-hint">
          Senza MCP, lo stesso prompt fa preparare all'agente un CSV (o un JSON): caricalo qui. Prima vedi l'anteprima, poi
          confermi; l'import si annulla in blocco.
        </p>
        <ImportUpload contesto="agenti" />
      </div>
    </>
  );
}

function Prompt({ handle, origine }: { handle: string; origine: string }) {
  const profilo = useDatiProprietario(api.profiles.get);
  const partenze = useDatiProprietario(api.departures.list);
  const p = profilo.data;
  const prompt = p
    ? agentPrompt({
        origin: origine,
        handle: p.handle ?? handle,
        forma: p.forma ?? "n",
        displayName: p.displayName,
        partenze: (partenze.data?.departures ?? []).map(d => d.name),
      })
    : "";
  return (
    <div className="ag-blocco">
      <div className="ag-riga ag-riga-spazio">
        <p className="ag-etichetta">Il prompt da dare all'agente</p>
        <Copia testo={prompt} etichetta="Copia il prompt" />
      </div>
      {profilo.error ? (
        <Errore errore={erroreDi(profilo.error)} />
      ) : (
        <textarea className="ag-prompt" readOnly rows={10} value={prompt || "Carico…"} aria-label="Prompt per l'agente" />
      )}
    </div>
  );
}

/* ── API key ─────────────────────────────────────────────────── */

function ChiaviApi() {
  const q = useDatiProprietario(api.agents.list);
  const convex = useConvexProprietario();
  const [nome, setNome] = useState("");
  const [giorni, setGiorni] = useState(0);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<ErroreUi | null>(null);
  const [nuova, setNuova] = useState<{ nome: string; chiave: string } | null>(null);

  async function crea(e: FormEvent) {
    e.preventDefault();
    setInCorso(true);
    setErrore(null);
    try {
      const r = await convex.mutation(api.agents.createApiKey, { nome: nome.trim(), ...(giorni ? { scadenzaGiorni: giorni } : {}) });
      setNuova({ nome: nome.trim(), chiave: r.chiave });
      setNome("");
    } catch (err) {
      setErrore(erroreDi(err));
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="ag-blocco" role="group" aria-label="API key">
      <p className="ag-etichetta">API key</p>
      {nuova ? (
        <div className="ag-nuova" role="status">
          <p>
            La tua nuova API key «{nuova.nome}». <b>Copiala adesso: non la vedrai più</b> (qui ne resta solo un'impronta).
          </p>
          <div className="ag-riga">
            <code className="ag-codice ag-chiave" data-testid="nuova-chiave">{nuova.chiave}</code>
            <Copia testo={nuova.chiave} nome="API key" />
          </div>
          <button type="button" className="ag-btn" onClick={() => setNuova(null)}>
            Fatto, l'ho copiata
          </button>
        </div>
      ) : (
        <form className="ag-riga ag-form" onSubmit={crea}>
          <label className="ag-campo">
            <span className="ag-mini">Nome</span>
            <input value={nome} onChange={e => setNome(e.target.value)} maxLength={32} required placeholder="es. Script di casa" />
          </label>
          <label className="ag-campo ag-campo-stretto">
            <span className="ag-mini">Scade</span>
            <select value={giorni} onChange={e => setGiorni(Number(e.target.value))}>
              {SCADENZE.map(s => (
                <option key={s.giorni} value={s.giorni}>
                  {s.etichetta}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="ag-btn ag-primario" disabled={inCorso || !nome.trim()}>
            {inCorso ? "Creo…" : "Crea API key"}
          </button>
        </form>
      )}
      <Errore errore={errore} />
      {q.error ? (
        <Errore errore={erroreDi(q.error)} />
      ) : !q.data ? (
        <p className="ag-attesa" aria-busy="true">Carico…</p>
      ) : q.data.chiavi.length === 0 ? (
        <p className="ag-vuoto">Nessuna API key.</p>
      ) : (
        <ul className="ag-lista" aria-label="Elenco delle API key">
          {q.data.chiavi.map(k => <RigaChiave key={k.id} k={k} />)}
        </ul>
      )}
    </div>
  );
}

/** Una riga con l'azione distruttiva confermata sul posto. */
function useRevoca(f: () => Promise<unknown>) {
  const [conferma, setConferma] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<ErroreUi | null>(null);
  const esegui = async () => {
    setInCorso(true);
    setErrore(null);
    try {
      // a buon fine la riga sparisce da sola (la query è sottoscritta)
      await f();
    } catch (e) {
      setErrore(erroreDi(e));
      setInCorso(false);
    }
  };
  return { conferma, setConferma, inCorso, errore, esegui };
}

function Azione({ r, verbo, avviso, nome }: { r: ReturnType<typeof useRevoca>; verbo: string; avviso: string; nome: string }) {
  if (!r.conferma) {
    return (
      <button type="button" className="ag-btn ag-pericolo-lieve" onClick={() => r.setConferma(true)} aria-label={`${verbo} ${nome}`}>
        {verbo}
      </button>
    );
  }
  return (
    <>
      <span className="ag-meta">{avviso}</span>
      <button type="button" className="ag-btn ag-pericolo" onClick={r.esegui} disabled={r.inCorso}>
        {r.inCorso ? "Un attimo…" : `Sì, ${verbo.toLowerCase()}`}
      </button>
      <button type="button" className="ag-btn" onClick={() => r.setConferma(false)} disabled={r.inCorso}>
        No
      </button>
    </>
  );
}

function RigaChiave({ k }: { k: Chiave }) {
  const convex = useConvexProprietario();
  const r = useRevoca(() => convex.mutation(api.agents.revokeApiKey, { id: k.id }));
  return (
    <li className="ag-voce">
      <span className="ag-nome">{k.nome}</span>
      {k.inizio && <code className="ag-codice ag-inizio">{k.inizio}…</code>}
      <span className="ag-meta">
        creata il {data(k.creata)}
        {k.scade ? ` · ${k.attiva ? "scade" : "scaduta"} il ${data(k.scade)}` : " · non scade"}
      </span>
      {!k.attiva && <span className="ag-stato">non attiva</span>}
      <span className="ag-azioni">
        <Azione r={r} verbo="Revoca" avviso="Chi la usa perde l'accesso subito." nome={k.nome} />
      </span>
      <Errore errore={r.errore} />
    </li>
  );
}

/* ── app collegate (OAuth) ───────────────────────────────────── */

function AppCollegate() {
  const q = useDatiProprietario(api.agents.list);
  return (
    <div className="ag-blocco" role="group" aria-label="App collegate">
      <p className="ag-etichetta">App collegate</p>
      <p className="ag-hint">
        Le app a cui hai dato l'accesso con "Consenti" (Claude, ChatGPT, Claude Code…). L'accesso si rinnova da solo; se
        un'app resta ferma per 30 giorni va ricollegata. Scollegarla lo toglie subito.
      </p>
      {q.error ? (
        <Errore errore={erroreDi(q.error)} />
      ) : !q.data ? (
        <p className="ag-attesa" aria-busy="true">Carico…</p>
      ) : q.data.client.length === 0 ? (
        <p className="ag-vuoto">Nessuna app collegata.</p>
      ) : (
        <ul className="ag-lista" aria-label="Elenco delle app collegate">
          {q.data.client.map(c => <RigaClient key={c.clientId} c={c} />)}
        </ul>
      )}
    </div>
  );
}

function RigaClient({ c }: { c: Client }) {
  const convex = useConvexProprietario();
  const r = useRevoca(() => convex.mutation(api.agents.revokeOAuthClient, { clientId: c.clientId }));
  return (
    <li className="ag-voce">
      <span className="ag-nome">{c.nome}</span>
      {c.host.length > 0 && <span className="ag-meta">torna a {c.host.join(", ")}</span>}
      <span className="ag-meta">ultimo accesso il {data(c.ultimoUso)}</span>
      <span className="ag-azioni">
        <Azione r={r} verbo="Scollega" avviso="Per ricollegarla servirà un nuovo consenso." nome={c.nome} />
      </span>
      <Errore errore={r.errore} />
    </li>
  );
}
