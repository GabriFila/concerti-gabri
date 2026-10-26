/* ──────────────────────────────────────────────────────────────
   I campi del form di un concerto o di un festival (#concerti, spec
   ux-modifica §6.2), dentro il pannello di ConcertoPannello.tsx. Il form
   è diviso in parti con la loro legenda, raggiungibili dai salti nella
   testa del pannello:
   - «La serata»: artista, data (con «in programma»), venue, con chi; per
     un festival nome, data (anche più giorni) e venue;
   - «Com'è andata»: voto, posizione e canzoni note a pastiglie (radio
     veri, CampoSegmenti, con i nomi di sempre: `voto`, `vicinanza`,
     `canzoniNote`, `concerts[i].voto`…); per un festival le schede dei
     suoi concerti, ognuna con artista, giorno, compagni e voti;
   - «Biglietto», «Viaggio», «Commento».

   - Con la data in programma «Com'è andata» si chiude in «Si compila
     dopo la serata.» + «Compila adesso»: i campi restano montati,
     nascosti. A un evento passato a cui manca qualcosa la parte si segna
     in ambra con «Mancano: …».
   - Un festival con più di tre concerti li mostra chiusi (si aprono uno a
     uno, e da soli se hanno un errore); i campi restano montati.
   - Scorciatoie a un tocco: «Usate di recente» per la venue, «Frequenti»
     per i compagni, «Come l'ultimo: X» per la partenza di un concerto
     nuovo (la partenza non si precompila mai).
   - I campi proposti dall'Oracolo (`evidenzia` del ponte, editor.tsx)
     hanno un punto ambra e «proposto dall'Oracolo» per lo screen reader.
   - Gli errori del server con un `campo` stanno sotto quel campo.
   Lo stato (valori, espansioni, mancanti, errori) arriva dal pannello con
   il contesto del modulo.
   ────────────────────────────────────────────────────────────── */

import { createContext, useContext, type ComponentType, type ReactNode } from "react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { CN_LABELS, CN_ORDER, VIC_LABELS, VIC_ORDER } from "../../../shared/model/scale.ts";
import { concertoInput, festivalInput } from "../../../shared/schema/entry.ts";
import { Icon } from "../../ui/Icon.tsx";
import { CampoSegmenti } from "../ui/campi.tsx";
import type { IdVista, Parametri } from "../vista.ts";
import { CampoCosto, PersoneScelte, VenueScelta, type useNomi } from "./campiConcerto.tsx";
import { CampoTesto, Errore, ErroriCampo, useDescrizione, type ErroreUi } from "./comuni.tsx";
import {
  chiaveNome, compagniFrequenti, descrizione, etichettaCampo, nuovoSet, type EventoUi, type ValoriConcerto, type ValoriFestival, type ValoriSet,
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
  /** La partenza dell'ultimo concerto, solo per un concerto nuovo. */
  ultima: string | null;
  /** La data è oggi o dopo. */
  inProgramma: boolean;
  /** I campi che a un evento passato mancano (campiMancanti di forme.ts). */
  mancanti: string[];
  evidenzia: ReadonlySet<string>;
  /** L'errore del server sul suo campo (campoDaServer), se ce n'è uno. */
  erroreServer: { campo: string; errore: ErroreUi } | null;
  /** «Com'è andata» aperta anche con la data in programma. */
  andataAperta: boolean;
  /** I concerti del festival aperti (per indice). */
  setAperti: ReadonlySet<number>;
  espandi: (k: "andata" | number, aperto: boolean) => void;
  /** Le schede aperte seguono i concerti spostati o tolti. */
  scambia: (i: number, j: number) => void;
  rimuovi: (i: number) => void;
  /** Il prefisso degli id delle parti (i salti della testa). */
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

/* ── le parti e i salti ───────────────────────────────────────── */

const PARTI_CONCERTO = [
  { id: "serata", testo: "La serata" },
  { id: "andata", testo: "Com'è andata" },
  { id: "biglietto", testo: "Biglietto" },
  { id: "viaggio", testo: "Viaggio" },
  { id: "commento", testo: "Commento" },
] as const;
const PARTI_FESTIVAL = [
  { id: "serata", testo: "La serata" },
  { id: "concerti", testo: "Concerti" },
  { id: "biglietto", testo: "Biglietto" },
  { id: "viaggio", testo: "Viaggio" },
  { id: "commento", testo: "Commento" },
] as const;

/** Una parte del form manca di qualcosa (il punto ambra del suo salto). */
const mancaNellaParte = (parte: string, mancanti: string[]) =>
  parte === "andata"
    ? mancanti.some(c => c === "voto" || c === "vicinanza" || c === "canzoniNote")
    : parte === "concerti"
      ? mancanti.some(c => c.startsWith("concerts["))
      : parte === "viaggio" && mancanti.includes("from");

/** Porta a una parte del form: scorre il pannello fin lì e ci mette il focus. */
function vaiAllaParte(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const lento = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "start", behavior: lento ? "smooth" : "auto" });
  el.focus({ preventScroll: true });
}

