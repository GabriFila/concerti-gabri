/* ──────────────────────────────────────────────────────────────
   #attivita (T5; PIANO §1.30, §5.7; spec ux-modifica §6.10): ogni
   scrittura sulla pagina, con chi l'ha fatta (dashboard, Oracolo, MCP,
   API key, sistema) e «Annulla».

   Annulla riesce solo se il documento non è cambiato dopo (i km non
   contano); unioni di persone e import si annullano in blocco; i ricalcoli
   del sistema, i cambi di logo e le venue del catalogo non si annullano.
   Annullare è a sua volta una voce: annullarla rifà l'operazione (la
   notifica «Annullato: …» non ha un altro «Annulla»: la voce nuova è qui
   nell'elenco).

   - Pastiglie «Chi ha fatto la modifica», «Solo annullabili» e la ricerca
     filtrano nel browser le voci già arrivate (registro.ts); `/` porta
     alla ricerca.
   - Separatori per giorno («Oggi», «Ieri», «22 ottobre 2026», a Roma),
     fermi sotto la barra degli strumenti; nella riga solo l'ora.
   - Le voci dell'Oracolo e degli agenti arrivate dopo l'ultima visita
     hanno il segno «nuova». L'ultima visita la scrive lo scheletro
     (useDistintivi) mentre la vista è aperta: qui si legge il valore di
     prima, all'apertura, prima che lo scheletro lo aggiorni.
   ────────────────────────────────────────────────────────────── */

import { useLayoutEffect, useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { todayKey } from "../../../shared/lib/dates.ts";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import { nuoveDagliAgenti } from "../shell/distintivi.ts";
import { CHIAVE_ATTIVITA } from "../shell/useDistintivi.ts";
import type { SezioneProps } from "../tipi.ts";
import { BarraStrumenti, Vuoto } from "../ui/campi.tsx";
import { useScrittura } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { Caricamento, CorniceSezione, Errore, useConvex, useDati } from "./comuni.tsx";
import { CHI, conGiorni, contaPerChi, daAnnullare, etichettaGiorno, filtraVoci, FILTRI_VUOTI, type Chi, type FiltriRegistro } from "./registro.ts";

type Voce = FunctionReturnType<typeof api.activity.list>["voci"][number];

const PASSO = 30;
const MASSIMO = 100;

const ORA = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
const QUANDO = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function SezioneAttivita(_props: SezioneProps) {
  const [limite, setLimite] = useState(PASSO);
  const q = useDati(api.activity.list, { limite }, { tieni: true });
  const n = q.data?.voci.length;
  // i filtri qui, non nell'elenco: restano anche se la query passa da un errore
  const [filtri, setFiltri] = useState<FiltriRegistro>(FILTRI_VUOTI);
  const vistoPrima = useUltimaVisita();
  return (
    <CorniceSezione>
      <IntestazioneVista
        id="attivita"
        titolo="Attività"
        meta={n !== undefined && n > 0 && <>{n === 1 ? "L'ultima modifica" : `Ultime ${n} modifiche`} · si conservano per 180 giorni</>}
        descrizione="Ogni modifica alla tua pagina, da qualunque parte arrivi: dashboard, Oracolo, agenti o sistema."
      />
      <Caricamento q={q} righe>
        {({ voci }) =>
          voci.length === 0 ? (
            <Vuoto icona="history" titolo="Ancora niente." testo="Qui compare ogni modifica, dalla dashboard, dall'Oracolo o da un agente." />
          ) : (
            <Registro
              voci={voci}
              filtri={filtri}
              onFiltri={setFiltri}
              vistoPrima={vistoPrima}
              altre={voci.length >= limite && limite < MASSIMO ? () => setLimite(l => Math.min(MASSIMO, l + PASSO)) : undefined}
              alLimite={limite >= MASSIMO && voci.length >= MASSIMO}
            />
          )
        }
      </Caricamento>
    </CorniceSezione>
  );
}

/**
 * L'ultima visita ad «Attività» com'era quando la vista si è aperta.
 * L'effetto di layout di questa vista gira prima di quello dello
 * scheletro che la aggiorna; undefined finché non si è letto.
 */
function useUltimaVisita(): string | null | undefined {
  const { vista } = useVista();
  const aperta = vista === "attivita";
  const [visto, setVisto] = useState<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    if (!aperta) return;
    try {
      setVisto(localStorage.getItem(CHIAVE_ATTIVITA));
    } catch {
      setVisto(null);
    }
  }, [aperta]);
  return visto;
}

