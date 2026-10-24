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

   Schede una sotto l'altra (spec ux-modifica §6.9), senza un'azione
   primaria in testata: la primaria è «Copia» dell'indirizzo, nella
   prima scheda; «Come collegarlo» è un <details> per client.
   `#agenti?parte=import` (il ⋯ di #concerti) porta alla scheda
   dell'import e mette il focus sul file, poi l'hash torna #agenti.
   Testi, testid ed etichette sono quelli che usano gli e2e (mcp-apikey,
   mcp-oauth, import): «Nome» è la sola etichetta con quella parola, e
   nessun role=status in più (l'import ha il suo).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useHydrated } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { agentPrompt } from "../../../shared/agentPrompt.ts";
import { ImportUpload } from "../../import/ImportUpload.tsx";
import { Copia, Errore, erroreDi, useConvexProprietario, useDatiProprietario, useOrigine, type ErroreUi } from "../../import/comuni.tsx";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import { LinkVista } from "../shell/LinkVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { TestaImpostazione } from "../ui/campi.tsx";
import { useVista } from "../useVista.ts";

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
      <IntestazioneVista
        id="agenti"
        titolo="Agenti"
        meta={idratata && <MetaAgenti />}
        descrizione={
          <>
            Un agente AI (Claude, ChatGPT, Claude Code…) può leggere le email dei biglietti e il calendario e scrivere i concerti qui, con gli
            stessi strumenti della dashboard. Non vede mai gli indirizzi delle partenze e non può esportare né eliminare l'account. Quello
            che scrive compare in «<LinkVista id="attivita" className="mf-link-testo">Attività</LinkVista>» e si annulla da lì.
          </>
        }
      />
      {idratata ? <Contenuto handle={handle} /> : <p className="ag-attesa" aria-busy="true">Carico…</p>}
    </div>
  );
}

/** «2 API key attive · 1 app collegata». */
function MetaAgenti() {
  const q = useDatiProprietario(api.agents.list);
  if (!q.data) return null;
  const chiavi = q.data.chiavi.filter(k => k.attiva).length;
  const app = q.data.client.length;
  return (
    <>
      {chiavi === 1 ? "1 API key attiva" : `${chiavi} API key attive`} · {app === 1 ? "1 app collegata" : `${app} app collegate`}
    </>
  );
}

function Contenuto({ handle }: { handle: string }) {
  const origine = useOrigine();
  const mcp = `${origine}/mcp`;
  const importa = useParteImport();
  return (
    <>
      <section className="ag-blocco mf-agenti-collega" aria-labelledby="agenti-collega">
        <TestaImpostazione id="agenti-collega" titolo="Collega un agente" />
        <p className="ag-hint">L'indirizzo del server MCP: lo incolli nel tuo agente, poi entri con questo account e consenti l'accesso.</p>
        <div className="ag-riga">
          <code className="ag-codice" data-testid="mcp-url">{mcp}</code>
          <Copia testo={mcp} nome="indirizzo del server MCP" />
        </div>
        <h3 className="mf-agenti-come">Come collegarlo</h3>
        <div className="mf-agenti-client">
          <details className="mf-dettaglio" open>
            <summary>
              <b>Claude</b> <span>sito e app</span>
            </summary>
            <p>
              Impostazioni → Connettori → Aggiungi connettore personalizzato, incolla l'indirizzo e premi Connetti. Si apre questo sito:
              entra e consenti l'accesso.
            </p>
          </details>
          <details className="mf-dettaglio">
            <summary>
              <b>ChatGPT</b>
            </summary>
            <p>
              Impostazioni → App e connettori → Avanzate, attiva la modalità sviluppatore, poi crea un connettore con l'indirizzo e
              autenticazione OAuth (serve un piano che lo permetta).
            </p>
          </details>
          <details className="mf-dettaglio">
            <summary>
              <b>Claude Code</b>
            </summary>
            <p>
              <code className="ag-codice">claude mcp add --transport http concerti {mcp}</code>, poi <code className="ag-codice">/mcp</code>{" "}
              dentro Claude Code per entrare e consentire l'accesso.
            </p>
          </details>
          <details className="mf-dettaglio">
            <summary>
              <b>Con una API key</b> <span>script e client senza OAuth</span>
            </summary>
            <p>
              Creala qui sotto e mandala nell'header <code className="ag-codice">x-api-key</code>, per esempio{" "}
              <code className="ag-codice">claude mcp add --transport http concerti {mcp} --header "x-api-key: cgk_…"</code>.
            </p>
          </details>
        </div>
      </section>

      <Prompt handle={handle} origine={origine} />
      <ChiaviApi />
      <AppCollegate />

      <section ref={importa.ref} id="agenti-import" className="ag-blocco mf-agenti-import" aria-labelledby="agenti-import-titolo" data-lampo={importa.lampo ? "" : undefined}>
        <TestaImpostazione id="agenti-import-titolo" titolo="Importa da un file" />
        <p className="ag-hint">
          Senza MCP, lo stesso prompt fa preparare all'agente un CSV (o un JSON): caricalo qui. Prima vedi l'anteprima, poi
          confermi; l'import si annulla in blocco.
        </p>
        <ImportUpload contesto="agenti" />
      </section>
    </>
  );
}

/**
 * `#agenti?parte=import` (dal ⋯ di #concerti): appena le schede sopra
 * hanno la loro altezza, porta alla scheda dell'import, mette il focus sul
 * file e la fa lampeggiare; poi l'hash torna #agenti, come ?filtro= in
 * #concerti (si apre una volta, non a ogni ritorno).
 */
function useParteImport() {
  const { parametri, vai } = useVista();
  const elenco = useDatiProprietario(api.agents.list);
  const pronte = !!(elenco.data || elenco.error);
  const ref = useRef<HTMLElement>(null);
  const [lampo, setLampo] = useState(false);
  useEffect(() => {
    if (parametri.parte !== "import" || !pronte || !ref.current) return;
    const piano = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ref.current.scrollIntoView({ block: "start", behavior: piano ? "auto" : "smooth" });
    ref.current.querySelector<HTMLInputElement>('input[type="file"]')?.focus({ preventScroll: true });
    setLampo(true);
    void vai("agenti", {}, { sostituisci: true, tieniStato: true });
  }, [parametri.parte, pronte, vai]);
  useEffect(() => {
    if (!lampo) return;
    const t = setTimeout(() => setLampo(false), 1200);
    return () => clearTimeout(t);
  }, [lampo]);
  return { ref, lampo };
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
    <section className="ag-blocco" aria-labelledby="agenti-prompt">
      <TestaImpostazione id="agenti-prompt" titolo="Il prompt da dare all'agente">
        <Copia testo={prompt} etichetta="Copia il prompt" />
      </TestaImpostazione>
      <p className="ag-hint">Con i tuoi dati di adesso (nome, forma, partenze): incollalo all'inizio della conversazione con l'agente.</p>
      {profilo.error ? (
        <Errore errore={erroreDi(profilo.error)} />
      ) : (
        <textarea className="ag-prompt" readOnly rows={10} value={prompt || "Carico…"} aria-label="Prompt per l'agente" />
      )}
    </section>
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
    <section className="ag-blocco" aria-labelledby="agenti-chiavi">
      <TestaImpostazione id="agenti-chiavi" titolo="API key" />
      <p className="ag-hint">Per script e client senza OAuth. La chiave si vede una volta sola, appena creata; poi resta qui, revocabile.</p>
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
    </section>
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
    <section className="ag-blocco" aria-labelledby="agenti-app">
      <TestaImpostazione id="agenti-app" titolo="App collegate" />
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
    </section>
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
