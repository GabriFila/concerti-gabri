/* ──────────────────────────────────────────────────────────────
   #concerti (T5): il riquadro "da completare" (§1.36, §1.38), l'elenco
   dei concerti e dei festival con la ricerca, e il modale per aggiungere
   e modificare (ConcertoModale). Cancellare chiede conferma; ogni
   scrittura va nel registro e si annulla da «Attività».
   ────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { todayKey } from "../../../shared/lib/dates.ts";
import type { SezioneProps } from "../tipi.ts";
import { ConcertoModale } from "./ConcertoModale.tsx";
import { Caricamento, Conferma, CorniceSezione, useAvviso, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { cercaEventi, daCompletare, eFestival, ordinaEventi, titoloDi, type EventoUi } from "./forme.ts";

const PAGINA = 25;

type Aperto = { tipo: "concert" | "festival"; evento?: EventoUi } | null;

export function SezioneConcerti(_props: SezioneProps) {
  const q = useDati(api.entries.list, {});
  const [aperto, setAperto] = useState<Aperto>(null);
  const [avviso, setAvviso] = useAvviso();
  return (
    <CorniceSezione>
      <div className="mod-barra">
        <button type="button" className="mod-btn mod-primario" onClick={() => setAperto({ tipo: "concert" })}>Aggiungi un concerto</button>
        <button type="button" className="mod-btn" onClick={() => setAperto({ tipo: "festival" })}>Aggiungi un festival</button>
      </div>
      {avviso}
      <Caricamento q={q}>
        {({ concerts }) => <Elenco eventi={concerts} onApri={evento => setAperto({ tipo: eFestival(evento) ? "festival" : "concert", evento })} onAvviso={setAvviso} />}
      </Caricamento>
      {aperto && (
        <ConcertoModale
          tipo={aperto.tipo}
          evento={aperto.evento}
          onChiudi={() => setAperto(null)}
          onSalvato={m => {
            setAperto(null);
            setAvviso(`${m} Puoi annullarlo da «Attività».`);
          }}
        />
      )}
    </CorniceSezione>
  );
}

function Elenco({ eventi, onApri, onAvviso }: { eventi: EventoUi[]; onApri: (e: EventoUi) => void; onAvviso: (m: string) => void }) {
  const [cerca, setCerca] = useState("");
  const [quanti, setQuanti] = useState(PAGINA);
  const [daCancellare, setDaCancellare] = useState<EventoUi | null>(null);
  const ordinati = useMemo(() => ordinaEventi(eventi), [eventi]);
  const trovati = useMemo(() => cercaEventi(ordinati, cerca), [ordinati, cerca]);
  // "oggi" a Roma: la sezione esiste solo nel browser, dopo l'idratazione
  const mancanti = useMemo(() => daCompletare(eventi, todayKey(Date.now())), [eventi]);

  return (
    <>
      <DaCompletare voci={mancanti} onApri={id => { const e = eventi.find(x => x.id === id); if (e) onApri(e); }} />
      <div className="mod-barra">
        <input
          type="search"
          className="mod-cerca"
          placeholder="Cerca artista, festival, venue, città o compagno"
          aria-label="Cerca nei concerti"
          value={cerca}
          onChange={e => {
            setCerca(e.target.value);
            setQuanti(PAGINA);
          }}
        />
        <span className="mod-conta">{trovati.length === eventi.length ? `${eventi.length} eventi` : `${trovati.length} di ${eventi.length}`}</span>
      </div>
      {eventi.length === 0 ? (
        <p className="mod-vuoto">Nessun concerto, per ora. Aggiungine uno, oppure collega il tuo agente in «Agenti» e lascia fare a lui.</p>
      ) : (
        <ul className="mod-lista" aria-label="Concerti e festival">
          {trovati.slice(0, quanti).map(e => (
            <RigaEvento key={e.id} e={e} onModifica={() => onApri(e)} onCancella={() => setDaCancellare(e)} />
          ))}
        </ul>
      )}
      {trovati.length > quanti && (
        <button type="button" className="mod-link" onClick={() => setQuanti(n => n + PAGINA)}>
          Mostra altri {Math.min(PAGINA, trovati.length - quanti)}
        </button>
      )}
      {daCancellare && (
        <CancellaEvento
          e={daCancellare}
          onChiudi={() => setDaCancellare(null)}
          onFatto={() => {
            setDaCancellare(null);
            onAvviso("Cancellato. Puoi annullarlo da «Attività».");
          }}
        />
      )}
    </>
  );
}

function RigaEvento({ e, onModifica, onCancella }: { e: EventoUi; onModifica: () => void; onCancella: () => void }) {
  const fest = eFestival(e);
  const voti = (fest ? e.concerts.map(c => c.voto) : [e.voto]).flatMap(v => (v === undefined ? [] : [v]));
  const viaggio = !e.from ? null : e.kmPending ? `da ${e.from} · km in attesa` : e.km !== undefined ? `da ${e.from} · ${e.km} km` : `da ${e.from}`;
  const nome = `${titoloDi(e)} del ${e.date}`;
  return (
    <li className="mod-evento">
      <span className="mod-evento-data">{e.date}</span>
      <span className="mod-evento-titolo">
        {titoloDi(e)}
        {fest && <span className="mod-tag">festival · {e.concerts.length} concerti</span>}
      </span>
      <span className="mod-evento-luogo">
        {e.venue} · {e.city}
        {viaggio && <span className="mod-evento-viaggio">{viaggio}</span>}
      </span>
      <span className="mod-evento-voto" aria-label={voti.length ? `voto ${voti.join(", ")}` : "senza voto"}>
        {voti.length ? voti.map(v => "★".repeat(v)).join(" ") : "—"}
      </span>
      <span className="mod-evento-azioni">
        <button type="button" className="mod-btn" onClick={onModifica} aria-label={`Modifica ${nome}`}>Modifica</button>
        <button type="button" className="mod-btn mod-pericolo-lieve" onClick={onCancella} aria-label={`Cancella ${nome}`}>Cancella</button>
      </span>
    </li>
  );
}

function CancellaEvento({ e, onChiudi, onFatto }: { e: EventoUi; onChiudi: () => void; onFatto: () => void }) {
  const convex = useConvex();
  const op = useOperazione();
  return (
    <Conferma
      titolo={`Cancellare ${eFestival(e) ? "il festival" : "il concerto"}?`}
      onChiudi={onChiudi}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        if (await op.esegui(() => convex.mutation(api.entries.remove, { id: e.id, confirm: true }))) onFatto();
      }}
    >
      <p>
        <b>{titoloDi(e)}</b>, {e.date} a {e.venue}. Sparisce dalla tua pagina; se lo riaggiungi, o lo ripristini da «Attività», torna
        con gli stessi km.
      </p>
    </Conferma>
  );
}

/** I concerti passati senza voto, posizione, canzoni note o partenza (§1.36): li vede solo il proprietario. */
function DaCompletare({ voci, onApri }: { voci: ReturnType<typeof daCompletare>; onApri: (id: string) => void }) {
  const [tutti, setTutti] = useState(false);
  if (!voci.length) return null;
  const mostrate = tutti ? voci : voci.slice(0, 5);
  return (
    <section className="mod-dacompletare" aria-label="Da completare">
      <h3>Da completare <span className="mod-conta">{voci.length}</span></h3>
      <p className="mod-hint">Dopo la serata: voto, posizione, canzoni note e partenza. Questo riquadro lo vedi solo tu.</p>
      <ul>
        {mostrate.map(v => (
          <li key={v.id}>
            <span><b>{v.titolo}</b> <span className="mod-evento-data">{v.date}</span></span>
            <span className="mod-mancano">manca: {v.mancano.join(", ")}</span>
            <button type="button" className="mod-btn" onClick={() => onApri(v.id)} aria-label={`Completa ${v.titolo} del ${v.date}`}>Completa</button>
          </li>
        ))}
      </ul>
      {voci.length > 5 && (
        <button type="button" className="mod-link" onClick={() => setTutti(t => !t)}>{tutti ? "Mostra meno" : `Mostra tutti (${voci.length})`}</button>
      )}
    </section>
  );
}
