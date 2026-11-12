/* ──────────────────────────────────────────────────────────────
   I campi del form di un concerto o di un festival (#concerti, spec
   ux-modifica §6.2), dentro il pannello di ConcertoPannello.tsx. Il form
   è diviso in parti con la loro legenda, una sotto l'altra:
   - «La serata»: artista, tour, data (con «in programma»), «Apertura
     di…» (facoltativo, mai «da completare»: i concerti singoli della
     stessa data; con un headliner data, venue e partenza diventano le sue,
     in sola lettura), venue, con chi; per un festival nome, data (anche più giorni) e venue, poi
     «Concerti del festival»: le schede dei suoi concerti, ognuna con
     artista, tour, giorno, compagni e voti. Il tour propone quelli già
     scritti per lo stesso artista;
   - «Biglietto»: prima com'è andata col biglietto (non ricordo il prezzo,
     ricordo il prezzo, accredito, regalato), poi il prezzo o chi l'ha
     regalato;
   - «Com'è andata», in fondo e sempre aperta: voto, posizione e canzoni
     note a pastiglie (radio veri, CampoSegmenti, con i nomi di sempre:
     `voto`, `vicinanza`, `canzoniNote`, `concerts[i].voto`…; per un
     festival stanno nelle schede dei concerti), «Partito da» e il commento.

   - A un evento passato a cui manca qualcosa la parte si segna in ambra
     con «Mancano: …».
   - Un festival con più di tre concerti li mostra chiusi (si aprono uno a
     uno, e da soli se hanno un errore); i campi restano montati.
   - Scorciatoie a un tocco: «Usate di recente» per la venue, «Frequenti»
     per i compagni, «Come l'ultimo: X» per la partenza di un concerto
     nuovo (la partenza non si precompila mai).
   - «Partito da» ha in fondo «Nuova partenza…»: un nome (mai l'indirizzo,
     che è privato e si imposta dopo in «Partenze») che si crea subito
     con departures.add; nel «Modulo completo» della scheda resta «nuova»
     e la crea il salvataggio della scheda, come le persone.
   - I campi proposti dall'Oracolo (`evidenzia` del ponte, editor.tsx)
     hanno un punto ambra e «proposto dall'Oracolo» per lo screen reader.
   - Gli errori del server con un `campo` stanno sotto quel campo.
   Lo stato (valori, espansioni, mancanti, errori) arriva dal pannello con
   il contesto del modulo.
   ────────────────────────────────────────────────────────────── */

import { createContext, useContext, useState, type ComponentType, type ReactNode } from "react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { api } from "../../../convex/_generated/api";
import { sembraIndirizzo } from "../../../shared/lib/nomi.ts";
import { CN_LABELS, CN_ORDER, VIC_LABELS, VIC_ORDER } from "../../../shared/model/scale.ts";
import { concertoInput, festivalInput } from "../../../shared/schema/entry.ts";
import { Icon } from "../../ui/Icon.tsx";
import { CampoSegmenti } from "../ui/campi.tsx";
import type { IdVista, Parametri } from "../vista.ts";
import { CampoCosto, PersoneScelte, VenueScelta, type useNomi } from "./campiConcerto.tsx";
import { CampoTesto, Errore, ErroriCampo, useConvex, useDescrizione, useOperazione, type ErroreUi } from "./comuni.tsx";
import {
  chiaveNome, compagniFrequenti, descrizione, etichettaCampo, nuovoSet, type ConcertoUi, type EventoUi, type ValoriConcerto, type ValoriFestival, type ValoriSet,
} from "./forme.ts";

const C = concertoInput.shape;
const F = festivalInput.shape;

/* ── il contesto del modulo ───────────────────────────────────── */

/** Il form di TanStack (concerto o festival), tipato largo come il resto delle sezioni. */
export interface FormEvento {
  Field: ComponentType<any>;
  Subscribe: ComponentType<any>;
  setFieldValue: (campo: any, valore: any) => void;
}