function Registro({ voci, filtri, onFiltri, vistoPrima, altre, alLimite }: {
  voci: Voce[];
  filtri: FiltriRegistro;
  onFiltri: (f: FiltriRegistro) => void;
  vistoPrima: string | null | undefined;
  altre?: () => void;
  alLimite: boolean;
}) {
  const trovate = useMemo(() => filtraVoci(voci, filtri), [voci, filtri]);
  const conte = useMemo(() => contaPerChi(voci, filtri), [voci, filtri]);
  const nuove = useMemo(() => new Set(vistoPrima === undefined ? [] : nuoveDagliAgenti(voci, vistoPrima)), [voci, vistoPrima]);
  const adesso = Date.now();
  const righe = conGiorni(trovate, adesso);
  const oggi = todayKey(adesso);
  const filtrato = filtri.chi !== "tutte" || filtri.soloAnnullabili || filtri.testo.trim() !== "";
  const cambia = (f: Partial<FiltriRegistro>) => onFiltri({ ...filtri, ...f });
  return (
    <>
      <BarraStrumenti
        cerca={{ etichetta: "Cerca nel registro", segnaposto: "Cerca un concerto, una persona, un autore", breve: "Cerca nel registro", valore: filtri.testo, onCambia: testo => cambia({ testo }) }}
        filtri={{
          etichetta: "Chi ha fatto la modifica",
          valore: filtri.chi,
          opzioni: CHI.map(c => ({ valore: c.valore, testo: c.testo, conta: conte[c.valore] })),
          onCambia: v => cambia({ chi: v as Chi }),
        }}
        conta={filtrato ? `${trovate.length} di ${voci.length}` : voci.length === 1 ? "1 modifica" : `${voci.length} modifiche`}
      >
        <label className="mf-interruttore">
          <input type="checkbox" role="switch" checked={filtri.soloAnnullabili} onChange={e => cambia({ soloAnnullabili: e.target.checked })} />
          <span>Solo annullabili</span>
        </label>
      </BarraStrumenti>
      {trovate.length === 0 ? (
        <Vuoto
          icona="search"
          titolo="Nessuna modifica con questi filtri."
          azioni={<button type="button" className="mod-btn" onClick={() => onFiltri(FILTRI_VUOTI)}>Azzera i filtri</button>}
        />
      ) : (
        <ul className="mod-lista mod-registro" aria-label="Registro delle attività">
          {righe.map(r =>
            r.tipo === "giorno" ? (
              <li key={`g${r.chiave}`} className="mf-registro-giorno" aria-hidden="true">{r.etichetta}</li>
            ) : (
              <RigaVoce key={r.voce.id} v={r.voce} nuova={nuove.has(r.voce.id)} giorno={etichettaGiorno(todayKey(r.voce.at), oggi)} />
            ),
          )}
        </ul>
      )}
      {altre && <button type="button" className="mod-link" onClick={altre}>Mostra altre</button>}
      {alLimite && <p className="mod-hint">Il registro mostra le ultime {MASSIMO} modifiche.</p>}
    </>
  );
}

function RigaVoce({ v, nuova, giorno }: { v: Voce; nuova: boolean; giorno: string }) {
  const convex = useConvex();
  const op = useScrittura();
  return (
    <li className={`mod-voce${v.annullata ? " mod-voce-annullata" : ""}`} data-nuova={nuova ? "" : undefined}>
      {/* i separatori dei giorni non si leggono: il giorno lo dice l'ora */}
      <time className="mod-voce-ora" dateTime={new Date(v.at).toISOString()} title={QUANDO.format(v.at)}>
        <span className="mf-sr">{giorno}, </span>
        {ORA.format(v.at)}
      </time>
      <span className={`mod-autore mod-autore-${v.via}`}>{v.autore}</span>
      <span className="mod-voce-testo">
        {v.riassunto}
        {nuova && <span className="mf-nuova" title="Arrivata dopo la tua ultima visita qui">nuova</span>}
        {v.lotto && <span className="mod-tag">in blocco</span>}
        {v.annullata && <span className="mod-tag">annullata</span>}
      </span>
      <span className="mod-evento-azioni">
        {daAnnullare(v) && (
          <button
            type="button"
            className="mod-btn mf-btn-fantasma"
            disabled={op.inCorso}
            aria-label={`Annulla: ${v.riassunto}`}
            onClick={() => void op.esegui(() => convex.mutation(api.activity.undo, { activityId: v.id }), { successo: `Annullato: ${v.riassunto}.` })}
          >
            {op.inCorso ? "Annullo…" : "Annulla"}
          </button>
        )}
      </span>
      <Errore errore={op.errore} />
    </li>
  );
}