/** I salti alle parti del form, nella testa del pannello; un punto ambra dove manca qualcosa. */
export function SaltiModulo({ festival, prefisso, mancanti }: { festival: boolean; prefisso: string; mancanti: string[] }) {
  return (
    <nav className="mf-salti" aria-label="Parti del modulo">
      {(festival ? PARTI_FESTIVAL : PARTI_CONCERTO).map(p => (
        <button key={p.id} type="button" className="mf-salto" onClick={() => vaiAllaParte(`${prefisso}-${p.id}`)}>
          {p.testo}
          {mancaNellaParte(p.id, mancanti) && <span className="mf-salto-punto" role="img" aria-label="manca qualcosa" />}
        </button>
      ))}
    </nav>
  );
}

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

/** Una parte del form: fieldset con la legenda, raggiungibile dai salti. */
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

/**
 * I voti di una serata ancora in programma: chiusi in «Si compila dopo la
 * serata.» finché non si chiede «Compila adesso» (i campi restano montati).
 */
function DopoLaSerata({ id, chiusa, children }: { id: string; chiusa: boolean; children: ReactNode }) {
  const m = useModulo();
  const apri = () => {
    m.espandi("andata", true);
    // il pulsante sparisce: il focus va alla prima scelta
    setTimeout(() => document.getElementById(id)?.querySelector<HTMLElement>("input")?.focus(), 0);
  };
  return (
    <>
      {chiusa && (
        <div className="mf-dopo">
          <p>Si compila dopo la serata.</p>
          <button type="button" className="mod-btn" onClick={apri}>Compila adesso</button>
        </div>
      )}
      <div id={id} className="mf-andata" hidden={chiusa}>
        {children}
      </div>
    </>
  );
}

