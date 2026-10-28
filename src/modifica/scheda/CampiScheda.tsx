/* ──────────────────────────────────────────────────────────────
   Le righe della scheda dell'Oracolo e i loro editor (spec ux-agente
   §9.5–9.9). Una riga è un pulsante (etichetta e valore): toccandola si
   apre il suo editor lì sotto, uno alla volta. Ogni modifica va subito
   nello store (store.ts) e segna la scheda come «modificata».

   - Esc dentro un editor lo chiude e rimette il valore di prima; lo
     consuma (preventDefault + stopPropagation), così non chiude
     l'Oracolo agganciato.
   - Invio in un testo conferma e passa alla prossima riga vuota.
   - Niente si crea da qui: persone, "regalato da" e partenze nuove
     arrivano al Salva, nello stesso lotto del concerto. Le venue invece
     sono del catalogo condiviso: si scelgono o si aggiungono subito
     (VenueScelta di campiConcerto.tsx, come nel form).
   - Una modifica (diff) mostra solo le righe cambiate, «prima → dopo»;
     «Mostra gli altri campi» apre le altre, e cambiarne una la aggiunge.
   - La lineup di un festival: una riga compatta per concerto («1 ·
     Verdena · sab 30 · con Lu · ★★★★★»), che si apre nel suo editor
     (artista, giorno, con, voto, posizione, canzoni note); «Aggiungi un
     concerto»; ↑ ↓ per riordinare (solo schede nuove) e × per togliere
     (spento a due concerti). In una modifica sopra la lineup ci sono le
     sue differenze («+ Afterhours», «− Calcutta», «Verdena: voto …»).
   ────────────────────────────────────────────────────────────── */

import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { CN_LABELS, CN_ORDER, VIC_LABELS, VIC_ORDER } from "../../../shared/model/scale.ts";
import { isPlanned } from "../../../shared/lib/dates.ts";
import { chiaveNome, sembraIndirizzo, simili } from "../../../shared/lib/nomi.ts";
import { fmtBiglietto } from "../../../shared/schema/proposta.ts";
import { VenueScelta } from "../sezioni/campiConcerto.tsx";
import { componendo } from "../../chat/parti.tsx";
import { Soprannomi } from "../sezioni/comuni.tsx";
import type { ValoriConcerto, ValoriFestival, ValoriSet } from "../sezioni/forme.ts";
import {
  CAMPO_DI_DIFFERENZA, ETICHETTE, conSetInPiu, differenzeScheda, distanza, dopoDi, giornoLungo, senzaSet, spostaSet, statoNome,
  type CampoScheda, type ContestoScheda,
} from "./bozza.ts";
import { annullaEditor, apriEditor, cambia, type VoceScheda } from "./store.ts";

/** Le liste di nomi del proprietario (undefined finché non arrivano). */
export interface NomiScheda {
  persone?: string[];
  partenze?: ContestoScheda["partenze"];
  regali?: string[];
}

interface PropsCampi {
  /** L'id della chiamata (la chiave nello store). */
  id: string;
  voce: VoceScheda;
  nomi: NomiScheda;
  oggi: number;
  /** In sola lettura (pronta, in salvataggio). */
  sola: boolean;
}

/* ── pezzi ────────────────────────────────────────────────────── */

/** Testo solo per gli screen reader. */
export const Sr = ({ children }: { children: ReactNode }) => <span className="scheda-sr">{children}</span>;

const Stelle = ({ n }: { n: number }) => (
  <>
    <span aria-hidden="true" className="scheda-stelle">{"★".repeat(n)}</span> {n}
  </>
);

/** Il nome della riga (data-riga) nella scheda: per tornarci col focus. */
const selettoreRiga = (id: string, campo: CampoScheda) => `[data-scheda="${CSS.escape(id)}"] [data-riga="${campo}"]`;

export function focusRiga(id: string, campo: CampoScheda) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selettoreRiga(id, campo))?.focus({ preventScroll: true }));
}

/** Dopo aver aperto un editor da fuori (Da sistemare, Mancano): il focus resta nel suo campo (autoFocus), altrimenti sulla riga. */
export function focusEditor(id: string, campo: CampoScheda) {
  requestAnimationFrame(() => {
    if (document.activeElement?.closest(`[data-scheda="${CSS.escape(id)}"] .scheda-editor`)) return;
    document.querySelector<HTMLElement>(selettoreRiga(id, campo))?.focus({ preventScroll: true });
  });
}

/** Il focus sulla riga di un concerto del festival (o su «Aggiungi un concerto» se non c'è). */
export function focusSet(id: string, i: number) {
  requestAnimationFrame(() => {
    const scheda = document.querySelector(`[data-scheda="${CSS.escape(id)}"]`);
    (scheda?.querySelector<HTMLElement>(`[data-set="${i}"]`) ?? scheda?.querySelector<HTMLElement>("[data-riga=concerts]"))?.focus({ preventScroll: true });
  });
}

/** L'ordine delle righe (lo stesso per nuovi e modifiche). */
export function righeDi(tipo: VoceScheda["tipo"]): CampoScheda[] {
  return tipo === "festival"
    ? ["name", "date", "venue", "concerts", "biglietto", "from", "comments"]
    : ["artist", "date", "venue", "with", "voto", "vicinanza", "canzoniNote", "biglietto", "from", "comments"];
}

