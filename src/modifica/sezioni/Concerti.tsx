/* ──────────────────────────────────────────────────────────────
   #concerti (T5, spec ux-modifica §6.1), la vista d'arrivo di /modifica:

   - Testata: «Aggiungi un concerto» (sul telefono il pulsante flottante),
     «Aggiungi un festival», nel menu ⋯ l'import e l'Oracolo.
   - Il riquadro «Da completare» (§1.36, §1.38, solo il proprietario):
     «Completa» apre il concerto in coda, «Completa in sequenza» parte dal
     primo, «Solo questi nell'elenco» accende il filtro; «Riduci» lo
     chiude in una riga (ricordato nel browser).
   - L'avviso dei km in attesa (partenze senza indirizzo).
   - La barra degli strumenti: ricerca, filtri a pastiglie, anno, «Con X»
     (da `?con=<personId>`, per esempio da Persone), ordine e conteggio. I
     filtri sono stato della vista (sopravvivono ai cambi di vista);
     `?filtro=` e `?con=` li impostano e poi l'URL torna #concerti.
   - L'elenco: separatori per anno e «oggi» negli ordini per data, righe
     che cambiano forma con lo spazio (container query), il titolo apre il
     pannello, ⋯ «Modifica», «Duplica», «Cancella…»; una riga cambiata da
     chiunque (l'Oracolo, un agente) lampeggia un attimo.
   - Il pannello per aggiungere e modificare (ConcertoPannello), aperto
     dall'hash: `?nuovo=concerto|festival`, `?apri=<id>` e `&completa=1`
     (vista.ts), così «indietro» lo chiude e il ponte dell'editor
     (editor.tsx) ci arriva da qualunque parte di /modifica. Cancellare
     chiede conferma; ogni scrittura va nel registro, e la notifica che
     segue ha «Annulla».
   ────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { isPlanned, todayKey } from "../../../shared/lib/dates.ts";
import { Icon } from "../../ui/Icon.tsx";
import { useEditorConcerti, useEditorInterno } from "../editor.tsx";
import { SOGLIE } from "../layout.ts";
import { useOracolo } from "../oracolo/contesto.tsx";
import { Fab, IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { BarraStrumenti, Vuoto } from "../ui/campi.tsx";
import { Menu } from "../ui/Menu.tsx";
import { useToast } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { haPannello } from "../vista.ts";
import {
  CancellaEvento, ConcertoMancante, ConcertoPannello, type DopoSalvataggio, type InfoCoda, type Passaggio, type Salvataggio,
} from "./ConcertoPannello.tsx";
import { Caricamento, CorniceSezione, useDati } from "./comuni.tsx";
import {
  anniDi, chiaveNome, compagniBrevi, conSeparatori, daCompletare, eFestival, filtraEventi, giornoDaChiave, mancanoEvento, ordinaEventiPer,
  prossimoDaCompletare, titoloDi, valoriDuplicati, viaggioDi, votoDi, type EventoUi, type FiltroConcerti, type OrdineConcerti,
} from "./forme.ts";

/** Le righe rese subito (con content-visibility il resto costa poco), poi a gruppi. */
const PRIMI = 300;
const ALTRI = 100;
const CHIAVE_RIDOTTO = "concerti:modifica:dacompletare";

const ORDINI = [
  { valore: "recenti", testo: "Più recenti" },
  { valore: "meno-recenti", testo: "Meno recenti" },
  { valore: "artista", testo: "Artista A–Z" },
  { valore: "voto", testo: "Voto più alto" },
];

const FILTRI = new Set<string>(["tutti", "programma", "passati", "da-completare", "festival"]);

type Partenza = { id: string; name: string; stato: string };
type Persona = { id: string; name: string };