export interface ContestoModulo {
  form: FormEvento;
  festival: boolean;
  /** I valori di adesso. */
  valori: ValoriConcerto | ValoriFestival;
  /** Il concerto salvato, se si modifica (per i km di adesso). */
  evento?: EventoUi;
  /** «Modulo completo» della scheda dell'Oracolo: le persone nuove non si creano. */
  scheda: boolean;
  nomi: ReturnType<typeof useNomi>;
  recenti: { venue: string; city: string }[];
  /** I tour già scritti per un artista (i suggerimenti del campo «Tour»). */
  tourDi: (artista: string) => string[];
  /** I possibili headliner in una data ISO (le proposte di «Apertura di…»). */
  headlinerDi: (dataIso: string) => ConcertoUi[];
  /** Le aperture collegate a questo concerto (un headliner non può essere a sua volta un'apertura). */
  aperture: ConcertoUi[];
  /** La partenza dell'ultimo concerto, solo per un concerto nuovo. */
  ultima: string | null;
  /** La data è oggi o dopo. */
  inProgramma: boolean;
  /** I campi che a un evento passato mancano (campiMancanti di forme.ts). */
  mancanti: string[];
  evidenzia: ReadonlySet<string>;
  /** L'errore del server sul suo campo (campoDaServer), se ce n'è uno. */
  erroreServer: { campo: string; errore: ErroreUi } | null;
  /** I concerti del festival aperti (per indice). */
  setAperti: ReadonlySet<number>;
  espandi: (k: number, aperto: boolean) => void;
  /** Le schede aperte seguono i concerti spostati o tolti. */
  scambia: (i: number, j: number) => void;
  rimuovi: (i: number) => void;
  /** Il prefisso degli id delle parti. */
  prefisso: string;
  /** Dove va il focus all'apertura: il primo campo (nuovo), il tipo (dopo un cambio di tipo), niente. */
  autofocus: "campo" | "tipo" | null;
  vai: (v: IdVista, p?: Parametri) => void;
}

const Modulo = createContext<ContestoModulo | null>(null);
export const ProviderModulo = Modulo.Provider;

function useModulo(): ContestoModulo {
  const m = useContext(Modulo);
  if (!m) throw new Error("campi del concerto fuori dal pannello (ProviderModulo)");
  return m;
}

/* ── il tipo ──────────────────────────────────────────────────── */

/** Concerto o festival, solo in un form nuovo che non arriva dal ponte: i valori passano dall'uno all'altro. */
export function ScegliTipo({ festival, autofocus, onTipo }: { festival: boolean; autofocus: boolean; onTipo: (t: "concert" | "festival") => void }) {
  return (
    <div className="mf-tipo mf-segmenti-scelte" role="radiogroup" aria-label="Tipo">
      {([["concert", "Concerto"], ["festival", "Festival"]] as const).map(([t, testo]) => {
        const scelto = (t === "festival") === festival;
        return (
          <label key={t} className="mf-segmento">
            <input type="radio" name="mf-tipo" value={t} checked={scelto} onChange={() => onTipo(t)} data-autofocus={autofocus && scelto ? "" : undefined} />
            <span>{testo}</span>
          </label>
        );
      })}
    </div>
  );
}

/* ── pezzi ────────────────────────────────────────────────────── */

/** Una parte del form: fieldset con la legenda. */
function Parte({ id, titolo, mancano, segno, children }: { id: string; titolo: string; mancano?: boolean; segno?: ReactNode; children: ReactNode }) {
  const m = useModulo();
  return (
    <fieldset className="mod-gruppo mf-parte" id={`${m.prefisso}-${id}`} tabIndex={-1} data-mancano={mancano ? "" : undefined}>
      <legend>
        {titolo}
        {segno}
      </legend>
      {children}
    </fieldset>
  );
}

/** Il punto «proposto dall'Oracolo» accanto all'etichetta di un campo evidenziato dal ponte. */
function Segno({ campo }: { campo: string }) {
  const m = useModulo();
  if (!m.evidenzia.has(campo)) return null;
  return (
    <span className="mf-proposto" title="Proposto dal Tour manager">
      <span className="mf-sr"> (proposto dal Tour manager)</span>
    </span>
  );
}