/** Il valore mostrato in una riga; null = vuoto («+ aggiungi»). */
function valoreDi(campo: CampoScheda, voce: VoceScheda, nomi: NomiScheda): ReactNode | null {
  const v = voce.valori;
  const c = v as ValoriConcerto;
  switch (campo) {
    case "artist":
      return c.artist.trim() || null;
    case "name":
      return (v as ValoriFestival).name.trim() || null;
    case "date":
      return v.date.trim() ? (voce.tipo === "concert" ? giornoLungo(v.date) || v.date : v.date) : null;
    case "venue":
      return v.venue.trim() ? `${v.venue.trim()}${v.city.trim() ? ` · ${v.city.trim()}` : ""}` : null;
    case "voto":
      return c.voto ? <Stelle n={c.voto} /> : null;
    case "vicinanza":
      return c.vicinanza ? `${c.vicinanza} · ${VIC_LABELS[c.vicinanza]}` : null;
    case "canzoniNote":
      return c.canzoniNote === undefined ? null : c.canzoniNote === "na" ? "Non ricordo" : `${c.canzoniNote} · ${CN_LABELS[c.canzoniNote]}`;
    case "biglietto": {
      const b = fmtBiglietto({ cost: v.cost, gift: v.gift, accredito: v.accredito });
      if (b === "—") return null;
      return v.gift && v.giftFrom.trim() ? `${b} da ${v.giftFrom.trim()}` : b;
    }
    case "from": {
      const da = v.from.trim();
      if (!da) return null;
      const p = nomi.partenze?.find(x => chiaveNome(x.name) === chiaveNome(da));
      return `${p?.name ?? da} · ${!nomi.partenze ? "…" : !p ? "nuova" : p.stato === "impostato" ? "indirizzo impostato" : "senza indirizzo"}`;
    }
    case "comments": {
      const t = v.comments.replace(/\s+/g, " ").trim();
      return t ? `«${t.length > 80 ? `${t.slice(0, 79)}…` : t}»` : null;
    }
    default:
      return null;
  }
}

/* ── una riga ─────────────────────────────────────────────────── */

/** Esc dentro un editor: chiude, rimette com'era e lo consuma (l'Oracolo agganciato non si chiude). */
const escEditor = (id: string, campo: CampoScheda) => (e: KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== "Escape" || componendo(e)) return;
  e.preventDefault();
  e.stopPropagation();
  annullaEditor(id);
  focusRiga(id, campo);
};

/** «prima → dopo» di una modifica (con «prima:» e «dopo:» per gli screen reader). */
function Cambi({ diff }: { diff: { prima: string; dopo: string }[] }) {
  return (
    <>
      {diff.map((d, i) => (
        <span key={i} className="scheda-cambio">
          {d.prima && (
            <>
              <s className="scheda-prima"><Sr>prima: </Sr>{d.prima}</s>
              <span aria-hidden="true"> → </span>
            </>
          )}
          <b className="scheda-dopo"><Sr>dopo: </Sr>{d.dopo}</b>
        </span>
      ))}
    </>
  );
}

const Tuo = () => (
  <span className="scheda-tuo" title="Modificato da te">
    <span aria-hidden="true"> ✎</span>
    <Sr> (modificato da te)</Sr>
  </span>
);

function RigaCampo({ id, voce, campo, valore, sola, diff, muta, children }: {
  id: string;
  voce: VoceScheda;
  campo: CampoScheda;
  valore: ReactNode | null;
  sola: boolean;
  /** Le righe «prima → dopo» di una modifica. */
  diff?: { prima: string; dopo: string }[];
  muta?: boolean;
  children?: ReactNode;
}) {
  const aperto = voce.editorAperto === campo;
  const idEditor = `${useId()}-editor`;
  const etichetta = ETICHETTE[campo];
  const tuo = voce.toccati.includes(campo);
  return (
    <div className={"scheda-riga" + (aperto ? " aperta" : "") + (muta ? " muta" : "") + (diff ? " diff" : "")}>
      <button
        type="button"
        className="scheda-riga-btn"
        data-riga={campo}
        aria-expanded={children ? aperto : undefined}
        aria-controls={children && aperto ? idEditor : undefined}
        aria-label={valore === null && !diff ? `Aggiungi ${etichetta.toLowerCase()}` : undefined}
        disabled={sola || !children}
        onClick={() => apriEditor(id, aperto ? null : campo)}
      >
        <span className="scheda-etichetta">{etichetta}</span>
        <span className="scheda-valore">
          {diff ? <Cambi diff={diff} /> : valore === null ? <span className="scheda-aggiungi">+ aggiungi</span> : valore}
          {tuo && <Tuo />}
        </span>
        {children && !sola && <span className="scheda-matita" aria-hidden="true">✎</span>}
      </button>
      {aperto && children && (
        <div className="scheda-editor" id={idEditor} onKeyDown={escEditor(id, campo)}>
          {children}
        </div>
      )}
    </div>
  );
}

/** «Con»: i chip dei compagni (ognuno con la sua ✕) e «+ aggiungi», che apre l'editor. */
function RigaPersone({ id, voce, nomi, sola, diff, muta }: {
  id: string;
  voce: VoceScheda;
  nomi: NomiScheda;
  sola: boolean;
  diff?: { prima: string; dopo: string }[];
  muta?: boolean;
}) {
  const aperto = voce.editorAperto === "with";
  const idEditor = `${useId()}-editor`;
  const con = (voce.valori as ValoriConcerto).with;
  return (
    <div className={"scheda-riga scheda-con" + (aperto ? " aperta" : "") + (muta ? " muta" : "") + (diff ? " diff" : "")}>
      <div className="scheda-con-testa">
        <span className="scheda-etichetta">{ETICHETTE.with}</span>
        <div className="scheda-valore">
          {diff && <Cambi diff={diff} />}
          <ChipsPersone id={id} voce={voce} nomi={nomi} sola={sola} />
          {sola ? (
            !con.length && !diff && <span>—</span>
          ) : (
            <button
              type="button"
              className="scheda-aggiungi scheda-aggiungi-btn"
              data-riga="with"
              aria-expanded={aperto}
              aria-controls={aperto ? idEditor : undefined}
              aria-label={con.length ? "Aggiungi un altro compagno" : "Aggiungi compagni"}
              onClick={() => apriEditor(id, aperto ? null : "with")}
            >
              + aggiungi
            </button>
          )}
          {voce.toccati.includes("with") && <Tuo />}
        </div>
      </div>
      {aperto && (
        <div className="scheda-editor" id={idEditor} onKeyDown={escEditor(id, "with")}>
          <EditorPersone id={id} voce={voce} nomi={nomi} />
        </div>
      )}
    </div>
  );
}