export function SezioneConcerti(_props: SezioneProps) {
  const q = useDati(api.entries.list, {});
  const persone = useDati(api.people.list);
  const partenze = useDati(api.departures.list);
  const { vai, apriPannello, vista, parametri } = useVista();
  const editor = useEditorConcerti();
  const oracolo = useOracolo();
  const nuovo = () => void apriPannello({ nuovo: "concerto" });
  const chiediOracolo = () => oracolo.apri({ testo: "Aggiungi un concerto: " });
  const importa = () => void vai("agenti", { parte: "import" });
  // senza concerti l'azione piena è «Aggiungi il primo concerto» dello stato vuoto: in testata resta un contorno, e niente pulsante flottante
  const vuota = q.data?.concerts.length === 0;
  return (
    <CorniceSezione>
      <IntestazioneVista
        id="concerti"
        titolo="Concerti"
        meta={q.data && <Meta eventi={q.data.concerts} />}
        primaria={<button type="button" className={vuota ? "mod-btn" : "mod-btn mod-primario"} onClick={nuovo}>Aggiungi un concerto</button>}
        secondarie={[{ etichetta: "Aggiungi un festival", icona: "plus", onClick: () => void apriPannello({ nuovo: "festival" }) }]}
        altro={[
          { etichetta: "Importa da un file", icona: "arrowUp", onClick: importa },
          { etichetta: "Chiedi al Tour manager", icona: "spark", onClick: chiediOracolo },
        ]}
        fab={vuota ? undefined : <Fab etichetta="Aggiungi un concerto" testo="Concerto" onClick={nuovo} />}
      />
      <Caricamento q={q} righe>
        {({ concerts }) => (
          <Elenco
            eventi={concerts}
            persone={persone.data?.people}
            partenze={partenze.data?.departures ?? []}
            aperto={vista === "concerti" ? (parametri.apri ?? null) : null}
            onApri={evento => void apriPannello({ apri: evento.id })}
            onCompleta={id => void apriPannello({ apri: id, completa: "1" })}
            onDuplica={e => void editor.apri({ tipo: eFestival(e) ? "festival" : "concert", bozza: valoriDuplicati(e), origine: "duplica" })}
            vuoto={
              <Vuoto
                icona="ticket"
                titolo="Nessun concerto, per ora."
                testo={<>Aggiungilo a mano, importa un file o chiedilo al Tour manager: «ho visto i Verdena al Fabrique il 3 marzo con Cami».</>}
                azioni={
                  <>
                    <button type="button" className="mod-btn mod-primario" onClick={nuovo}>Aggiungi il primo concerto</button>
                    <button type="button" className="mod-btn" onClick={chiediOracolo}>Chiedi al Tour manager</button>
                    <button type="button" className="mod-link" onClick={importa}>Importa da un file</button>
                  </>
                }
              />
            }
          />
        )}
      </Caricamento>
      <PannelloConcerti eventi={q.data?.concerts} />
    </CorniceSezione>
  );
}

/** «84 eventi · 11 in programma · 3 da completare». */
function Meta({ eventi }: { eventi: EventoUi[] }) {
  const oggi = todayKey(Date.now());
  const programma = eventi.filter(e => isPlanned(e, oggi)).length;
  const mancanti = daCompletare(eventi, oggi).length;
  return (
    <>
      {quantiEventi(eventi.length)} · {programma} in programma
      {mancanti > 0 && <span className="mf-meta-ambra"> · {mancanti} da completare</span>}
    </>
  );
}

const quantiEventi = (n: number) => (n === 1 ? "1 evento" : `${n} eventi`);

/* ── il pannello aperto dall'hash ─────────────────────────────── */

/**
 * Il pannello di #concerti: nuovo (con la bozza del ponte dell'editor, se
 * c'è, o con i valori portati dall'altro tipo), modifica (anche in coda,
 * `completa=1`), o «non c'è più» per un id sconosciuto.
 */