/** L'errore del server su questo campo, se è lui. */
function ErroreDelServer({ campo }: { campo: string }) {
  const m = useModulo();
  return m.erroreServer?.campo === campo ? <Errore errore={m.erroreServer.errore} /> : null;
}

const InProgramma = () => <span className="mf-pastiglia mf-pastiglia-teal">in programma</span>;

/** «Mancano: voto, posizione.» (i nomi dei campi senza il concerto del festival). */
function Mancano({ campi }: { campi: string[] }) {
  if (!campi.length) return null;
  const nomi = campi.map(c => etichettaCampo(c.replace(/^concerts\[\d+\]\./, "")).toLowerCase());
  return <p className="mf-mancano">Mancano: {nomi.join(", ")}.</p>;
}

const OPZ_VOTO = [5, 4, 3, 2, 1].map(v => ({ valore: v, testo: "★".repeat(v), nome: v === 1 ? "1 stella" : `${v} stelle` }));
const OPZ_VIC = VIC_ORDER.map(v => ({ valore: v, testo: VIC_LABELS[v] }));
const OPZ_CN = [...CN_ORDER.map(v => ({ valore: v, testo: CN_LABELS[v] })), { valore: "na", testo: "Non ricordo" }];

/** Voto, posizione e canzoni note (di un concerto, o di un concerto del festival con `prefisso`). */
function Voti({ prefisso }: { prefisso: string }) {
  const { form } = useModulo();
  return (
    <div className="mf-voti">
      <form.Field name={`${prefisso}voto`}>{(f: AnyFieldApi) => <CampoSegmenti f={f} legenda="Voto" opzioni={OPZ_VOTO} segno={<Segno campo={f.name} />} />}</form.Field>
      <form.Field name={`${prefisso}vicinanza`}>{(f: AnyFieldApi) => <CampoSegmenti f={f} legenda="Posizione" opzioni={OPZ_VIC} segno={<Segno campo={f.name} />} />}</form.Field>
      <form.Field name={`${prefisso}canzoniNote`}>{(f: AnyFieldApi) => <CampoSegmenti f={f} legenda="Canzoni note" opzioni={OPZ_CN} segno={<Segno campo={f.name} />} />}</form.Field>
    </div>
  );
}

/** Il concerto è un'apertura: l'artista dell'headliner (solo concerti, "" se no). */
const headlinerDelModulo = (m: ContestoModulo): string => (m.festival ? "" : (m.valori as ValoriConcerto).aperturaDi.trim());

/** Un valore della serata che arriva dall'headliner: in sola lettura, con il perché. */
function DallHeadliner({ etichetta, valore, headliner, campo }: { etichetta: string; valore: string; headliner: string; campo: string }) {
  return (
    <div className="mod-campo" data-campo={campo}>
      <span className="mod-etichetta">{etichetta}</span>
      <p className="mf-dallheadliner">{valore || "—"}</p>
      <span className="mod-hint">Come la serata di {headliner}: si cambia dall'headliner, oppure togli «Apertura di».</span>
      <ErroreDelServer campo={campo} />
    </div>
  );
}

/**
 * «Apertura di…»: facoltativo, mai «da completare». Propone i concerti
 * singoli della stessa data; scelto un headliner, venue e partenza diventano
 * le sue (il server le impone comunque) e la serata conta una volta.
 */
