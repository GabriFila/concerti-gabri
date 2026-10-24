/* ──────────────────────────────────────────────────────────────
   La barra del lotto (spec ux-agente §9.10): quando l'Oracolo prepara due
   o più schede nello stesso run (più serate in un messaggio), si decidono
   insieme. TanStack AI riprende il run solo quando TUTTE le approvazioni
   sono decise, con una richiesta sola: ogni scheda ha la sua casella «Da
   salvare» e qui, appiccicata in fondo alla chat, «Salva tutte» approva
   quelle spuntate (con la scheda come `editedArgs`) e scarta le altre
   (`{motivo: "scartata"}`).

   - Il Salva aspetta che ogni scheda spuntata sia pronta («Prima sistema
     1 scheda») e che le altre approvazioni del run (una cancellazione…)
     abbiano la loro risposta. Con il «Modulo completo» di una scheda
     aperto non si salva e non si scarta: i suoi valori andrebbero persi.
   - Dopo il Salva: «3 concerti salvati» e «Annulla tutti», un
     activity.undo per scheda, dall'ultima alla prima (una persona creata
     dalla prima scheda può essere usata dalla seconda).
   - Non è la barra delle schede di /modifica (shell/BarraSchede.tsx, la
     barra in basso del telefono): è un altro file.
   ────────────────────────────────────────────────────────────── */

