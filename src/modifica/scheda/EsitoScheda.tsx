/* ──────────────────────────────────────────────────────────────
   Le schede dell'Oracolo dopo la decisione (spec ux-agente §9.4, §9.11):
   la conferma di una scheda salvata, con «Apri» e «Annulla», e le righe
   brevi delle schede scartate, corrette, chiuse o scadute.

   - La conferma legge il concerto dal vivo (entries.get), con l'esito
     dello strumento come ripiego: se intanto è stato cancellato lo dice.
   - «Apri» apre il form del concerto dal ponte dell'editor
     (useEditorConcerti, editor.tsx): sul desktop il pannello a sinistra
     dell'Oracolo, sul telefono il foglio sopra la chat.
   - «Annulla» è un clic del proprietario: activity.undo dal browser, come
     in Attività, sul lotto intero (concerto, persone, partenza e
     "regalato da" creati con la scheda). Lo stato «Annullato» resta,
     letto dal registro (activity.list).
   - I link alle viste (Partenze, Attività) passano dal router (useVista),
     mai da un <a href="#…"> nudo.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import { todayKey } from "../../../shared/lib/dates.ts";
import { mancanoDi } from "../../../shared/lib/mancano.ts";
import { chiaveNome } from "../../../shared/lib/nomi.ts";
import type { EsitoProposta, EventoEsterno } from "../../../shared/schema/proposta.ts";
import { useEditorConcerti } from "../editor.tsx";
import { erroreDi, useConvex, useDati } from "../sezioni/comuni.tsx";
import { useVista } from "../useVista.ts";
import { eVista, type IdVista } from "../vista.ts";
import { esitoDi, giornoLungo, type ParteScheda, type StatoScheda } from "./bozza.ts";
import { recuperaFocus, riprovaFocus } from "./focus.ts";
import { useRun } from "./run.ts";
import { aggiorna, useScheda } from "./store.ts";

type EsitoOk = Extract<EsitoProposta, { ok: true }>;

/** Un link a una vista di /modifica (dal router: la guardia e la cronologia lo vedono). */
export function VaiA({ vista, children }: { vista: IdVista; children: ReactNode }) {
  const { handle, vai } = useVista();
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void vai(vista);
  };
  return (
    <a className="scheda-link" href={`/${handle}/modifica#${vista}`} onClick={onClick}>
      {children}
    </a>
  );
}

/** La vista di un `fix` del server (`/<handle>/modifica#partenze`), se è una. */
const vistaDi = (fix?: string): IdVista | null => {
  const h = fix?.split("#")[1]?.split("?")[0] ?? "";
  return eVista(h) ? h : null;
};

const Stelle = ({ n }: { n: number }) => (
  <>
    <span aria-hidden="true" className="scheda-stelle">{"★".repeat(n)}</span>
    <span className="scheda-sr">{n === 1 ? "1 stella" : `${n} stelle`}</span>
  </>
);

/**
 * «Annulla» rifiutato con `in_uso`: un nome creato con la scheda (persona,
 * partenza o "regalato da") ora è usato anche da un altro concerto. Si
 * dice quale e cosa fare; Attività non aiuta (annulla lo stesso lotto).
 */
function testoInUso(creati: EsitoOk["creati"]): string | null {
  const nomi = [...creati.persone, creati.partenza, creati.regalatoDa].filter((x): x is string => !!x).map(x => `«${x}»`);
  if (!nomi.length) return null;
  return nomi.length === 1
    ? `Non si può annullare: ${nomi[0]}, un nome nuovo di questa scheda, ora è usato anche in un altro concerto. Toglilo da lì, poi annulla.`
    : `Non si può annullare: uno dei nomi nuovi di questa scheda (${nomi.join(", ")}) ora è usato anche in un altro concerto. Toglilo da lì, poi annulla.`;
}