function CampoAperturaDi({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  const d = useDescrizione(f, true);
  const v = m.valori as ValoriConcerto;
  const attuale = String(f.state.value ?? "");
  const proposte = m.headlinerDi(v.date);
  if (m.aperture.length) {
    return (
      <p className="mod-hint mf-aperture" data-campo={f.name}>
        {m.aperture.length === 1 ? "L'ha aperto" : "L'hanno aperto"} {m.aperture.map(a => a.artist).join(", ")}: è l'headliner della serata.
      </p>
    );
  }
  if (!attuale && !proposte.length) return null;
  const scegli = (nome: string) => {
    f.handleChange(nome);
    const h = proposte.find(p => chiaveNome(p.artist ?? "") === chiaveNome(nome));
    if (!h) return;
    m.form.setFieldValue("venue", h.venue);
    m.form.setFieldValue("city", h.city);
    m.form.setFieldValue("from", h.from ?? "");
  };
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Apertura di…
        <Segno campo={f.name} />
      </label>
      <select id={d.id} name={f.name} value={attuale} onChange={e => scegli(e.target.value)} onBlur={f.handleBlur} aria-describedby={d.descritto} aria-invalid={d.invalido}>
        <option value="">— no, è un concerto a sé</option>
        {proposte.map(p => (
          <option key={p.id} value={p.artist ?? ""}>{p.artist} · {p.venue}</option>
        ))}
        {attuale && !proposte.some(p => chiaveNome(p.artist ?? "") === chiaveNome(attuale)) && <option value={attuale}>{attuale}</option>}
      </select>
      <span id={d.idAiuto} className="mod-hint">
        {attuale
          ? "Data, venue e partenza sono quelle dell'headliner: la serata e il viaggio contano una volta. Prezzo, voti e compagni restano di questo concerto."
          : "Facoltativo: se questo artista ha aperto il concerto di un altro la stessa sera."}
      </span>
      <ErroreDelServer campo={f.name} />
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}

/** La venue (due campi, venue e città, scelti insieme), con le venue degli ultimi concerti. */
function CampoVenue() {
  const m = useModulo();
  const { form } = m;
  const headliner = headlinerDelModulo(m);
  if (headliner) return <DallHeadliner etichetta="Venue" campo="venue" headliner={headliner} valore={[m.valori.venue, m.valori.city].filter(Boolean).join(" · ")} />;
  return (
    <VenueScelta
      venue={m.valori.venue}
      city={m.valori.city}
      recenti={m.recenti}
      segno={<Segno campo="venue" />}
      onScegli={(v, c) => {
        form.setFieldValue("venue", v);
        form.setFieldValue("city", c);
      }}
      errore={
        <>
          <form.Field name="venue">{(f: AnyFieldApi) => <ErroriCampo f={f} />}</form.Field>
          <ErroreDelServer campo="venue" />
        </>
      }
    />
  );
}

/** I compagni di un concerto (o di un concerto del festival), con i frequenti. */
function CampoCompagni({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  return (
    <>
      <PersoneScelte
        f={f}
        persone={m.nomi.persone}
        creaSubito={!m.scheda}
        frequenti={compagniFrequenti(m.nomi.personeConConta, (f.state.value as string[]) ?? [])}
        segno={<Segno campo={f.name} />}
      />
      <ErroreDelServer campo={f.name} />
    </>
  );
}

/** Il tour (facoltativo), con i tour già scritti per lo stesso artista. */
function CampoTour({ f, artista }: { f: AnyFieldApi; artista: string }) {
  const m = useModulo();
  return (
    <CampoTesto
      f={f}
      etichetta="Tour"
      segno={<Segno campo={f.name} />}
      aiuto="Facoltativo: il nome del tour come in locandina; vuoto per una data fuori tour"
      maxLength={120}
      suggerimenti={m.tourDi(artista)}
    />
  );
}

/* ── le parti del concerto ────────────────────────────────────── */

function SerataConcerto() {
  const m = useModulo();
  const { form } = m;
  const headliner = headlinerDelModulo(m);
  return (
    <Parte id="serata" titolo="La serata">
      <div className="mod-griglia">
        <form.Field name="artist">
          {(f: AnyFieldApi) => <CampoTesto f={f} etichetta="Artista" segno={<Segno campo="artist" />} aiuto={descrizione(C.artist)} maxLength={120} autoFocus={m.autofocus === "campo"} />}
        </form.Field>
        <form.Field name="date">
          {(f: AnyFieldApi) => (
            <CampoTesto
              f={f}
              etichetta="Data"
              tipo="date"
              segno={<Segno campo="date" />}
              readOnly={!!headliner}
              aiuto={headliner ? <>La data della serata di {headliner}.{m.inProgramma && <> <InProgramma /></>}</> : m.inProgramma ? <InProgramma /> : undefined}
            />
          )}
        </form.Field>
      </div>
      <form.Field name="tour">{(f: AnyFieldApi) => <CampoTour f={f} artista={(m.valori as ValoriConcerto).artist} />}</form.Field>
      <form.Field name="aperturaDi">{(f: AnyFieldApi) => <CampoAperturaDi f={f} />}</form.Field>
      <CampoVenue />
      <form.Field name="with">{(f: AnyFieldApi) => <CampoCompagni f={f} />}</form.Field>
    </Parte>
  );
}

/** «Com'è andata», in fondo: i voti (solo di un concerto: quelli del festival sono nelle sue schede), la partenza, il commento. */
function ComEAndata() {
  const m = useModulo();
  const mancano = m.mancanti.filter(c => c === "voto" || c === "vicinanza" || c === "canzoniNote" || c === "from");
  return (
    <Parte id="andata" titolo="Com'è andata" mancano={mancano.length > 0}>
      <Mancano campi={mancano} />
      {!m.festival && <Voti prefisso="" />}
      <m.form.Field name="from">{(f: AnyFieldApi) => <CampoPartenza f={f} />}</m.form.Field>
      <m.form.Field name="comments">{(f: AnyFieldApi) => <CampoCommento f={f} />}</m.form.Field>
    </Parte>
  );
}

/* ── le parti del festival ────────────────────────────────────── */

function SerataFestival() {
  const m = useModulo();
  const { form } = m;
  return (
    <Parte id="serata" titolo="La serata">
      <div className="mod-griglia">
        <form.Field name="name">
          {(f: AnyFieldApi) => <CampoTesto f={f} etichetta="Nome del festival" segno={<Segno campo="name" />} aiuto={descrizione(F.name)} maxLength={120} autoFocus={m.autofocus === "campo"} />}
        </form.Field>
        <form.Field name="date">
          {(f: AnyFieldApi) => (
            <CampoTesto
              f={f}
              etichetta="Data"
              segno={<Segno campo="date" />}
              placeholder="gg/mm/aaaa o 30–31/05/2026"
              aiuto={<>Più giorni: «30–31/05/2026».{m.inProgramma && <> <InProgramma /></>}</>}
            />
          )}
        </form.Field>
      </div>
      <CampoVenue />
    </Parte>
  );
}

/** Un concerto del festival: una scheda con l'intestazione che la apre e la chiude. */
function SetFestival({ f, i }: { f: AnyFieldApi; i: number }) {
  const m = useModulo();
  const { form } = m;
  const sets = f.state.value as ValoriSet[];
  const s = sets[i];
  const aperto = m.setAperti.has(i);
  const idCorpo = `${m.prefisso}-set-${i}`;
  const mancano = m.mancanti.filter(c => c.startsWith(`concerts[${i}].`));
  const sposta = (j: number) => {
    f.moveValue(i, j);
    m.scambia(i, j);
  };
  return (
    <li className="mod-set" data-aperto={aperto ? "" : undefined}>
      <div className="mod-set-testa">
        <button type="button" className="mf-set-apri" aria-expanded={aperto} aria-controls={idCorpo} onClick={() => m.espandi(i, !aperto)}>
          <Icon name="chevron" size={16} stroke={2} />
          <span className="mod-set-n">{i + 1}</span>
          <span className="mf-set-titolo">{s.artist.trim() || "Senza artista"}</span>
          {s.voto !== undefined && <span className="mf-set-voto" role="img" aria-label={`voto ${s.voto}`}>{"★".repeat(s.voto)}</span>}
          {mancano.length > 0 && <span className="mf-salto-punto" role="img" aria-label="manca qualcosa" />}
        </button>
        <button type="button" className="mod-icona" aria-label="Sposta su" disabled={i === 0} onClick={() => sposta(i - 1)}>
          <Icon name="arrowUp" size={14} stroke={2} />
        </button>
        <button type="button" className="mod-icona" aria-label="Sposta giù" disabled={i === sets.length - 1} onClick={() => sposta(i + 1)}>
          <Icon name="arrowDown" size={14} stroke={2} />
        </button>
        <button
          type="button"
          className="mod-icona"
          aria-label="Togli questo concerto"
          disabled={sets.length <= 2}
          onClick={() => {
            void f.removeValue(i);
            m.rimuovi(i);
          }}
        >
          <Icon name="close" size={14} stroke={2} />
        </button>
      </div>
      <div className="mod-set-corpo" id={idCorpo} hidden={!aperto}>
        <div className="mod-griglia">
          <form.Field name={`concerts[${i}].artist`}>{(c: AnyFieldApi) => <CampoTesto f={c} etichetta="Artista" segno={<Segno campo={c.name} />} maxLength={120} />}</form.Field>
          <form.Field name={`concerts[${i}].date`}>{(c: AnyFieldApi) => <CampoTesto f={c} etichetta="Giorno (se diverso)" tipo="date" segno={<Segno campo={c.name} />} />}</form.Field>
        </div>
        <form.Field name={`concerts[${i}].tour`}>{(c: AnyFieldApi) => <CampoTour f={c} artista={s.artist} />}</form.Field>
        <form.Field name={`concerts[${i}].with`}>{(c: AnyFieldApi) => <CampoCompagni f={c} />}</form.Field>
        <Mancano campi={mancano} />
        <Voti prefisso={`concerts[${i}].`} />
      </div>
    </li>
  );
}

function ConcertiFestival() {
  const m = useModulo();
  const mancano = m.mancanti.some(c => c.startsWith("concerts["));
  return (
    <Parte id="concerti" titolo="Concerti del festival" mancano={mancano}>
      <p className="mod-hint">{descrizione(F.concerts)}. Voti e compagni sono di ogni concerto; biglietto, viaggio e commento del festival.</p>
      <m.form.Field name="concerts" mode="array">
        {(f: AnyFieldApi) => (
          <ol className="mod-lineup">
            {(f.state.value as ValoriSet[]).map((_, i) => (
              <SetFestival key={i} f={f} i={i} />
            ))}
            <li className="mf-lineup-fondo" data-campo="concerts">
              <button
                type="button"
                className="mod-btn"
                onClick={() => {
                  const n = (f.state.value as ValoriSet[]).length;
                  f.pushValue(nuovoSet());
                  m.espandi(n, true);
                }}
              >
                <Icon name="plus" size={15} stroke={2} />
                Aggiungi un concerto
              </button>
              <ErroriCampo f={f} />
            </li>
          </ol>
        )}
      </m.form.Field>
    </Parte>
  );
}

/* ── biglietto, partenza, commento (concerti e festival) ──────── */

/** «Regalato da»: i "regalato da" della pagina (uno nuovo della scheda dell'Oracolo resta tra le scelte). */
function CampoRegalo({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  const d = useDescrizione(f, true);
  const v = String(f.state.value ?? "");
  const noto = !v || m.nomi.regali.some(g => chiaveNome(g.label) === chiaveNome(v));
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Regalato da
        <Segno campo={f.name} />
      </label>
      <select id={d.id} name={f.name} value={v} onChange={e => f.handleChange(e.target.value)} aria-describedby={d.descritto} aria-invalid={d.invalido}>
        <option value="">Non lo dico</option>
        {m.nomi.regali.map(g => <option key={g.id} value={g.label}>{g.label}</option>)}
        {!noto && <option value={v}>{v} (nuovo)</option>}
      </select>
      <span id={d.idAiuto} className="mod-hint">
        Si aggiunge e si cambia in{" "}
        <button type="button" className="mf-link-testo" onClick={() => m.vai("regali")}>«Regalato da»</button>.
      </span>
      <ErroreDelServer campo={f.name} />
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}

/** Com'è andata col biglietto: sceglie quali campi contano (cost, gift/giftFrom, accredito) e svuota gli altri. */
type ModoBiglietto = "nonRicordo" | "prezzo" | "accredito" | "regalato";
const MODI_BIGLIETTO: { modo: ModoBiglietto; testo: string }[] = [
  { modo: "nonRicordo", testo: "Non ricordo il prezzo" },
  { modo: "prezzo", testo: "Ricordo il prezzo" },
  { modo: "accredito", testo: "Accredito" },
  { modo: "regalato", testo: "Regalato" },
];
const modoBiglietto = (v: { cost?: number | "na"; gift: boolean; accredito: boolean }): ModoBiglietto =>
  v.gift ? "regalato" : v.accredito ? "accredito" : v.cost === "na" ? "nonRicordo" : "prezzo";

function Biglietto() {
  const m = useModulo();
  const { form } = m;
  // non `${prefisso}-biglietto`: quello è l'id della parte (il fieldset)
  const id = `${m.prefisso}-modo-biglietto`;
  const modo = modoBiglietto(m.valori);
  const scegli = (nuovo: ModoBiglietto) => {
    const costo = m.valori.cost;
    form.setFieldValue("cost", nuovo === "nonRicordo" ? "na" : nuovo === "prezzo" && typeof costo === "number" ? costo : undefined);
    form.setFieldValue("gift", nuovo === "regalato");
    form.setFieldValue("accredito", nuovo === "accredito");
    if (nuovo !== "regalato") form.setFieldValue("giftFrom", "");
  };
  return (
    <Parte id="biglietto" titolo="Biglietto">
      <div className="mod-campo" data-campo="biglietto">
        {/* la legenda della parte dice già «Biglietto»: l'etichetta resta per lo screen reader */}
        <label className="mf-sr" htmlFor={id}>Biglietto</label>
        <Segno campo="gift" />
        <Segno campo="accredito" />
        <select id={id} value={modo} onChange={e => scegli(e.target.value as ModoBiglietto)}>
          {MODI_BIGLIETTO.map(o => <option key={o.modo} value={o.modo}>{o.testo}</option>)}
        </select>
        {modo === "accredito" && <span className="mod-hint">{descrizione(C.accredito)}</span>}
      </div>
      {modo === "prezzo" && <form.Field name="cost">{(f: AnyFieldApi) => <CampoCosto f={f} segno={<Segno campo="cost" />} />}</form.Field>}
      {modo === "regalato" && <form.Field name="giftFrom">{(f: AnyFieldApi) => <CampoRegalo f={f} />}</form.Field>}
    </Parte>
  );
}

/** Il valore della voce «Nuova partenza…» della tendina (mai un nome: i nomi non iniziano con un a capo). */
const NUOVA_PARTENZA = "\n nuova";

/**
 * «Partito da»: mai precompilata (vuota = «—»); per un concerto nuovo la scorciatoia «Come l'ultimo: X».
 * «Nuova partenza…» apre un campo per il nome: la partenza si crea subito (nella scheda dell'Oracolo la crea il salvataggio).
 */
function CampoPartenza({ f }: { f: AnyFieldApi }) {
  const headliner = headlinerDelModulo(useModulo());
  if (headliner) return <DallHeadliner etichetta="Partito da" campo={f.name} headliner={headliner} valore={String(f.state.value ?? "")} />;
  return <ScegliPartenza f={f} />;
}

function ScegliPartenza({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  const d = useDescrizione(f, true);
  const convex = useConvex();
  const op = useOperazione();
  const [nuova, setNuova] = useState<string | null>(null);
  const v = String(f.state.value ?? "");
  const p = m.nomi.partenze.find(x => chiaveNome(x.name) === chiaveNome(v));
  const ultima = m.ultima && m.nomi.partenze.some(x => chiaveNome(x.name) === chiaveNome(m.ultima!)) ? m.ultima : null;
  const e = m.evento;
  // i km di adesso, se la partenza è quella salvata; altrimenti si ricalcolano al salvataggio
  const km = !e || !v ? null : chiaveNome(e.from ?? "") !== chiaveNome(v) ? "I km si ricalcolano al salvataggio." : e.kmPending ? "km in attesa" : e.km !== undefined ? `Ora: ${e.km} km` : null;

  const nome = (nuova ?? "").trim();
  const esistente = m.nomi.partenze.find(x => chiaveNome(x.name) === chiaveNome(nome));
  const indirizzo = nome !== "" && sembraIndirizzo(nome);
  const chiudiNuova = () => {
    setNuova(null);
    op.setErrore(null);
  };
  const aggiungi = async () => {
    if (!nome || indirizzo) return;
    if (!esistente && !m.scheda) {
      const r = await op.esegui(() => convex.mutation(api.departures.add, { name: nome }));
      if (!r) return;
    }
    f.handleChange(esistente?.name ?? nome);
    chiudiNuova();
  };

  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Partito da
        <Segno campo={f.name} />
      </label>
      <select
        id={d.id}
        name={f.name}
        value={nuova !== null ? NUOVA_PARTENZA : v}
        onChange={e => {
          if (e.target.value === NUOVA_PARTENZA) return setNuova("");
          chiudiNuova();
          f.handleChange(e.target.value);
        }}
        onBlur={f.handleBlur}
        aria-describedby={d.descritto}
        aria-invalid={d.invalido}
      >
        <option value="">—</option>
        {m.nomi.partenze.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
        {v && !p && <option value={v}>{v} (nuova)</option>}
        <option value={NUOVA_PARTENZA}>+ Nuova partenza…</option>
      </select>
      {nuova !== null && (
        <div className="mf-nuova-partenza">
          <div className="mod-riga">
            <input
              value={nuova}
              placeholder="Es. Casa, Ufficio, Casa dei miei"
              aria-label="Nome della nuova partenza"
              maxLength={40}
              autoFocus
              aria-invalid={indirizzo}
              onChange={e => setNuova(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void aggiungi();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  chiudiNuova();
                }
              }}
            />
            <button type="button" className="mod-btn mod-primario" disabled={!nome || indirizzo || op.inCorso} onClick={() => void aggiungi()}>
              {esistente ? "Scegli" : "Aggiungi"}
            </button>
            <button type="button" className="mod-btn mf-btn-fantasma" onClick={chiudiNuova}>Annulla</button>
          </div>
          <span className="mod-hint">
            {indirizzo
              ? "Sembra un indirizzo: il nome della partenza è pubblico. Usa un nome come «Casa»; l'indirizzo lo imposti dopo in «Partenze» e resta privato."
              : esistente
                ? `«${esistente.name}» c'è già: «Scegli» la usa.`
                : "Solo un nome, visibile sulla pagina. L'indirizzo, che resta privato, lo imposti dopo in «Partenze»: fino ad allora i km restano in attesa."}
          </span>
          <Errore errore={op.errore} />
        </div>
      )}
      {!v && nuova === null && ultima && (
        <div className="mf-rapidi">
          <button type="button" className="mf-rapido" onClick={() => f.handleChange(ultima)}>Come l'ultimo: {ultima}</button>
        </div>
      )}
      <span id={d.idAiuto} className="mod-hint">
        {p?.stato === "mancante"
          ? "Questa partenza non ha ancora un indirizzo: i km restano in attesa finché non lo imposti in «Partenze»."
          : "I km li calcola il server dalla partenza e dalla venue."}
        {km && <span className="mf-km"> {km}</span>}
      </span>
      {p?.stato === "mancante" && (
        <button type="button" className="mod-link" onClick={() => m.vai("partenze", { indirizzo: p.id })}>Imposta l'indirizzo di {p.name}</button>
      )}
      <ErroreDelServer campo={f.name} />
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}

function CampoCommento({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  const d = useDescrizione(f, true);
  const n = String(f.state.value ?? "").length;
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Commento
        <Segno campo="comments" />
      </label>
      <textarea
        id={d.id}
        name={f.name}
        rows={3}
        maxLength={2000}
        value={(f.state.value as string) ?? ""}
        onChange={e => f.handleChange(e.target.value)}
        onBlur={f.handleBlur}
        aria-describedby={d.descritto}
        aria-invalid={d.invalido}
      />
      <span id={d.idAiuto} className="mod-hint">
        {m.festival ? "Ricordo libero di tutta la serata (del festival, non di un set)" : descrizione(C.comments)}
        {n > 1500 && ` · ${n}/2000`}
      </span>
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}

/* ── i due form ───────────────────────────────────────────────── */

export function CampiConcerto() {
  return (
    <>
      <SerataConcerto />
      <Biglietto />
      <ComEAndata />
    </>
  );
}

export function CampiFestival() {
  return (
    <>
      <SerataFestival />
      <ConcertiFestival />
      <Biglietto />
      <ComEAndata />
    </>
  );
}