function PannelloConcerti({ eventi }: { eventi: EventoUi[] | undefined }) {
  const { vista, parametri, chiudiPannello, apriPannello } = useVista();
  const editor = useEditorInterno();
  const { mostra } = useToast();
  const [passaggio, setPassaggio] = useState<Passaggio | null>(null);
  // l'ultima riga vista per l'id aperto: se sparisce mentre è aperta, il pannello resta con l'avviso
  const visto = useRef<{ id: string; e: EventoUi } | null>(null);
  // la coda com'era all'inizio, per «2 di 5»
  const coda = useRef<string[] | null>(null);
  const oggi = todayKey(Date.now());
  const lista = useMemo(() => (eventi ? daCompletare(eventi, oggi) : []), [eventi, oggi]);

  // i valori dell'altro tipo valgono per il form nuovo che arriva; poi si dimenticano
  useEffect(() => {
    if (!parametri.nuovo) setPassaggio(null);
  }, [parametri.nuovo]);

  if (vista !== "concerti") return null;
  const chiudi = () => chiudiPannello();
  const chiudiDopo = () => chiudiPannello({ dopoSalvataggio: true });
  const salvato = (s: Salvataggio, dopo: DopoSalvataggio) => {
    editor.salvato(s.id, s.kmPending);
    if (dopo.prossimo) {
      void apriPannello({ apri: dopo.prossimo, completa: "1" }, "concerti", { sostituisci: true, ignoraGuardia: true });
      return;
    }
    chiudiDopo();
    if (parametri.completa && dopo.completo && !lista.some(x => x.id !== s.id)) mostra({ testo: "Tutto completo." });
  };
  const usato = (v: Passaggio["valori"]) => {
    editor.usato(v);
    chiudiDopo();
  };
  const cambiaTipo = (p: Passaggio) => {
    setPassaggio(p);
    void apriPannello({ nuovo: p.tipo === "festival" ? "festival" : "concerto" }, "concerti", { sostituisci: true, ignoraGuardia: true });
  };
  // la guardia che tiene aperto il pannello rinuncia da sola all'apertura chiesta dal ponte (Pannello, useRinunciaEditor)
  const comuni = { eventi: eventi ?? [], onChiudi: chiudi, onSalvato: salvato, onUsato: usato, onCancellato: chiudiDopo };

  if (parametri.nuovo) {
    const tipo = parametri.nuovo === "festival" ? "festival" : "concert";
    return (
      <ConcertoPannello
        // il numero dell'apertura del ponte: un'altra bozza sullo stesso «Nuovo concerto» lo rifà da capo
        key={`nuovo:${tipo}:${editor.numero}`}
        {...comuni}
        tipo={tipo}
        apertura={editor.aperto}
        passaggio={passaggio?.tipo === tipo ? passaggio : null}
        onTipo={cambiaTipo}
      />
    );
  }
  if (parametri.apri) {
    // il pannello arriva con l'elenco (un link diretto aspetta i dati)
    if (!eventi) return null;
    const id = parametri.apri;
    const e = eventi.find(x => x.id === id);
    if (e) visto.current = { id, e };
    const ultimo = e ?? (visto.current?.id === id ? visto.current.e : undefined);
    if (!ultimo) return <ConcertoMancante key={`mancante:${id}`} onChiudi={chiudi} />;
    let infoCoda: InfoCoda | null = null;
    if (parametri.completa) {
      const ids = lista.map(x => x.id);
      if (!coda.current?.includes(id)) coda.current = ids.includes(id) ? ids : [id, ...ids];
      infoCoda = { posizione: coda.current.indexOf(id) + 1, totale: coda.current.length, prossimo: prossimoDaCompletare(lista, id) };
    } else coda.current = null;
    return (
      <ConcertoPannello
        key={`apri:${id}:${editor.numero}`}
        {...comuni}
        evento={ultimo}
        sparito={!e}
        tipo={eFestival(ultimo) ? "festival" : "concert"}
        apertura={editor.aperto}
        coda={infoCoda}
      />
    );
  }
  return null;
}

/* ── l'elenco ─────────────────────────────────────────────────── */