/** La venue (due campi, venue e città, scelti insieme), con le venue degli ultimi concerti. */
function CampoVenue() {
  const m = useModulo();
  const { form } = m;
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

/* ── le parti del concerto ────────────────────────────────────── */

function SerataConcerto() {
  const m = useModulo();
  const { form } = m;
  return (
    <Parte id="serata" titolo="La serata">
      <div className="mod-griglia">
        <form.Field name="artist">
          {(f: AnyFieldApi) => <CampoTesto f={f} etichetta="Artista" segno={<Segno campo="artist" />} aiuto={descrizione(C.artist)} maxLength={120} autoFocus={m.autofocus === "campo"} />}
        </form.Field>
        <form.Field name="date">
          {(f: AnyFieldApi) => <CampoTesto f={f} etichetta="Data" tipo="date" segno={<Segno campo="date" />} aiuto={m.inProgramma ? <InProgramma /> : undefined} />}
        </form.Field>
      </div>
      <CampoVenue />
      <form.Field name="with">{(f: AnyFieldApi) => <CampoCompagni f={f} />}</form.Field>
    </Parte>
  );
}

function ComEAndata() {
  const m = useModulo();
  const v = m.valori as ValoriConcerto;
  const mancano = m.mancanti.filter(c => c === "voto" || c === "vicinanza" || c === "canzoniNote");
  const chiusa = m.inProgramma && !m.andataAperta && v.voto === undefined && v.vicinanza === undefined && v.canzoniNote === undefined;
  return (
    <Parte id="andata" titolo="Com'è andata" mancano={mancano.length > 0}>
      {!chiusa && <Mancano campi={mancano} />}
      <DopoLaSerata id={`${m.prefisso}-voti`} chiusa={chiusa}>
        <Voti prefisso="" />
      </DopoLaSerata>
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
  const chiusa = m.inProgramma && !m.andataAperta && s.voto === undefined && s.vicinanza === undefined && s.canzoniNote === undefined;
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
        <form.Field name={`concerts[${i}].with`}>{(c: AnyFieldApi) => <CampoCompagni f={c} />}</form.Field>
        {!chiusa && <Mancano campi={mancano} />}
        <DopoLaSerata id={`${idCorpo}-voti`} chiusa={chiusa}>
          <Voti prefisso={`concerts[${i}].`} />
        </DopoLaSerata>
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

/* ── biglietto, viaggio, commento (concerti e festival) ───────── */

function Spunta({ f, testo, titolo }: { f: AnyFieldApi; testo: string; titolo?: string }) {
  return (
    <label className="mod-spunta" title={titolo}>
      <input type="checkbox" name={f.name} checked={!!f.state.value} onChange={e => f.handleChange(e.target.checked)} />
      {testo}
      <Segno campo={f.name} />
    </label>
  );
}

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

function Biglietto() {
  const m = useModulo();
  const { form } = m;
  return (
    <Parte id="biglietto" titolo="Biglietto">
      <form.Field name="cost">{(f: AnyFieldApi) => <CampoCosto f={f} segno={<Segno campo="cost" />} />}</form.Field>
      <div className="mod-riga mod-riga-spunte">
        <form.Field name="gift">{(f: AnyFieldApi) => <Spunta f={f} testo="Regalato" />}</form.Field>
        <form.Field name="accredito">{(f: AnyFieldApi) => <Spunta f={f} testo="Accredito o lista ospiti" titolo={descrizione(C.accredito)} />}</form.Field>
      </div>
      {m.valori.gift && <form.Field name="giftFrom">{(f: AnyFieldApi) => <CampoRegalo f={f} />}</form.Field>}
    </Parte>
  );
}

/** «Partito da»: mai precompilata; per un concerto nuovo la scorciatoia «Come l'ultimo: X». */
function CampoPartenza({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  const d = useDescrizione(f, true);
  const v = String(f.state.value ?? "");
  const p = m.nomi.partenze.find(x => chiaveNome(x.name) === chiaveNome(v));
  const ultima = m.ultima && m.nomi.partenze.some(x => chiaveNome(x.name) === chiaveNome(m.ultima!)) ? m.ultima : null;
  const e = m.evento;
  // i km di adesso, se la partenza è quella salvata; altrimenti si ricalcolano al salvataggio
  const km = !e || !v ? null : chiaveNome(e.from ?? "") !== chiaveNome(v) ? "I km si ricalcolano al salvataggio." : e.kmPending ? "km in attesa" : e.km !== undefined ? `Ora: ${e.km} km` : null;
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Partito da
        <Segno campo={f.name} />
      </label>
      <select id={d.id} name={f.name} value={v} onChange={e => f.handleChange(e.target.value)} onBlur={f.handleBlur} aria-describedby={d.descritto} aria-invalid={d.invalido}>
        <option value="">Non ancora</option>
        {m.nomi.partenze.map(x => <option key={x.id} value={x.name}>{x.name}</option>)}
        {v && !p && <option value={v}>{v} (nuova)</option>}
      </select>
      {!v && ultima && (
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

function Viaggio() {
  const m = useModulo();
  return (
    <Parte id="viaggio" titolo="Viaggio" mancano={m.mancanti.includes("from")}>
      <m.form.Field name="from">{(f: AnyFieldApi) => <CampoPartenza f={f} />}</m.form.Field>
    </Parte>
  );
}

function CampoCommento({ f }: { f: AnyFieldApi }) {
  const m = useModulo();
  const d = useDescrizione(f, true);
  const n = String(f.state.value ?? "").length;
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mf-sr" htmlFor={d.id}>Commento</label>
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

function Commento() {
  const m = useModulo();
  return (
    <Parte id="commento" titolo="Commento" segno={<Segno campo="comments" />}>
      <m.form.Field name="comments">{(f: AnyFieldApi) => <CampoCommento f={f} />}</m.form.Field>
    </Parte>
  );
}

/* ── i due form ───────────────────────────────────────────────── */

export function CampiConcerto() {
  return (
    <>
      <SerataConcerto />
      <ComEAndata />
      <Biglietto />
      <Viaggio />
      <Commento />
    </>
  );
}

export function CampiFestival() {
  return (
    <>
      <SerataFestival />
      <ConcertiFestival />
      <Biglietto />
      <Viaggio />
      <Commento />
    </>
  );
}