/** La conferma di una scheda salvata: cosa è stato scritto, cosa manca, «Apri» e «Annulla». */
export function EsitoScheda({ part }: { part: ParteScheda }) {
  const out = esitoDi(part) as unknown as EsitoOk;
  const voce = useScheda(part.id);
  const q = useDati(api.entries.get, { id: out.id });
  const registro = useDati(api.activity.list, { limite: 100 });
  const convex = useConvex();
  const editor = useEditorConcerti();
  const [annullataQui, setAnnullataQui] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<ReactNode | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const annullata = annullataQui || !!voce?.annullata || !!registro.data?.voci.find(x => x.id === out.activityId)?.annullata;

  // il focus perso da un'azione su questa scheda (Annulla) torna qui
  useEffect(riprovaFocus);

  // salvata da qui: il focus (che stava sul Salva, ora sparito) va alla conferma, una volta
  useEffect(() => {
    if (!voce?.inviata || voce.confermata) return;
    const att = document.activeElement;
    if (!att || att === document.body) ref.current?.focus({ preventScroll: true });
    aggiorna(part.id, () => ({ confermata: true }));
  }, [voce, part.id]);

  const annulla = async () => {
    setInCorso(true);
    setErrore(null);
    try {
      await convex.mutation(api.activity.undo, { activityId: out.activityId });
      setAnnullataQui(true);
      aggiorna(part.id, () => ({ annullata: true }));
      // «Annulla» sparisce: il focus sulla riga «Annullato»
      recuperaFocus(part.id);
    } catch (e) {
      const err = erroreDi(e);
      if (err.code === "conflitto" && /già annullata/.test(err.messaggio)) setAnnullataQui(true);
      // un nome nuovo del lotto ora è anche in un altro concerto: neanche Attività lo annulla (il lotto va tutto o niente)
      else if (err.code === "in_uso") setErrore(testoInUso(out.creati) ?? <>Non si può annullare: {err.messaggio}.</>);
      else if (err.code === "conflitto") {
        setErrore(<>Non si può annullare da qui: è cambiato dopo. Annulla da <VaiA vista="attivita">Attività</VaiA>.</>);
      } else setErrore(<>Non si può annullare: {err.messaggio}.</>);
    } finally {
      setInCorso(false);
    }
  };

  if (annullata) {
    return (
      <div className="scheda scheda-esito scheda-annullata" data-scheda={part.id} ref={ref} tabIndex={-1}>
        <p role="status">
          <span aria-hidden="true" className="scheda-segno">↺</span>{" "}
          {out.azione === "aggiunto" ? (
            <>Annullato: «{out.titolo}» non è più in archivio. Lo ritrovi in <VaiA vista="attivita">Attività</VaiA>.</>
          ) : (
            "Annullato: tornano i dati di prima."
          )}
        </p>
      </div>
    );
  }

  const e = q.data as EventoEsterno | undefined;
  const sparito = q.isError;
  const festival = out.tipo === "festival";
  const oggi = todayKey(Date.now());
  const nuovi = new Set(out.creati.persone.map(chiaveNome));
  const data = e?.date ?? out.data;
  const luogo = e ? `${e.venue}, ${e.city}` : out.luogo;
  const con = e && !festival ? (e.with ?? []) : [];
  const km = e ? e.km : out.km;
  const inAttesa = e ? !!e.kmPending : !!out.kmInAttesa;
  const partenza = e?.from ?? out.partenza;
  const mancano = e ? mancanoDi(e, oggi, { prezzo: true }) : out.mancano;
  const titolo =
    `${out.azione === "aggiunto" ? "Aggiunto" : "Modificato"} · ${out.titolo}` +
    (out.azione === "modificato" ? ` (${out.data})` : "") +
    (festival && e?.concerts ? ` — ${e.concerts.length} concerti` : "");
  const dettagli: ReactNode[] = [];
  if (con.length) {
    dettagli.push(
      <span key="con">
        con {con.map((n, i) => (
          <span key={n}>
            {i > 0 && ", "}
            {n}
            {nuovi.has(chiaveNome(n)) && <span className="scheda-muto"> (nuova)</span>}
          </span>
        ))}
      </span>,
    );
  }
  if (!festival && e?.voto) dettagli.push(<Stelle key="v" n={e.voto} />);
  if (km !== undefined && partenza) dettagli.push(<span key="km">{km} km da {partenza}</span>);

  return (
    <div className="scheda scheda-esito" data-scheda={part.id} ref={ref} tabIndex={-1}>
      <p className="scheda-esito-titolo" role="status">
        <span aria-hidden="true" className="scheda-segno">✓</span> {titolo}
      </p>
      {sparito ? (
        <p className="scheda-muto">Non è più in archivio.</p>
      ) : (
        <>
          <p className="scheda-sotto">
            {[giornoLungo(data) || data, luogo].join(" · ")}
          </p>
          {dettagli.length > 0 && (
            <p className="scheda-sotto">
              {dettagli.map((d, i) => (
                <span key={i}>
                  {i > 0 && " · "}
                  {d}
                </span>
              ))}
            </p>
          )}
          {out.cambiati && out.cambiati.length > 0 && (
            <p className="scheda-sotto">
              {out.cambiati.map(c => (c.prima ? `${c.campo} ${c.prima} → ${c.dopo}` : c.campo === "Concerti" ? c.dopo : `${c.campo} ${c.dopo}`)).join(" · ")}
            </p>
          )}
          {(out.creati.persone.length > 0 || out.creati.partenza || out.creati.regalatoDa) && (
            <ul className="scheda-creati">
              {out.creati.persone.map(n => <li key={`p:${n}`}>+ {n} tra le persone</li>)}
              {out.creati.partenza && <li>+ {out.creati.partenza} tra le partenze</li>}
              {out.creati.regalatoDa && <li>+ {out.creati.regalatoDa} tra i “regalato da”</li>}
            </ul>
          )}
          {inAttesa && partenza && (
            <p className="scheda-attenzione">
              km in attesa: imposta l'indirizzo di «{partenza}» in <VaiA vista="partenze">Partenze</VaiA>.
            </p>
          )}
          {mancano.length > 0 && <p className="scheda-mancano">Mancano: {mancano.join(", ")}.</p>}
          {errore && <p className="mod-errore" role="alert">{errore}</p>}
          <div className="scheda-azioni scheda-azioni-esito">
            <button type="button" className="mod-btn" onClick={() => void editor.apri({ tipo: out.tipo, id: out.id })}>Apri</button>
            <button type="button" className="mod-btn" disabled={inCorso} onClick={() => void annulla()}>{inCorso ? "Annullo…" : "Annulla"}</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Una scheda chiusa senza salvare: una riga breve (scartata, corretta, chiusa, scaduta, non salvata). */
export function SchedaChiusa({ part, stato, titolo, tono, testo, children }: {
  part: ParteScheda;
  stato?: StatoScheda;
  titolo?: string;
  tono?: "errore" | "muto";
  testo?: string;
  children?: ReactNode;
}) {
  const run = useRun();
  const voce = useScheda(part.id);
  const out = esitoDi(part);
  // chiusa da qui (Scarta): il focus, perso col pulsante, viene su questa riga (tabIndex -1)
  useEffect(riprovaFocus);
  if (testo) {
    return (
      <div className={"scheda scheda-chiusa" + (tono === "errore" ? " scheda-chiusa-errore" : "")} data-scheda={part.id} tabIndex={-1}>
        <p>{testo}</p>
        {children && <div className="scheda-azioni-problema">{children}</div>}
      </div>
    );
  }
  switch (stato) {
    case "non_salvata": {
      const err = (out?.errore ?? {}) as { messaggio?: string; fix?: string };
      const vista = vistaDi(err.fix);
      return (
        <div className="scheda scheda-chiusa" data-scheda={part.id} tabIndex={-1}>
          <div className="mod-errore">
            <p>
              Non salvata: {(err.messaggio ?? "qualcosa non è andato").replace(/\.$/, "")}.
              {vista && <> <VaiA vista={vista}>Vai a sistemarlo</VaiA>.</>}
            </p>
          </div>
          <p className="scheda-muto">Il Tour manager te la ripropone.</p>
        </div>
      );
    }
    case "scartata":
      return (
        <div className="scheda scheda-chiusa scheda-riga-muta" data-scheda={part.id} tabIndex={-1}>
          <p>Scheda scartata · {titolo}</p>
        </div>
      );
    case "corretta": {
      const nota = typeof out?.nota === "string" ? out.nota : voce?.notaInviata;
      return (
        <div className="scheda scheda-chiusa scheda-riga-muta" data-scheda={part.id} tabIndex={-1}>
          <p>Sostituita dalla tua correzione <span aria-hidden="true">↓</span></p>
          {nota && (
            <div className="chat-row user scheda-nota-utente">
              <div className="chat-msg user"><p>{nota}</p></div>
            </div>
          )}
        </div>
      );
    }
    case "chiusa":
      return (
        <div className="scheda scheda-chiusa scheda-riga-muta" data-scheda={part.id} tabIndex={-1}>
          <p>{out?.error === "non eseguito" ? "Scheda non salvata: la conversazione è andata avanti." : "Proposta non valida: il Tour manager la rifà."}</p>
        </div>
      );
    default:
      // scaduta: riaperta dallo storico o dopo un ricaricamento, il run non c'è più
      return (
        <div className="scheda scheda-chiusa scheda-riga-muta" data-scheda={part.id} tabIndex={-1}>
          <p>Scheda non salvata: la conversazione è andata avanti.</p>
          <div className="scheda-azioni-problema">
            <button type="button" className="mod-btn" disabled={run.caricando} onClick={() => run.invia(`Rifai la scheda di ${titolo}`)}>Chiedi di rifarla</button>
          </div>
        </div>
      );
  }
}
