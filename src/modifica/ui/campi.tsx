/* ──────────────────────────────────────────────────────────────
   I pezzi piccoli delle viste di /<handle>/modifica (spec ux-modifica
   §5.5): la barra degli strumenti di un elenco (cerca, filtri, ordine,
   conteggio), lo stato vuoto, le scelte a segmenti dei form, la testa
   delle schede di impostazioni, la loro barra di salvataggio e la guardia
   che le protegge.
   Caricamento, RigheSegnaposto ed ErroreVista stanno in comuni.tsx.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { useBlocker } from "@tanstack/react-router";
import type { AnyFieldApi } from "@tanstack/react-form";
import { Icon } from "../../ui/Icon.tsx";
import { Conferma, ErroriCampo, useDescrizione } from "../sezioni/comuni.tsx";

/* ── barra degli strumenti ────────────────────────────────────── */

export interface Opzione {
  valore: string;
  testo: string;
  /** Il numero accanto al filtro. */
  conta?: number;
}

/**
 * La barra sopra un elenco, ferma sotto la barra in alto mentre si scorre:
 * la ricerca (che `/` raggiunge da ovunque nella vista), i filtri a
 * pastiglie (radio veri), l'ordine e quanti sono («84 eventi», «12 di 84»).
 * La sua altezza va in `--mf-strumenti-h` sul contenitore: i separatori
 * fermi dell'elenco (gli anni di #concerti) si fermano subito sotto.
 */