import { useId, useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { EsitoProposta } from "../../../shared/schema/proposta.ts";
import { erroreDi, useConvex, useDati } from "../sezioni/comuni.tsx";
import { esitoDi, validaScheda, type ParteScheda } from "./bozza.ts";
import { VaiA } from "./EsitoScheda.tsx";
import { useRun } from "./run.ts";
import { aggiorna, leggi, useVersioneSchede } from "./store.ts";

type EsitoOk = Extract<EsitoProposta, { ok: true }>;

const schede = (n: number) => (n === 1 ? "1 scheda" : `${n} schede`);

export function BarraSchede() {
  const run = useRun();
  // si ridisegna a ogni cambiamento delle schede (caselle, problemi)
  useVersioneSchede();
  const ids = [...run.schede.keys()];
  if (ids.length >= 2) return <DaDecidere ids={ids} />;
  if (!ids.length && run.partiDelRun.length >= 2) return <Salvate parti={run.partiDelRun} />;
  return null;
}

/* ── prima: «Salva tutte» / «Scarta tutte» ────────────────────── */

function DaDecidere({ ids }: { ids: string[] }) {
  const run = useRun();
  const idSuggerimento = useId();
  const [errore, setErrore] = useState<string | null>(null);
  const voci = ids.map(id => ({ id, v: leggi(id), i: run.schede.get(id)! }));
  const incluse = voci.filter(x => x.v?.inclusa !== false);
  const daSistemare = voci.filter(x => (x.v?.nProblemi ?? 0) > 0).length;
  const bloccate = incluse.filter(x => (x.v?.nProblemi ?? 0) > 0).length;
  // ancora da controllare (nomi, venue): non si sa se è pronta
  const inAttesa = incluse.filter(x => !(x.v?.nProblemi ?? 0) && x.v?.bloccata !== false).length;
  const altre = run.altre.filter(i => i.status === "pending").length;
  const tutte = incluse.length === ids.length;
  const conModulo = voci.some(x => x.v?.moduloAperto !== undefined);

  const suggerimento = conModulo
    ? "Il modulo completo è aperto: prima «Usa nella scheda» o «Torna alla scheda»."
    : altre
    ? "Rispondi anche alla domanda qui sopra (Conferma o Rifiuta)."
    : bloccate
      ? `Prima sistema ${schede(bloccate)}.`
      : inAttesa
        ? "Controllo i nomi e le venue…"
        : !incluse.length
          ? "Nessuna scheda da salvare: usa «Scarta tutte»."
          : null;
  const puoSalvare = !suggerimento && !run.caricando;
  const puoScartare = !altre && !conModulo && !run.caricando;

  /** Decide tutte le schede insieme: TanStack manda la ripresa quando l'ultima è decisa. */
  const decidi = (salva: boolean) => {
    setErrore(null);
    if (voci.some(x => x.v?.moduloAperto !== undefined)) return;
    const decisioni: { id: string; i: (typeof voci)[number]["i"]; editedArgs?: unknown }[] = [];
    for (const x of voci) {
      if (!x.v) return;
      if (salva && x.v.inclusa) {
        const r = validaScheda(x.v);
        if (!r.ok) {
          setErrore(`Non si può salvare «${titoloDi(x.id)}»: ${r.errori[0].campo} ${r.errori[0].messaggio}.`);
          return;
        }
        decisioni.push({ id: x.id, i: x.i, editedArgs: r.proposta });
      } else decisioni.push({ id: x.id, i: x.i });
    }
    for (const d of decisioni) aggiorna(d.id, () => (d.editedArgs ? { inviata: true, editorAperto: null } : { scartata: true, editorAperto: null }));
    try {
      for (const d of decisioni) {
        if (d.i.status === "staged") d.i.clearResolution();
        d.i.resolveInterrupt(d.editedArgs ? { approved: true, editedArgs: d.editedArgs } : { approved: false, payload: { motivo: "scartata" } });
      }
    } catch {
      for (const d of decisioni) aggiorna(d.id, () => ({ inviata: false, scartata: false }));
      setErrore("Non riesco a salvare adesso: riprova tra un attimo.");
    }
  };

  const stato = [schede(ids.length), daSistemare ? `${daSistemare} da sistemare` : null, !tutte ? `${ids.length - incluse.length} da non salvare` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="schede-barra" role="group" aria-label="Le schede di questo messaggio">
      <p className="schede-barra-stato">{stato}</p>
      {suggerimento && <p className="schede-barra-nota" id={idSuggerimento}>{suggerimento}</p>}
      {errore && <p className="mod-errore" role="alert">{errore}</p>}
      <div className="schede-barra-azioni">
        <button type="button" className="mod-btn" disabled={!puoScartare} onClick={() => decidi(false)}>Scarta tutte</button>
        <button
          type="button"
          className="mod-btn mod-primario"
          disabled={!puoSalvare}
          aria-describedby={suggerimento ? idSuggerimento : undefined}
          onClick={() => decidi(true)}
        >
          {tutte ? `Salva tutte (${ids.length})` : `Salva ${schede(incluse.length)}`}
        </button>
      </div>
    </div>
  );
}

function titoloDi(id: string): string {
  const v = leggi(id);
  if (!v) return "scheda";
  return ("name" in v.valori ? v.valori.name : v.valori.artist).trim() || "senza titolo";
}

/* ── dopo: «3 concerti salvati» e «Annulla tutti» ─────────────── */

function Salvate({ parti }: { parti: readonly ParteScheda[] }) {
  const convex = useConvex();
  const registro = useDati(api.activity.list, { limite: 100 });
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState<ReactNode | null>(null);
  useVersioneSchede();
  const esiti = parti.map(p => ({ p, out: esitoDi(p) }));
  // solo un lotto del run in corso, tutto deciso, con almeno due schede salvate
  if (parti.length < 2 || esiti.some(x => !x.out)) return null;
  const salvate = esiti.filter(x => x.out?.ok === true).map(x => ({ id: x.p.id, out: x.out as unknown as EsitoOk }));
  if (salvate.length < 2) return null;
  const annullata = (s: (typeof salvate)[number]) =>
    !!leggi(s.id)?.annullata || !!registro.data?.voci.find(v => v.id === s.out.activityId)?.annullata;
  const ancora = salvate.filter(s => !annullata(s));
  const scartate = esiti.length - salvate.length;
  const tipi = new Set(salvate.map(s => s.out.tipo));
  const cosa = tipi.size > 1 ? "eventi" : tipi.has("festival") ? "festival" : "concerti";

  const annullaTutti = async () => {
    setInCorso(true);
    setEsito(null);
    let falliti = 0;
    let inUso = 0;
    // dall'ultima alla prima: una persona creata dalla prima scheda può comparire nella seconda
    for (const s of [...ancora].reverse()) {
      try {
        await convex.mutation(api.activity.undo, { activityId: s.out.activityId });
        aggiorna(s.id, () => ({ annullata: true }));
      } catch (e) {
        const err = erroreDi(e);
        if (err.code === "conflitto" && /già annullata/.test(err.messaggio)) aggiorna(s.id, () => ({ annullata: true }));
        // un nome nuovo della scheda ora è anche in un altro concerto: neanche Attività lo annulla (il lotto va tutto o niente)
        else if (err.code === "in_uso") inUso++;
        else falliti++;
      }
    }
    setInCorso(false);
    if (falliti || inUso) {
      setEsito(
        <>
          {inUso > 0 && (
            <>
              {inUso === 1 ? "Una non si è potuta annullare" : `${inUso} non si sono potute annullare`}: un nome nuovo
              {inUso === 1 ? " di quella scheda" : " di quelle schede"} ora è usato anche in un altro concerto. Toglilo da lì, poi annulla.{" "}
            </>
          )}
          {falliti > 0 && (
            <>
              {falliti === 1 ? "Una non si è potuta annullare da qui" : `${falliti} non si sono potute annullare da qui`}: annulla da{" "}
              <VaiA vista="attivita">Attività</VaiA>.
            </>
          )}
        </>,
      );
    }
  };

  if (!ancora.length) {
    return (
      <div className="schede-barra schede-barra-fatta">
        <p className="schede-barra-stato" role="status">Annullati tutti: li ritrovi in <VaiA vista="attivita">Attività</VaiA>.</p>
      </div>
    );
  }
  return (
    <div className="schede-barra schede-barra-fatta" role="group" aria-label="Le schede salvate di questo messaggio">
      <p className="schede-barra-stato">
        <span aria-hidden="true" className="scheda-segno">✓</span> {salvate.length} {cosa} salvati
        {scartate > 0 && `, ${scartate} ${scartate === 1 ? "scartata" : "scartate"}`}
        {ancora.length < salvate.length && ` · ${salvate.length - ancora.length} già annullati`}
      </p>
      {esito && <p className="mod-errore" role="alert">{esito}</p>}
      <div className="schede-barra-azioni">
        <button type="button" className="mod-btn" disabled={inCorso} onClick={() => void annullaTutti()}>
          {inCorso ? "Annullo…" : ancora.length < salvate.length ? `Annulla gli altri (${ancora.length})` : "Annulla tutti"}
        </button>
      </div>
    </div>
  );
}