/* ── editor ───────────────────────────────────────────────────── */

/** Invio conferma e apre la prossima riga vuota (o torna alla riga). */
function useAvanti(id: string, voce: VoceScheda, nomi: NomiScheda, campo: CampoScheda) {
  return () => {
    const righe = righeDi(voce.tipo);
    const dopo = righe.slice(righe.indexOf(campo) + 1).find(c => c !== "concerts" && valoreDi(c, voce, nomi) === null);
    if (dopo) apriEditor(id, dopo);
    else {
      apriEditor(id, null);
      focusRiga(id, campo);
    }
  };
}

function EditorTesto({ id, voce, nomi, campo, max, placeholder }: { id: string; voce: VoceScheda; nomi: NomiScheda; campo: "artist" | "name"; max: number; placeholder: string }) {
  const avanti = useAvanti(id, voce, nomi, campo);
  const valore = campo === "artist" ? (voce.valori as ValoriConcerto).artist : (voce.valori as ValoriFestival).name;
  return (
    <input
      className="scheda-input"
      autoFocus
      value={valore}
      maxLength={max}
      placeholder={placeholder}
      aria-label={ETICHETTE[campo]}
      onChange={e => cambia(id, campo, () => ({ [campo]: e.target.value }))}
      onKeyDown={e => {
        if (e.key === "Enter" && !componendo(e)) {
          e.preventDefault();
          avanti();
        }
      }}
    />
  );
}

function EditorData({ id, voce, nomi, oggi }: { id: string; voce: VoceScheda; nomi: NomiScheda; oggi: number }) {
  const avanti = useAvanti(id, voce, nomi, "date");
  const v = voce.valori.date;
  const festival = voce.tipo === "festival";
  // un concerto ha un giorno solo: il selettore di data; un festival (o una data che non si legge) il testo
  const nativo = !festival && (v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v));
  const giorno = giornoLungo(v);
  const quando = distanza(v, oggi);
  return (
    <>
      <input
        className="scheda-input"
        autoFocus
        type={nativo ? "date" : "text"}
        value={v}
        maxLength={24}
        placeholder={festival ? "gg/mm/aaaa o 30–31/05/2026" : "gg/mm/aaaa"}
        aria-label="Data"
        onChange={e => cambia(id, "date", () => ({ date: e.target.value }))}
        onKeyDown={e => {
          if (e.key === "Enter" && !componendo(e)) {
            e.preventDefault();
            avanti();
          }
        }}
      />
      {giorno && <span className="mod-hint">{[giorno, quando].filter(Boolean).join(" · ")}</span>}
    </>
  );
}

function EditorVenue({ id, voce, fuoriCatalogo }: { id: string; voce: VoceScheda; fuoriCatalogo: boolean }) {
  const v = voce.valori;
  return (
    <VenueScelta
      // da sistemare (ambigua, senza città, un indirizzo) si parte da nome e città scritti; altrimenti la scelta attuale con «Cambia»
      venue={fuoriCatalogo ? "" : v.venue}
      city={fuoriCatalogo ? "" : v.city}
      iniziale={fuoriCatalogo ? { venue: v.venue, city: v.city } : undefined}
      onScegli={(venue, city) => {
        cambia(id, "venue", () => ({ venue, city }));
        apriEditor(id, null);
        focusRiga(id, "venue");
      }}
    />
  );
}

const minuscola = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Il chip tolto sparisce col suo ✕: il focus al ✕ accanto, altrimenti a «+ aggiungi» (o al campo del nome). */
function togliChip(e: MouseEvent<HTMLButtonElement>, togli: () => void) {
  const li = e.currentTarget.closest("li");
  const vicino = (li?.nextElementSibling ?? li?.previousElementSibling)?.querySelector<HTMLElement>("button");
  const riquadro = li?.closest(".scheda-con, .mod-campo");
  togli();
  requestAnimationFrame(() => {
    const att = document.activeElement;
    if (att && att !== document.body && att.isConnected) return;
    (vicino?.isConnected ? vicino : riquadro?.querySelector<HTMLElement>('[data-riga="with"], input.scheda-input'))?.focus({ preventScroll: true });
  });
}