export function BarraStrumenti({ cerca, filtri, ordina, conta, children }: {
  /** `breve`: il segnaposto quando quello intero non ci sta (una colonna stretta), invece di tagliarlo a metà parola. */
  cerca?: { etichetta: string; segnaposto?: string; breve?: string; valore: string; onCambia: (v: string) => void };
  filtri?: { etichetta: string; valore: string; opzioni: Opzione[]; onCambia: (v: string) => void };
  ordina?: { valore: string; opzioni: Opzione[]; onCambia: (v: string) => void };
  conta?: string;
  /** Altri filtri (un anno, «Con X ×»), dopo le pastiglie. */
  children?: ReactNode;
}) {
  const nome = useId();
  const barra = useRef<HTMLDivElement>(null);
  const [ferma, setFerma] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const corto = useSegnapostoCorto(campo, cerca?.segnaposto, cerca?.breve);
  // il bordo sotto compare solo quando la barra è ferma in alto (il suo bordo superiore esce dalla zona sotto la barra dell'app)
  useEffect(() => {
    const b = barra.current;
    if (!b) return;
    const alto = parseFloat(getComputedStyle(b).getPropertyValue("--mf-barra-h")) || 64;
    const io = new IntersectionObserver(([e]) => setFerma(e.intersectionRatio < 1 && e.boundingClientRect.top <= alto + 1), {
      rootMargin: `-${alto + 1}px 0px 0px 0px`,
      threshold: [1],
    });
    io.observe(b);
    const su = b.parentElement;
    const ro = new ResizeObserver(() => su?.style.setProperty("--mf-strumenti-h", `${Math.round(b.offsetHeight)}px`));
    ro.observe(b);
    return () => {
      io.disconnect();
      ro.disconnect();
    };
  }, []);
  return (
    <div ref={barra} className="mf-strumenti" data-ferma={ferma ? "" : undefined}>
      <div className="mf-strumenti-riga">
        {cerca && (
          <label className="mf-cerca">
            <Icon name="search" size={16} stroke={1.8} />
            <input
              ref={campo}
              type="search"
              aria-label={cerca.etichetta}
              placeholder={corto ? cerca.breve : cerca.segnaposto}
              value={cerca.valore}
              onChange={e => cerca.onCambia(e.target.value)}
              aria-keyshortcuts="/"
              title={`${cerca.etichetta} (scorciatoia: /)`}
              autoComplete="off"
            />
            <kbd className="mf-cerca-tasto" aria-hidden="true">/</kbd>
          </label>
        )}
        {ordina && (
          <select className="mf-ordina" aria-label="Ordina" value={ordina.valore} onChange={e => ordina.onCambia(e.target.value)}>
            {ordina.opzioni.map(o => <option key={o.valore} value={o.valore}>{o.testo}</option>)}
          </select>
        )}
        {conta && <span className="mf-strumenti-conta" aria-live="polite">{conta}</span>}
      </div>
      {(filtri || children) && (
        <div className="mf-strumenti-filtri">
          {filtri && (
            <div className="mf-chips" role="radiogroup" aria-label={filtri.etichetta}>
              {filtri.opzioni.map(o => (
                <label key={o.valore} className="mf-chip">
                  <input type="radio" name={nome} value={o.valore} checked={filtri.valore === o.valore} onChange={() => filtri.onCambia(o.valore)} />
                  <span>{o.testo}</span>
                  {o.conta !== undefined && <span className="mf-chip-conta">{o.conta}</span>}
                </label>
              ))}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/** Il segnaposto intero non entra nel campo (misurato col suo font): meglio quello breve. */
function useSegnapostoCorto(campo: RefObject<HTMLInputElement | null>, intero?: string, breve?: string): boolean {
  const [corto, setCorto] = useState(false);
  useEffect(() => {
    const i = campo.current;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!i || !intero || !breve || !ctx) return;
    const ro = new ResizeObserver(() => {
      const st = getComputedStyle(i);
      ctx.font = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;
      const spazio = i.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
      setCorto(ctx.measureText(intero).width > spazio);
    });
    ro.observe(i);
    return () => ro.disconnect();
  }, [campo, intero, breve]);
  return corto;
}

/* ── stato vuoto ──────────────────────────────────────────────── */

/** Un elenco senza niente (o senza risultati): cosa fare adesso. */
export function Vuoto({ icona, titolo, testo, azioni }: { icona?: string; titolo: string; testo?: ReactNode; azioni?: ReactNode }) {
  return (
    <div className="mf-vuoto">
      {icona && (
        <span className="mf-vuoto-icona" aria-hidden="true">
          <Icon name={icona} size={22} stroke={1.6} />
        </span>
      )}
      <p className="mf-vuoto-titolo">{titolo}</p>
      {testo && <p className="mf-vuoto-testo">{testo}</p>}
      {azioni && <div className="mf-vuoto-azioni">{azioni}</div>}
    </div>
  );
}

/* ── scelte a segmenti ────────────────────────────────────────── */

/**
 * Una scelta facoltativa tra poche voci (voto, posizione, canzoni note):
 * radio veri, ognuno steso sulla sua pastiglia (il bersaglio è l'input
 * stesso; le frecce funzionano da sole), e «Togli» per tornare a niente.
 */
export function CampoSegmenti({ f, legenda, opzioni, aiuto, segno }: {
  f: AnyFieldApi;
  legenda: string;
  /** `nome`: il nome accessibile se il testo non basta («5 stelle» per ★★★★★). */
  opzioni: { valore: number | string; testo: ReactNode; nome?: string }[];
  aiuto?: ReactNode;
  /** Accanto alla legenda (es. «proposto dall'Oracolo»). */
  segno?: ReactNode;
}) {
  const d = useDescrizione(f, !!aiuto);
  const v = f.state.value as number | string | undefined;
  const scelto = v === undefined || v === "" ? undefined : String(v);
  return (
    <fieldset className="mf-segmenti" data-campo={f.name} aria-invalid={d.invalido} aria-describedby={d.descritto}>
      <legend className="mod-etichetta">
        {legenda}
        {segno}
      </legend>
      <div className="mf-segmenti-scelte">
        {opzioni.map(o => (
          <label key={String(o.valore)} className="mf-segmento">
            <input
              type="radio"
              name={f.name}
              value={String(o.valore)}
              checked={scelto === String(o.valore)}
              onChange={() => f.handleChange(o.valore)}
              onBlur={f.handleBlur}
              aria-label={o.nome}
            />
            <span>{o.testo}</span>
          </label>
        ))}
        {scelto !== undefined && (
          <button
            type="button"
            className="mod-link mf-segmenti-togli"
            aria-label={`Togli ${legenda.toLowerCase()}`}
            onClick={e => {
              // «Togli» sparisce col valore: il focus passa alla prima scelta del gruppo, non si perde sul body
              e.currentTarget.closest("fieldset")?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
              f.handleChange(undefined);
            }}
          >
            Togli
          </button>
        )}
      </div>
      {aiuto && <span id={d.idAiuto} className="mod-hint">{aiuto}</span>}
      <ErroriCampo f={f} id={d.idErrore} />
    </fieldset>
  );
}

/* ── schede delle impostazioni (Stile, Agenti, Account) ───────── */

/** La testa di una scheda: il titolo (un h2 sotto l'h1 della vista) e, a destra, un'azione. */
export function TestaImpostazione({ id, titolo, children }: { id: string; titolo: ReactNode; children?: ReactNode }) {
  return (
    <div className="mf-impostazione-testa">
      <h2 id={id} className="mf-impostazione-titolo">{titolo}</h2>
      {children}
    </div>
  );
}

/* ── salvataggio delle impostazioni ───────────────────────────── */

/**
 * La barra in fondo a una scheda di impostazioni (Stile, Account): resta
 * in vista mentre si scorre la scheda. Attiva solo con modifiche (anche se
 * hanno errori: il clic li mostra).
 */
export function SalvaBarra({ sporco, inCorso, etichetta = "Salva", modulo, onAnnulla }: {
  sporco: boolean;
  inCorso?: boolean;
  etichetta?: string;
  /** L'id del form (se la barra non ci sta dentro). */
  modulo?: string;
  onAnnulla: () => void;
}) {
  return (
    <div className="mf-salva-barra" data-sporco={sporco ? "" : undefined}>
      {sporco && <span className="mf-sporco">Modifiche non salvate</span>}
      <div className="mf-salva-azioni">
        <button type="button" className="mod-btn mf-btn-fantasma" disabled={!sporco || inCorso} onClick={onAnnulla}>Annulla le modifiche</button>
        <button type="submit" form={modulo} className="mod-btn mod-primario" disabled={!sporco || inCorso}>{inCorso ? "Salvo…" : etichetta}</button>
      </div>
    </div>
  );
}

/**
 * La guardia di una vista di impostazioni con modifiche non salvate:
 * chiede prima di lasciare /modifica (o di chiudere la scheda del
 * browser). Cambiare vista invece non chiede: la vista resta montata e le
 * modifiche restano lì. `dove` è il titolo della vista: la domanda può
 * arrivare mentre se ne guarda un'altra. Restituisce la finestra di
 * conferma, da rendere, e `lascia`, da chiamare prima di un'uscita voluta
 * (un handle nuovo ricarica la pagina subito dopo il salvataggio: niente
 * domanda del browser).
 */
export function useGuardiaImpostazioni(sporco: boolean, dove: string): [ReactNode, () => void] {
  const sporcoRef = useRef(sporco);
  sporcoRef.current = sporco;
  const libera = useRef(false);
  const blocca = () => sporcoRef.current && !libera.current;
  const blocco = useBlocker({
    shouldBlockFn: ({ current, next }) => blocca() && current.pathname !== next.pathname,
    enableBeforeUnload: blocca,
    withResolver: true,
  });
  const lascia = useCallback(() => {
    libera.current = true;
  }, []);
  const conferma =
    blocco.status === "blocked" ? (
      <Conferma
        titolo="Modifiche non salvate"
        etichetta="Esci senza salvare"
        annulla="Continua a modificare"
        onConferma={() => blocco.proceed()}
        onChiudi={() => blocco.reset()}
      >
        <p>Le modifiche in «{dove}» non sono salvate: se esci adesso le perdi.</p>
      </Conferma>
    ) : null;
  return [conferma, lascia];
}