function Elenco({ eventi, persone, partenze, aperto, onApri, onCompleta, onDuplica, vuoto }: {
  eventi: EventoUi[];
  persone: Persona[] | undefined;
  partenze: Partenza[];
  /** La riga col pannello aperto. */
  aperto: string | null;
  onApri: (e: EventoUi) => void;
  onCompleta: (id: string) => void;
  onDuplica: (e: EventoUi) => void;
  vuoto: ReactNode;
}) {
  const { parametri, vai } = useVista();
  const [testo, setTesto] = useState("");
  const [filtro, setFiltro] = useState<FiltroConcerti>("tutti");
  const [anno, setAnno] = useState<number | null>(null);
  const [con, setCon] = useState<string | null>(null);
  const [ordine, setOrdine] = useState<OrdineConcerti>("recenti");
  const [quanti, setQuanti] = useState(PRIMI);
  const [daCancellare, setDaCancellare] = useState<EventoUi | null>(null);
  const elenco = useRef<HTMLUListElement>(null);
  const lampi = useLampi(eventi);

  // "oggi" a Roma: la sezione esiste solo nel browser, dopo l'idratazione
  const oggi = todayKey(Date.now());
  const mancanti = useMemo(() => daCompletare(eventi, oggi), [eventi, oggi]);
  const conte = useMemo(
    () => ({ programma: eventi.filter(e => isPlanned(e, oggi)).length, festival: eventi.filter(eFestival).length }),
    [eventi, oggi],
  );
  const anni = useMemo(() => anniDi(eventi), [eventi]);
  // «Con X»: dall'id della persona al suo nome (un id che non c'è si lascia cadere)
  const nomeCon = con ? (persone?.find(p => p.id === con)?.name ?? null) : null;
  useEffect(() => {
    if (con && persone && !nomeCon) setCon(null);
  }, [con, persone, nomeCon]);

  // `?filtro=` e `?con=` impostano i filtri e basta: poi l'URL torna #concerti
  useEffect(() => {
    if (!parametri.filtro && !parametri.con) return;
    setTesto("");
    setAnno(null);
    setFiltro(parametri.filtro && FILTRI.has(parametri.filtro) ? (parametri.filtro as FiltroConcerti) : "tutti");
    setCon(parametri.con ?? null);
    setQuanti(PRIMI);
    if (!haPannello(parametri)) void vai("concerti", {}, { sostituisci: true, tieniStato: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametri.filtro, parametri.con]);

  const trovati = useMemo(
    () => ordinaEventiPer(filtraEventi(eventi, { filtro, anno, con: nomeCon, testo }, oggi), ordine),
    [eventi, filtro, anno, nomeCon, testo, ordine, oggi],
  );
  const righe = useMemo(() => {
    const tutte = conSeparatori(trovati, ordine, oggi);
    // fino a `quanti` eventi, con i loro separatori
    let n = 0;
    return tutte.filter(r => (r.tipo === "evento" ? ++n <= quanti : n < quanti));
  }, [trovati, ordine, oggi, quanti]);

  const filtrato = filtro !== "tutti" || anno !== null || nomeCon !== null || testo.trim() !== "";
  const azzera = () => {
    setTesto("");
    setFiltro("tutti");
    setAnno(null);
    setCon(null);
    setQuanti(PRIMI);
  };

  if (eventi.length === 0) return <>{vuoto}</>;
  const tuttoCompleto = filtro === "da-completare" && mancanti.length === 0 && anno === null && !nomeCon && !testo.trim();
  return (
    <>
      <DaCompletare
        voci={mancanti}
        onApri={onCompleta}
        onSoloQuesti={() => {
          azzera();
          setFiltro("da-completare");
          setTimeout(() => elenco.current?.scrollIntoView({ block: "start" }), 0);
        }}
      />
      <AvvisoKm eventi={eventi} partenze={partenze} />
      <BarraStrumenti
        cerca={{
          etichetta: "Cerca nei concerti",
          segnaposto: "Cerca artista, festival, venue, città o compagno",
          breve: "Cerca un concerto",
          valore: testo,
          onCambia: v => {
            setTesto(v);
            setQuanti(PRIMI);
          },
        }}
        filtri={{
          etichetta: "Filtra i concerti",
          valore: filtro,
          opzioni: [
            { valore: "tutti", testo: "Tutti", conta: eventi.length },
            { valore: "programma", testo: "In programma", conta: conte.programma },
            { valore: "passati", testo: "Passati" },
            { valore: "da-completare", testo: "Da completare", conta: mancanti.length },
            { valore: "festival", testo: "Festival", conta: conte.festival },
          ],
          onCambia: v => {
            setFiltro(v as FiltroConcerti);
            setQuanti(PRIMI);
          },
        }}
        ordina={{ valore: ordine, opzioni: ORDINI, onCambia: v => setOrdine(v as OrdineConcerti) }}
        conta={filtrato ? `${trovati.length} di ${eventi.length}` : quantiEventi(eventi.length)}
      >
        {anni.length > 1 && (
          <select
            className="mf-anno"
            aria-label="Anno"
            value={anno ?? ""}
            onChange={e => {
              setAnno(e.target.value ? Number(e.target.value) : null);
              setQuanti(PRIMI);
            }}
          >
            <option value="">Tutti gli anni</option>
            {anni.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {nomeCon && (
          <span className="mf-chip mf-chip-con">
            Con {nomeCon}
            <button type="button" aria-label={`Togli il filtro «Con ${nomeCon}»`} title="Togli il filtro" onClick={() => setCon(null)}>
              <Icon name="close" size={13} stroke={2.2} />
            </button>
          </span>
        )}
      </BarraStrumenti>
      {trovati.length === 0 ? (
        tuttoCompleto ? (
          <Vuoto icona="check" titolo="Tutto completo: nessun concerto passato aspetta dati." azioni={<button type="button" className="mod-btn" onClick={azzera}>Torna a tutti i concerti</button>} />
        ) : (
          <Vuoto icona="search" titolo="Nessun concerto con questi filtri." azioni={<button type="button" className="mod-btn" onClick={azzera}>Azzera i filtri</button>} />
        )
      ) : (
        <ul ref={elenco} className="mod-lista mf-righe" aria-label="Concerti e festival">
          {righe.map(r =>
            r.tipo === "evento" ? (
              <RigaEvento
                key={r.e.id}
                e={r.e}
                oggi={oggi}
                aperto={r.e.id === aperto}
                lampo={lampi.has(r.e.id)}
                onModifica={() => onApri(r.e)}
                onDuplica={() => onDuplica(r.e)}
                onCancella={() => setDaCancellare(r.e)}
              />
            ) : r.tipo === "anno" ? (
              <li key={`anno:${r.anno}`} className="mf-separatore" aria-hidden="true">
                {r.anno || "Senza data"} <span>· {r.conta}</span>
              </li>
            ) : (
              <li key="oggi" className="mf-separatore mf-separatore-oggi" aria-hidden="true">
                oggi · {giornoDaChiave(oggi)}
              </li>
            ),
          )}
        </ul>
      )}
      {trovati.length > quanti && (
        <button type="button" className="mod-link mf-altri" onClick={() => setQuanti(n => n + ALTRI)}>
          Mostra altri {Math.min(ALTRI, trovati.length - quanti)}
        </button>
      )}
      {daCancellare && <CancellaEvento e={daCancellare} onChiudi={() => setDaCancellare(null)} />}
    </>
  );
}

/**
 * Le righe appena aggiunte o cambiate (dall'Oracolo, da un agente, da
 * un'altra scheda o da qui): l'elenco di prima e quello nuovo a confronto.
 * Lampeggiano per 1,2 s; niente con prefers-reduced-motion.
 */
function useLampi(eventi: EventoUi[]): ReadonlySet<string> {
  const prima = useRef<Map<string, string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [lampi, setLampi] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    const ora = new Map(eventi.map(e => [e.id, JSON.stringify(e)] as const));
    const vecchi = prima.current;
    prima.current = ora;
    if (!vecchi) return;
    const cambiati = [...ora].filter(([id, j]) => vecchi.get(id) !== j).map(([id]) => id);
    if (!cambiati.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setLampi(new Set(cambiati));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setLampi(new Set()), 1200);
  }, [eventi]);
  return lampi;
}

/**
 * Una riga: data, titolo (il pulsante che apre il pannello, steso su tutta
 * la riga), luogo, compagni, viaggio, voto, stato e il menu ⋯. La forma
 * (una riga, due righe o una scheda) la decide lo spazio (container query).
 */
function RigaEvento({ e, oggi, aperto, lampo, onModifica, onDuplica, onCancella }: {
  e: EventoUi;
  oggi: number;
  aperto: boolean;
  lampo: boolean;
  onModifica: () => void;
  onDuplica: () => void;
  onCancella: () => void;
}) {
  const fest = eFestival(e);
  const programma = isPlanned(e, oggi);
  const mancano = mancanoEvento(e, oggi);
  const voti = (fest ? e.concerts.map(c => c.voto) : [e.voto]).flatMap(v => (v === undefined ? [] : [v]));
  const voto = votoDi(e);
  const nome = `${titoloDi(e)} del ${e.date}`;
  const compagni = compagniBrevi(e);
  return (
    <li
      className="mf-riga mod-evento"
      data-programma={programma ? "" : undefined}
      data-lampo={lampo ? "" : undefined}
      aria-current={aperto ? "true" : undefined}
    >
      <span className="mf-riga-data">{e.date}</span>
      <span className="mf-riga-titolo">
        <span className="mf-riga-nome">
          <button type="button" className="mf-riga-apri" onClick={onModifica} aria-label={`Modifica ${nome}`}>
            {titoloDi(e)}
          </button>
          {fest && <span className="mod-tag">festival · {e.concerts.length} concerti</span>}
        </span>
        {fest && <span className="mf-riga-lineup">{e.concerts.map(c => c.artist).join(", ")}</span>}
      </span>
      <span className="mf-riga-luogo">
        {e.venue} · {e.city}
      </span>
      <span className="mf-riga-con">{compagni}</span>
      <span className="mf-riga-meta">
        <span className="mf-riga-viaggio" data-attesa={e.kmPending ? "" : undefined} data-vuoto={e.from ? undefined : ""}>{viaggioDi(e)}</span>
        <span
          className="mf-riga-voto mod-evento-voto"
          role="img"
          aria-label={voti.length ? `voto ${voti.join(", ")}` : "senza voto"}
          title={fest && voti.length > 1 ? "Il voto più alto dei suoi concerti" : undefined}
          data-vuoto={voto ? undefined : ""}
        >
          {voto ? "★".repeat(voto) : programma ? "" : "—"}
        </span>
        <span className="mf-riga-stato">
          {programma ? (
            <span className="mf-pastiglia mf-pastiglia-teal">In programma</span>
          ) : mancano.length ? (
            <span className="mf-pastiglia mf-pastiglia-ambra" title={`Manca: ${mancano.join(", ")}`}>Da completare</span>
          ) : null}
        </span>
      </span>
      <span className="mf-riga-menu">
        <Menu
          etichetta={`Altre azioni per ${nome}`}
          voci={[
            { etichetta: "Modifica", icona: "pen", onClick: onModifica },
            { etichetta: "Duplica", icona: "copy", onClick: onDuplica },
            { etichetta: "Cancella…", icona: "trash", pericolo: true, onClick: onCancella },
          ]}
        />
      </span>
    </li>
  );
}

/* ── da completare e km in attesa ─────────────────────────────── */

const TELEFONO = `(max-width:${SOGLIE.medio - 1}px)`;

/** Le voci del riquadro prima di «Mostra tutti»: 3 sul telefono (l'elenco deve restare in vista), 5 altrove. La vista esiste solo nel browser. */
function usePrimiDaCompletare(): number {
  const [telefono, setTelefono] = useState(() => window.matchMedia(TELEFONO).matches);
  useEffect(() => {
    const mq = window.matchMedia(TELEFONO);
    const cambia = () => setTelefono(mq.matches);
    mq.addEventListener("change", cambia);
    return () => mq.removeEventListener("change", cambia);
  }, []);
  return telefono ? 3 : 5;
}

function leggiRidotto(): boolean {
  try {
    return localStorage.getItem(CHIAVE_RIDOTTO) === "ridotto";
  } catch {
    return false;
  }
}

/**
 * I concerti passati senza voto, posizione, canzoni note o partenza
 * (§1.36): li vede solo il proprietario. «Riduci» lo lascia in una riga
 * ambra, e la scelta resta nel browser.
 */
function DaCompletare({ voci, onApri, onSoloQuesti }: {
  voci: ReturnType<typeof daCompletare>;
  /** Apre in coda (`completa=1`). */
  onApri: (id: string) => void;
  onSoloQuesti: () => void;
}) {
  const [tutti, setTutti] = useState(false);
  const [ridotto, setRidotto] = useState(leggiRidotto);
  // «Riduci» e «Mostra» sono due pulsanti in due forme del riquadro: dopo il clic il focus va su quello nuovo, non sul body
  const interruttore = useRef<HTMLButtonElement>(null);
  const rifocus = useRef(false);
  useEffect(() => {
    if (!rifocus.current) return;
    rifocus.current = false;
    interruttore.current?.focus();
  }, [ridotto]);
  const primi = usePrimiDaCompletare();
  if (!voci.length) return null;
  const n = voci.length;
  const riduci = (r: boolean) => {
    rifocus.current = true;
    setRidotto(r);
    try {
      localStorage.setItem(CHIAVE_RIDOTTO, r ? "ridotto" : "aperto");
    } catch {
      // resta per questa visita
    }
  };
  if (ridotto) {
    return (
      <section className="mod-dacompletare mf-dacompletare-ridotto" aria-label="Da completare">
        <p>{n === 1 ? "1 concerto da completare" : `${n} concerti da completare`}</p>
        <button ref={interruttore} type="button" className="mod-link" aria-expanded={false} onClick={() => riduci(false)}>Mostra</button>
      </section>
    );
  }
  const mostrate = tutti ? voci : voci.slice(0, primi);
  return (
    <section className="mod-dacompletare" aria-label="Da completare">
      <div className="mf-dacompletare-testa">
        <h2>Da completare <span className="mod-conta">{n}</span></h2>
        <button ref={interruttore} type="button" className="mod-link" aria-expanded={true} onClick={() => riduci(true)}>Riduci</button>
      </div>
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
      <div className="mf-dacompletare-piedi">
        {n > primi && (
          <button type="button" className="mod-link" onClick={() => setTutti(t => !t)}>{tutti ? "Mostra meno" : `Mostra tutti (${n})`}</button>
        )}
        <button type="button" className="mod-link" onClick={onSoloQuesti}>Solo questi nell'elenco</button>
        {n > 1 && (
          <button type="button" className="mod-btn mf-btn-ambra" onClick={() => onApri(voci[0].id)}>Completa in sequenza</button>
        )}
      </div>
    </section>
  );
}

/** I concerti con i km in attesa: la partenza non ha ancora un indirizzo (una sola: si va dritti al suo). */
function AvvisoKm({ eventi, partenze }: { eventi: EventoUi[]; partenze: Partenza[] }) {
  const { vai } = useVista();
  const inAttesa = eventi.filter(e => e.kmPending);
  if (!inAttesa.length) return null;
  const nomi = [...new Map(inAttesa.flatMap(e => (e.from ? [[chiaveNome(e.from), e.from] as const] : []))).values()];
  const n = inAttesa.length;
  const soggetto = n === 1 ? "1 concerto ha i km in attesa" : `${n} concerti hanno i km in attesa`;
  const una = nomi.length === 1 ? partenze.find(p => chiaveNome(p.name) === chiaveNome(nomi[0])) : undefined;
  return (
    <div className="mod-attenzione mf-avviso-km" role="note">
      {nomi.length === 1 ? (
        <>
          <p>{soggetto}: la partenza «{nomi[0]}» non ha ancora un indirizzo.</p>
          <button type="button" className="mod-btn" onClick={() => void vai("partenze", una ? { indirizzo: una.id } : {})}>Imposta l'indirizzo</button>
        </>
      ) : (
        <>
          <p>{soggetto}: alcune partenze non hanno ancora un indirizzo.</p>
          <button type="button" className="mod-btn" onClick={() => void vai("partenze")}>Vai a Partenze</button>
        </>
      )}
    </div>
  );
}