/** I compagni scelti, come chip: esistente, nuova (tratteggiata) o da sistemare (⚠). Ognuno si toglie. */
function Chips({ con, nomi, nomiOk, sola, onTogli }: { con: string[]; nomi: NomiScheda; nomiOk: string[]; sola: boolean; onTogli: (n: string) => void }) {
  if (!con.length) return null;
  return (
    <ul className="scheda-chips" aria-label="Compagni">
      {con.map(n => {
        const s = statoNome(n, nomi.persone, nomiOk);
        return (
          <li key={n} className="scheda-chip" data-stato={s}>
            {s === "problema" && <span aria-hidden="true">⚠ </span>}
            {n}
            {s === "nuovo" && <span className="scheda-chip-nota"> nuova</span>}
            {s === "problema" && <Sr> (da sistemare)</Sr>}
            {!sola && (
              <button type="button" aria-label={`Togli ${n}`} onClick={e => togliChip(e, () => onTogli(n))}>
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChipsPersone({ id, voce, nomi, sola }: { id: string; voce: VoceScheda; nomi: NomiScheda; sola: boolean }) {
  const con = (voce.valori as ValoriConcerto).with;
  return (
    <Chips con={con} nomi={nomi} nomiOk={voce.nomiOk} sola={sola} onTogli={n => cambia(id, "with", v => ({ with: (v.valori as ValoriConcerto).with.filter(x => x !== n) }))} />
  );
}

/** Aggiungere compagni: un nome (con l'elenco delle persone), «Forse:» per i simili. Niente si crea qui: al Salva. */
function AggiungiCompagni({ con, nomi, onAggiungi, etichetta = "Aggiungi un compagno", autoFocus = true }: {
  con: string[];
  nomi: NomiScheda;
  onAggiungi: (n: string) => void;
  etichetta?: string;
  autoFocus?: boolean;
}) {
  const [testo, setTesto] = useState("");
  const lista = useId();
  const persone = nomi.persone ?? [];
  const scelti = new Set(con.map(chiaveNome));
  const nome = testo.trim();
  const trovato = persone.find(p => chiaveNome(p) === chiaveNome(nome));
  const forse = nome.length >= 2 && !trovato ? simili(nome, persone).filter(p => !scelti.has(chiaveNome(p))) : [];
  const aggiungi = (n: string) => {
    if (!n) return;
    if (!scelti.has(chiaveNome(n))) onAggiungi(n);
    setTesto("");
  };
  return (
    <>
      <div className="mod-riga">
        <input
          className="scheda-input"
          autoFocus={autoFocus}
          list={lista}
          value={testo}
          maxLength={40}
          placeholder="Un nome o un soprannome"
          aria-label={etichetta}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !componendo(e)) {
              e.preventDefault();
              aggiungi(trovato ?? nome);
            }
          }}
        />
        <button type="button" className="mod-btn" disabled={!nome} onClick={() => aggiungi(trovato ?? nome)}>Aggiungi</button>
      </div>
      <datalist id={lista}>
        {persone.filter(p => !scelti.has(chiaveNome(p))).map(p => <option key={p} value={p} />)}
      </datalist>
      {forse.length > 0 && (
        <div className="mod-riga">
          <span className="mod-hint">Forse:</span>
          {forse.map(p => (
            <button key={p} type="button" className="mod-btn" onClick={() => aggiungi(p)}>{p}</button>
          ))}
        </div>
      )}
      {nome && !trovato && <span className="mod-hint">«{nome}» non è ancora tra le tue persone: si aggiunge quando salvi la scheda.</span>}
      <Soprannomi />
    </>
  );
}

function EditorPersone({ id, voce, nomi }: { id: string; voce: VoceScheda; nomi: NomiScheda }) {
  const con = (voce.valori as ValoriConcerto).with;
  return <AggiungiCompagni con={con} nomi={nomi} onAggiungi={n => cambia(id, "with", v => ({ with: [...(v.valori as ValoriConcerto).with, n] }))} />;
}

/** «Togli» sparisce col valore: il focus alla prima opzione del gruppo. */
function togliScelta(gruppo: { current: HTMLElement | null }, togli: () => void) {
  togli();
  requestAnimationFrame(() => gruppo.current?.querySelector<HTMLElement>("input")?.focus({ preventScroll: true }));
}

/** Una scelta tra chip (radio nativi: frecce, Tab e lettori di schermo come un gruppo). */
function Scelta<T extends number | string>({ id, nome, etichetta, opzioni, valore, onScegli, autoFocus = true }: {
  id: string;
  nome: string;
  etichetta: string;
  opzioni: { v: T; testo: ReactNode; sr?: string }[];
  valore: T | undefined;
  onScegli: (v: T | undefined) => void;
  autoFocus?: boolean;
}) {
  const gruppo = useRef<HTMLDivElement>(null);
  return (
    <div className="scheda-scelta">
      <div className="scheda-chips" role="radiogroup" aria-label={etichetta} ref={gruppo}>
        {opzioni.map((o, i) => (
          <label key={String(o.v)} className="scheda-opzione" data-scelta={valore === o.v || undefined}>
            <input
              type="radio"
              name={`${id}-${nome}`}
              checked={valore === o.v}
              onChange={() => onScegli(o.v)}
              aria-label={o.sr}
              autoFocus={autoFocus && (valore === o.v || (valore === undefined && i === 0))}
            />
            <span>{o.testo}</span>
          </label>
        ))}
      </div>
      {valore !== undefined && (
        <button type="button" className="mod-link" onClick={() => togliScelta(gruppo, () => onScegli(undefined))} aria-label={`Togli ${minuscola(etichetta)}`}>Togli</button>
      )}
    </div>
  );
}

/** Le stelle del voto (radio «1 stella»…«5 stelle»), con «Togli». */
function SceltaVoto({ id, nome, etichetta = "Voto", valore, onScegli, autoFocus = true }: {
  id: string;
  nome: string;
  etichetta?: string;
  valore: number | undefined;
  onScegli: (v: ValoriConcerto["voto"]) => void;
  autoFocus?: boolean;
}) {
  const gruppo = useRef<HTMLDivElement>(null);
  return (
    <div className="scheda-scelta">
      <div className="scheda-stelline" role="radiogroup" aria-label={etichetta} ref={gruppo}>
        {[1, 2, 3, 4, 5].map(n => (
          <label key={n} className="scheda-stellina" data-piena={(valore ?? 0) >= n || undefined}>
            <input
              type="radio"
              name={`${id}-${nome}`}
              checked={valore === n}
              aria-label={n === 1 ? "1 stella" : `${n} stelle`}
              autoFocus={autoFocus && (valore === n || (!valore && n === 1))}
              onChange={() => onScegli(n as ValoriConcerto["voto"])}
            />
            <span aria-hidden="true">★</span>
          </label>
        ))}
      </div>
      {valore !== undefined && (
        <button type="button" className="mod-link" onClick={() => togliScelta(gruppo, () => onScegli(undefined))} aria-label={`Togli ${minuscola(etichetta)}`}>Togli</button>
      )}
    </div>
  );
}

const OPZ_VIC = VIC_ORDER.map(n => ({ v: n, testo: `${n} · ${VIC_LABELS[n]}` }));
const OPZ_CN: { v: number | string; testo: string }[] = [...CN_ORDER.map(n => ({ v: n, testo: `${n} · ${CN_LABELS[n]}` })), { v: "na", testo: "Non ricordo" }];

function EditorVoto({ id, voce }: { id: string; voce: VoceScheda }) {
  return <SceltaVoto id={id} nome="voto" valore={(voce.valori as ValoriConcerto).voto} onScegli={n => cambia(id, "voto", () => ({ voto: n }))} />;
}

function EditorBiglietto({ id, voce, nomi }: { id: string; voce: VoceScheda; nomi: NomiScheda }) {
  const v = voce.valori;
  const iniziale = v.accredito ? "accredito" : v.gift ? "regalo" : v.cost !== undefined ? "pagato" : null;
  const [modo, setModo] = useState<"pagato" | "regalo" | "accredito" | null>(iniziale);
  const regali = nomi.regali ?? [];
  const daNoto = regali.find(r => chiaveNome(r) === chiaveNome(v.giftFrom));
  const [nuovo, setNuovo] = useState(!!v.giftFrom.trim() && !daNoto);
  const idPrezzo = useId();
  const gruppo = useRef<HTMLDivElement>(null);
  const scegli = (m: "pagato" | "regalo" | "accredito") => {
    setModo(m);
    if (m === "pagato") cambia(id, "biglietto", () => ({ gift: false, giftFrom: "", accredito: false }));
    if (m === "regalo") cambia(id, "biglietto", () => ({ gift: true, accredito: false, cost: undefined }));
    if (m === "accredito") cambia(id, "biglietto", () => ({ accredito: true, gift: false, giftFrom: "", cost: undefined }));
  };
  return (
    <div className="scheda-biglietto">
      <div className="scheda-chips" role="radiogroup" aria-label="Biglietto" ref={gruppo}>
        {(["pagato", "regalo", "accredito"] as const).map(m => (
          <label key={m} className="scheda-opzione" data-scelta={modo === m || undefined}>
            <input type="radio" name={`${id}-biglietto`} checked={modo === m} onChange={() => scegli(m)} autoFocus={modo === m || (!modo && m === "pagato")} />
            <span>{m === "pagato" ? "Pagato" : m === "regalo" ? "Regalo" : "Accredito"}</span>
          </label>
        ))}
      </div>
      {modo === "pagato" && (
        <div className="mod-riga">
          <label className="scheda-prezzo" htmlFor={idPrezzo}>
            <input
              id={idPrezzo}
              className="scheda-input"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.01}
              value={typeof v.cost === "number" ? v.cost : ""}
              disabled={v.cost === "na"}
              aria-label="Prezzo in euro, commissioni comprese"
              onChange={e => cambia(id, "biglietto", () => ({ cost: e.target.value === "" ? undefined : Number(e.target.value) }))}
            />
            <span aria-hidden="true">€</span>
          </label>
          <label className="mod-spunta">
            <input type="checkbox" checked={v.cost === "na"} onChange={e => cambia(id, "biglietto", () => ({ cost: e.target.checked ? "na" : undefined }))} />
            Pagato, prezzo dimenticato
          </label>
        </div>
      )}
      {modo === "regalo" && (
        <div className="mod-campo">
          <label className="mod-etichetta" htmlFor={`${idPrezzo}-da`}>Regalato da</label>
          <select
            id={`${idPrezzo}-da`}
            value={nuovo ? "__nuovo" : (daNoto ?? "")}
            onChange={e => {
              const x = e.target.value;
              setNuovo(x === "__nuovo");
              cambia(id, "biglietto", () => ({ giftFrom: x === "__nuovo" ? "" : x }));
            }}
          >
            <option value="">Non lo dico</option>
            {regali.map(r => <option key={r} value={r}>{r}</option>)}
            <option value="__nuovo">Nuovo…</option>
          </select>
          {nuovo && (
            <>
              <input
                className="scheda-input"
                autoFocus
                value={v.giftFrom}
                maxLength={60}
                placeholder="Chi te l'ha regalato"
                aria-label="Nuovo “regalato da”"
                onChange={e => cambia(id, "biglietto", () => ({ giftFrom: e.target.value }))}
              />
              <span className="mod-hint">Si aggiunge ai tuoi “regalato da” quando salvi la scheda.</span>
              <Soprannomi />
            </>
          )}
        </div>
      )}
      {modo && (
        <button type="button" className="mod-link" onClick={() => togliScelta(gruppo, () => {
          setModo(null);
          setNuovo(false);
          cambia(id, "biglietto", () => ({ cost: undefined, gift: false, giftFrom: "", accredito: false }));
        })}>Togli</button>
      )}
    </div>
  );
}

function EditorPartenza({ id, voce, nomi }: { id: string; voce: VoceScheda; nomi: NomiScheda }) {
  const partenze = nomi.partenze ?? [];
  const da = voce.valori.from;
  const nota = partenze.find(p => chiaveNome(p.name) === chiaveNome(da));
  const [nuova, setNuova] = useState(!!da.trim() && !nota);
  const indirizzo = nuova && da.trim() && sembraIndirizzo(da);
  return (
    <div className="mod-campo">
      <select
        aria-label="Partenza"
        autoFocus={!nuova}
        value={nuova ? "__nuova" : (nota?.name ?? "")}
        onChange={e => {
          const x = e.target.value;
          setNuova(x === "__nuova");
          cambia(id, "from", () => ({ from: x === "__nuova" ? "" : x }));
        }}
      >
        <option value="">Nessuna</option>
        {partenze.map(p => (
          <option key={p.name} value={p.name}>{p.name} · {p.stato === "impostato" ? "indirizzo impostato" : "senza indirizzo"}</option>
        ))}
        <option value="__nuova">Nuova partenza…</option>
      </select>
      {nuova && (
        <>
          <input
            className="scheda-input"
            autoFocus
            value={da}
            maxLength={40}
            placeholder="Un nome, es. Casa o Ufficio"
            aria-label="Nome della nuova partenza"
            aria-invalid={indirizzo || undefined}
            onChange={e => cambia(id, "from", () => ({ from: e.target.value }))}
          />
          <span className={indirizzo ? "mod-campo-errore" : "mod-hint"}>
            {indirizzo
              ? "Sembra un indirizzo: il nome della partenza è pubblico. Usa un nome come «Casa» e l'indirizzo impostalo in Partenze."
              : "Solo il nome, che è pubblico: l'indirizzo si imposta in Partenze, e i km arrivano allora."}
          </span>
        </>
      )}
    </div>
  );
}

function EditorCommento({ id, voce }: { id: string; voce: VoceScheda }) {
  const v = voce.valori.comments;
  return (
    <>
      <textarea
        className="scheda-input"
        autoFocus
        rows={3}
        value={v}
        maxLength={2000}
        aria-label="Commento"
        placeholder="Il tuo ricordo della serata"
        onChange={e => cambia(id, "comments", () => ({ comments: e.target.value }))}
      />
      <span className="mod-hint">{v.length}/2000 · solo con le tue parole</span>
    </>
  );
}

/** L'editor di una riga. */
function EditorCampo({ campo, id, voce, nomi, oggi, fuoriCatalogo }: { campo: CampoScheda; id: string; voce: VoceScheda; nomi: NomiScheda; oggi: number; fuoriCatalogo: boolean }) {
  const c = voce.valori as ValoriConcerto;
  switch (campo) {
    case "artist":
      return <EditorTesto id={id} voce={voce} nomi={nomi} campo="artist" max={120} placeholder="Come in locandina" />;
    case "name":
      return <EditorTesto id={id} voce={voce} nomi={nomi} campo="name" max={120} placeholder="Es. MI AMI 2026" />;
    case "date":
      return <EditorData id={id} voce={voce} nomi={nomi} oggi={oggi} />;
    case "venue":
      return <EditorVenue id={id} voce={voce} fuoriCatalogo={fuoriCatalogo} />;
    case "with":
      return <EditorPersone id={id} voce={voce} nomi={nomi} />;
    case "voto":
      return <EditorVoto id={id} voce={voce} />;
    case "vicinanza":
      return (
        <Scelta
          id={id}
          nome="vicinanza"
          etichetta="Posizione"
          opzioni={OPZ_VIC}
          valore={c.vicinanza}
          onScegli={n => cambia(id, "vicinanza", () => ({ vicinanza: n as ValoriConcerto["vicinanza"] }))}
        />
      );
    case "canzoniNote":
      return (
        <Scelta<number | string>
          id={id}
          nome="canzoni"
          etichetta="Canzoni note"
          opzioni={OPZ_CN}
          valore={c.canzoniNote}
          onScegli={n => cambia(id, "canzoniNote", () => ({ canzoniNote: n as ValoriConcerto["canzoniNote"] }))}
        />
      );
    case "biglietto":
      return <EditorBiglietto id={id} voce={voce} nomi={nomi} />;
    case "from":
      return <EditorPartenza id={id} voce={voce} nomi={nomi} />;
    case "comments":
      return <EditorCommento id={id} voce={voce} />;
    default:
      return null;
  }
}

/* ── la lineup di un festival ─────────────────────────────────── */

/** «1 · Verdena · sab 30 · con Lu»: la riga compatta di un concerto del festival (il voto a parte). */
function rigaSet(s: ValoriSet, i: number): string {
  const parti = [`${i + 1}`, s.artist.trim() || "Senza artista"];
  if (s.date) parti.push(giornoLungo(s.date).split(" ").slice(0, 2).join(" "));
  if (s.with.length) parti.push(`con ${s.with.join(", ")}`);
  return parti.join(" · ");
}

/** Cambia il concerto i del festival (la riga «Concerti» prende la ✎). */
const cambiaSet = (id: string, i: number, f: (s: ValoriSet) => Partial<ValoriSet>) =>
  cambia(id, "concerts", v => ({ concerts: (v.valori as ValoriFestival).concerts.map((s, j) => (j === i ? { ...s, ...f(s) } : s)) }));

/** L'editor di un concerto del festival: artista, giorno, con, voto, posizione, canzoni note. */
function EditorSet({ id, voce, nomi, i }: { id: string; voce: VoceScheda; nomi: NomiScheda; i: number }) {
  const s = (voce.valori as ValoriFestival).concerts[i];
  const idCampo = useId();
  if (!s) return null;
  const chi = s.artist.trim() || `concerto ${i + 1}`;
  return (
    <div className="scheda-set-editor">
      <div className="mod-campo">
        <label className="scheda-etichetta" htmlFor={`${idCampo}-a`}>Artista</label>
        <input
          id={`${idCampo}-a`}
          className="scheda-input"
          autoFocus
          value={s.artist}
          maxLength={120}
          placeholder="Come in locandina"
          onChange={e => cambiaSet(id, i, () => ({ artist: e.target.value }))}
          onKeyDown={e => {
            if (e.key === "Enter" && !componendo(e)) {
              e.preventDefault();
              apriEditor(id, null);
              focusSet(id, i);
            }
          }}
        />
      </div>
      <div className="mod-campo">
        <label className="scheda-etichetta" htmlFor={`${idCampo}-g`}>Giorno (se diverso)</label>
        <input
          id={`${idCampo}-g`}
          className="scheda-input"
          type="date"
          value={s.date}
          onChange={e => cambiaSet(id, i, () => ({ date: e.target.value }))}
        />
      </div>
      <div className="mod-campo">
        <span className="scheda-etichetta">Con</span>
        <Chips con={s.with} nomi={nomi} nomiOk={voce.nomiOk} sola={false} onTogli={n => cambiaSet(id, i, x => ({ with: x.with.filter(y => y !== n) }))} />
        <AggiungiCompagni
          con={s.with}
          nomi={nomi}
          autoFocus={false}
          etichetta={`Aggiungi un compagno a ${chi}`}
          onAggiungi={n => cambiaSet(id, i, x => ({ with: [...x.with, n] }))}
        />
      </div>
      <div className="mod-campo">
        <span className="scheda-etichetta">Voto</span>
        <SceltaVoto id={`${id}-${i}`} nome="voto" etichetta={`Voto di ${chi}`} autoFocus={false} valore={s.voto} onScegli={n => cambiaSet(id, i, () => ({ voto: n }))} />
      </div>
      <div className="mod-campo">
        <span className="scheda-etichetta">Posizione</span>
        <Scelta
          id={`${id}-${i}`}
          nome="vicinanza"
          etichetta={`Posizione di ${chi}`}
          autoFocus={false}
          opzioni={OPZ_VIC}
          valore={s.vicinanza}
          onScegli={n => cambiaSet(id, i, () => ({ vicinanza: n as ValoriSet["vicinanza"] }))}
        />
      </div>
      <div className="mod-campo">
        <span className="scheda-etichetta">Canzoni note</span>
        <Scelta<number | string>
          id={`${id}-${i}`}
          nome="canzoni"
          etichetta={`Canzoni note di ${chi}`}
          autoFocus={false}
          opzioni={OPZ_CN}
          valore={s.canzoniNote}
          onScegli={n => cambiaSet(id, i, () => ({ canzoniNote: n as ValoriSet["canzoniNote"] }))}
        />
      </div>
      <button type="button" className="mod-btn scheda-set-fatto" onClick={() => { apriEditor(id, null); focusSet(id, i); }}>Fatto</button>
    </div>
  );
}

/**
 * La riga «Concerti» di un festival: in una modifica le differenze della
 * lineup in cima («+ Afterhours», «− Calcutta», «Verdena: voto — → 5») e
 * i concerti dietro «Mostra i concerti»; in una scheda nuova i concerti
 * subito, ognuno con il suo editor, ↑ ↓ × e «Aggiungi un concerto».
 */
function LineupScheda({ id, voce, nomi, sola, diff }: { id: string; voce: VoceScheda; nomi: NomiScheda; sola: boolean; diff?: string[] }) {
  const sets = (voce.valori as ValoriFestival).concerts;
  const modifica = !!voce.esistente;
  const [mostra, setMostra] = useState(!modifica);
  const aperto = voce.editorAperto === "concerts" ? voce.setAperto : null;
  const idLista = useId();
  const tuo = voce.toccati.includes("concerts");
  const aggiungi = () => {
    cambia(id, "concerts", v => conSetInPiu(v.valori as ValoriFestival));
    apriEditor(id, "concerts", sets.length);
    setMostra(true);
  };
  const togli = (i: number) => {
    cambia(id, "concerts", v => senzaSet(v.valori as ValoriFestival, i));
    focusSet(id, Math.max(0, i - 1));
  };
  const sposta = (i: number, verso: -1 | 1) => {
    cambia(id, "concerts", v => spostaSet(v.valori as ValoriFestival, i, verso));
    focusSet(id, i + verso);
  };
  const elenco = mostra || aperto !== null;
  return (
    <div className={"scheda-riga scheda-lineup" + (diff ? " diff" : "") + (aperto !== null ? " aperta" : "")}>
      <div className="scheda-lineup-testa">
        <span className="scheda-etichetta" data-riga="concerts" tabIndex={-1}>
          {ETICHETTE.concerts}
          {sets.length > 0 && <span className="scheda-muto"> · {sets.length}</span>}
        </span>
        <div className="scheda-valore">
          {diff && (
            <ul className="scheda-righe-lineup">
              {diff.map((d, i) => <li key={i}><b className="scheda-dopo">{d}</b></li>)}
            </ul>
          )}
          {!diff && !sets.length && <span className="scheda-aggiungi">nessuno</span>}
          {tuo && <Tuo />}
          {modifica && sets.length > 0 && (
            <button type="button" className="mod-link scheda-lineup-mostra" aria-expanded={elenco} aria-controls={idLista} onClick={() => setMostra(m => !m)}>
              {elenco ? "Nascondi i concerti" : `Mostra i concerti (${sets.length})`}
            </button>
          )}
        </div>
      </div>
      {elenco && sets.length > 0 && (
        <ol className="scheda-set-lista" id={idLista} aria-label="Concerti del festival">
          {sets.map((s, i) => {
            const aperta = aperto === i;
            const chi = s.artist.trim() || `concerto ${i + 1}`;
            return (
              <li key={i} className={"scheda-set" + (aperta ? " aperta" : "")}>
                <div className="scheda-set-riga">
                  <button
                    type="button"
                    className="scheda-set-btn"
                    data-set={i}
                    aria-expanded={sola ? undefined : aperta}
                    disabled={sola}
                    onClick={() => (aperta ? apriEditor(id, null) : apriEditor(id, "concerts", i))}
                  >
                    <span className={s.artist.trim() ? undefined : "scheda-aggiungi"}>{rigaSet(s, i)}</span>
                    {s.voto ? <span> · <Stelle n={s.voto} /></span> : null}
                  </button>
                  {!sola && (
                    <span className="scheda-set-azioni">
                      {!modifica && (
                        <>
                          <button type="button" className="scheda-icona" aria-label={`Sposta su ${chi}`} disabled={i === 0} onClick={() => sposta(i, -1)}>↑</button>
                          <button type="button" className="scheda-icona" aria-label={`Sposta giù ${chi}`} disabled={i === sets.length - 1} onClick={() => sposta(i, 1)}>↓</button>
                        </>
                      )}
                      <button
                        type="button"
                        className="scheda-icona"
                        aria-label={`Togli ${chi} dal festival`}
                        title={sets.length <= 2 ? "Un festival ha almeno due concerti" : undefined}
                        disabled={sets.length <= 2}
                        onClick={() => togli(i)}
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
                {aperta && !sola && (
                  <div className="scheda-editor" onKeyDown={escSet(id, i)}>
                    <EditorSet id={id} voce={voce} nomi={nomi} i={i} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {!sola && (!modifica || elenco) && (
        <button type="button" className="mod-link scheda-set-aggiungi" onClick={aggiungi}>+ Aggiungi un concerto</button>
      )}
    </div>
  );
}

/** Esc dentro l'editor di un concerto del festival: torna com'era e il focus va alla sua riga. */
const escSet = (id: string, i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
  if (e.key !== "Escape" || componendo(e)) return;
  e.preventDefault();
  e.stopPropagation();
  annullaEditor(id);
  focusSet(id, i);
};

/* ── le righe di una scheda ───────────────────────────────────── */

/**
 * Le righe: tutte per un evento nuovo (in programma voto, posizione e
 * canzoni note stanno chiuse sotto «Dopo la serata»), solo quelle cambiate
 * per una modifica (più le altre con «Mostra gli altri campi»).
 */
export function CampiScheda({ id, voce, nomi, oggi, sola, fuoriCatalogo }: PropsCampi & { fuoriCatalogo: boolean }) {
  const [altri, setAltri] = useState(false);
  const [dopoSerata, setDopoSerata] = useState(false);
  const modifica = !!voce.esistente;
  const diff = modifica ? differenzeScheda(voce) : [];
  const diffDi = (campo: CampoScheda) => diff.filter(d => CAMPO_DI_DIFFERENZA[d.campo] === campo && campo !== "concerts");
  const lineupDiff = diff.filter(d => d.campo === "Concerti").map(d => d.dopo);
  const c = voce.valori as ValoriConcerto;
  const programma = !modifica && voce.tipo === "concert" && isPlanned(dopoDi(voce), oggi) && !!voce.valori.date.trim();
  const fattiVuoti = c.voto === undefined && c.vicinanza === undefined && c.canzoniNote === undefined;
  const chiusiDopo = programma && fattiVuoti && !dopoSerata && !["voto", "vicinanza", "canzoniNote"].includes(voce.editorAperto ?? "");

  const righe: ReactNode[] = [];
  for (const campo of righeDi(voce.tipo)) {
    if (campo === "concerts") {
      if (!modifica || lineupDiff.length || altri || voce.editorAperto === "concerts") {
        righe.push(<LineupScheda key={campo} id={id} voce={voce} nomi={nomi} sola={sola} diff={modifica && lineupDiff.length ? lineupDiff : undefined} />);
      }
      continue;
    }
    if (chiusiDopo && (campo === "voto" || campo === "vicinanza" || campo === "canzoniNote")) {
      if (campo === "voto") {
        righe.push(
          <div key="dopo" className="scheda-riga muta">
            <button type="button" className="scheda-riga-btn" aria-expanded={false} disabled={sola} onClick={() => { setDopoSerata(true); focusRiga(id, "voto"); }}>
              <span className="scheda-etichetta">Dopo la serata</span>
              <span className="scheda-valore">voto, posizione, canzoni note</span>
              <span className="scheda-matita" aria-hidden="true">+</span>
            </button>
          </div>,
        );
      }
      continue;
    }
    const d = diffDi(campo);
    const cambiata = d.length > 0;
    if (modifica && !cambiata && !altri && voce.editorAperto !== campo) continue;
    const valore = valoreDi(campo, voce, nomi);
    if (campo === "with") {
      righe.push(<RigaPersone key={campo} id={id} voce={voce} nomi={nomi} sola={sola} diff={cambiata ? d : undefined} muta={modifica && !cambiata} />);
      continue;
    }
    righe.push(
      <RigaCampo key={campo} id={id} voce={voce} campo={campo} valore={valore} sola={sola} diff={cambiata ? d : undefined} muta={modifica && !cambiata}>
        <EditorCampo campo={campo} id={id} voce={voce} nomi={nomi} oggi={oggi} fuoriCatalogo={fuoriCatalogo} />
      </RigaCampo>,
    );
  }

  return (
    <div className="scheda-righe">
      {righe}
      {modifica && (
        <button type="button" className="mod-link scheda-altri" aria-expanded={altri} onClick={() => setAltri(a => !a)}>
          {altri ? "Nascondi gli altri campi" : "Mostra gli altri campi"}
        </button>
      )}
      {modifica && voce.tipo === "festival" && (
        <p className="mod-hint">Un concerto rinominato qui va in fondo alla lineup: per rinominare o riordinare, salva e poi «Apri» il festival nel modulo.</p>
      )}
    </div>
  );
}
