/* ──────────────────────────────────────────────────────────────
   #partenze (T5; SPEC "Partenze", PIANO §1.22, §5.5): da dove si parte
   per i concerti. Il nome è pubblico; l'indirizzo lo vede solo il
   proprietario, qui e solo nel browser.

   - L'elenco viene da `departures.addresses` (solo dashboard), che dà il
     TESTO dell'indirizzo e mai le coordinate; come ogni dato di queste
     sezioni si chiede dopo l'idratazione, quindi non entra mai nell'HTML
     né nello stato SSR.
   - L'indirizzo si imposta con AddressPicker (src/ui, corsia 3):
     candidati di Nominatim → scelta → `departures.confirmAddress`.
   - Correggerlo ricalcola i km dei concerti collegati con un nuovo scarto
     casuale: al massimo una volta al giorno per partenza. Chi cambia casa
     aggiunge una partenza nuova (i concerti di prima restano con i loro km).
   - Cancellare è bloccato finché la partenza è usata da un concerto.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { aggiungiPartenzaInput } from "../../../shared/schema/departure.ts";
import { AddressPicker } from "../../ui/AddressPicker.tsx";
import type { SezioneProps } from "../tipi.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, Modale, useAvviso, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { chiaveNome, erroriSchema, ordinaEventi, titoloDi } from "./forme.ts";

type Partenza = FunctionReturnType<typeof api.departures.addresses>["partenze"][number];
type Azione = { tipo: "rinomina" | "indirizzo" | "cancella"; p: Partenza } | null;

const quando = (ms: number) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(ms);

/** L'ora del browser, aggiornata ogni minuto (per il limite di una correzione al giorno). */
function useAdesso() {
  const [adesso, setAdesso] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAdesso(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return adesso;
}

export function SezionePartenze(_props: SezioneProps) {
  // solo nel browser, dopo l'idratazione (useDati): gli indirizzi non entrano mai nell'SSR
  const q = useDati(api.departures.addresses);
  const [azione, setAzione] = useState<Azione>(null);
  const [avviso, setAvviso] = useAvviso(8000);
  const adesso = useAdesso();
  const chiudi = (m?: string) => {
    setAzione(null);
    if (m) setAvviso(m);
  };
  return (
    <CorniceSezione>
      <p className="mod-hint">
        Da dove parti per i concerti: i km di ogni viaggio li calcola il server. Il nome della partenza è pubblico, l'indirizzo lo vedi solo
        tu, qui. Hai cambiato casa? Aggiungi una nuova partenza: i concerti di prima restano con i loro km.
      </p>
      <NuovaPartenza onCreata={p => setAzione({ tipo: "indirizzo", p })} />
      {avviso}
      <Caricamento q={q}>
        {({ partenze }) =>
          partenze.length === 0 ? (
            <p className="mod-vuoto">Nessuna partenza, per ora.</p>
          ) : (
            <ul className="mod-lista mod-lista-semplice" aria-label="Partenze">
              {partenze.map(p => {
                const bloccata = p.stato === "impostato" && p.correzioneDa !== null && p.correzioneDa > adesso;
                return (
                  <li key={p.id} className="mod-partenza">
                    <span className="mod-nome">{p.name}</span>
                    <span className={`mod-stato mod-stato-${p.stato}`}>{p.stato === "impostato" ? "indirizzo impostato" : "indirizzo mancante"}</span>
                    {p.indirizzo && <span className="mod-indirizzo">{p.indirizzo}</span>}
                    <span className="mod-conta">
                      {p.concerti === 1 ? "1 concerto" : `${p.concerti} concerti`}
                      {p.legacy && " · km storici conservati"}
                    </span>
                    {bloccata && p.correzioneDa !== null && (
                      <span className="mod-hint">Già corretto nelle ultime 24 ore: puoi correggerlo di nuovo dal {quando(p.correzioneDa)}.</span>
                    )}
                    <span className="mod-evento-azioni">
                      <button type="button" className="mod-btn" disabled={bloccata} aria-label={`${p.stato === "impostato" ? "Correggi" : "Imposta"} l'indirizzo di ${p.name}`} onClick={() => setAzione({ tipo: "indirizzo", p })}>
                        {p.stato === "impostato" ? "Correggi indirizzo" : "Imposta indirizzo"}
                      </button>
                      <button type="button" className="mod-btn" aria-label={`Rinomina ${p.name}`} onClick={() => setAzione({ tipo: "rinomina", p })}>Rinomina</button>
                      <button type="button" className="mod-btn mod-pericolo-lieve" aria-label={`Cancella ${p.name}`} onClick={() => setAzione({ tipo: "cancella", p })}>Cancella</button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Caricamento>
      {azione?.tipo === "indirizzo" && <Indirizzo p={azione.p} onChiudi={chiudi} />}
      {azione?.tipo === "rinomina" && <Rinomina p={azione.p} onChiudi={chiudi} />}
      {azione?.tipo === "cancella" && <Cancella p={azione.p} onChiudi={chiudi} />}
    </CorniceSezione>
  );
}

function NuovaPartenza({ onCreata }: { onCreata: (p: Partenza) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPartenzaInput, value) },
    onSubmit: async ({ value, formApi }) => {
      const r = await op.esegui(() => convex.mutation(api.departures.add, { name: value.name }));
      if (!r) return;
      formApi.reset();
      // subito l'indirizzo: senza, i km dei suoi concerti restano in attesa
      onCreata({ id: r.id, name: value.name.trim(), stato: "mancante", indirizzo: null, legacy: false, concerti: 0, correzioneDa: null });
    },
  });
  return (
    <form className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="mod-riga">
        <form.Field name="name">
          {f => <CampoTesto f={f} etichetta="Nuova partenza" placeholder="Casa Milano" aiuto="Il nome pubblico, mai l'indirizzo." maxLength={40} autoComplete="off" />}
        </form.Field>
        <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>
      </div>
      <Errore errore={op.errore} />
    </form>
  );
}

function Indirizzo({ p, onChiudi }: { p: Partenza; onChiudi: (m?: string) => void }) {
  const correzione = p.stato === "impostato";
  return (
    <Modale titolo={`${correzione ? "Correggi" : "Imposta"} l'indirizzo di ${p.name}`} onChiudi={() => onChiudi()}>
      {correzione ? (
        <p className="mod-attenzione" role="note">
          Una correzione ricalcola i km di tutti i concerti partiti da qui con un nuovo scarto casuale, e si può fare una volta al giorno.
          Se hai cambiato casa, aggiungi invece una nuova partenza.
        </p>
      ) : (
        <p className="mod-hint">
          L'indirizzo resta privato: lo vedi solo tu, qui. {p.legacy ? "I km storici di questa partenza restano com'erano; si calcolano solo quelli in attesa." : "Da qui il server calcola i km dei concerti."}
        </p>
      )}
      <AddressPicker
        departureId={p.id}
        correzione={correzione}
        onAnnulla={() => onChiudi()}
        onConfermato={esito =>
          onChiudi(
            esito.stessoPunto
              ? "Indirizzo aggiornato: è lo stesso punto di prima, i km non cambiano."
              : esito.correzione
                ? "Indirizzo corretto: i km dei concerti si ricalcolano."
                : "Indirizzo impostato: i km in attesa si calcolano.",
          )
        }
      />
    </Modale>
  );
}

function Rinomina({ p, onChiudi }: { p: Partenza; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const form = useForm({
    defaultValues: { name: p.name },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPartenzaInput, value) },
    onSubmit: async ({ value }) => {
      if (await op.esegui(() => convex.mutation(api.departures.rename, { id: p.id, name: value.name }))) onChiudi("Partenza rinominata.");
    },
  });
  return (
    <Modale titolo={`Rinomina ${p.name}`} onChiudi={() => onChiudi()} piedi={
      <>
        <button type="button" className="mod-btn" onClick={() => onChiudi()}>Annulla</button>
        <button type="submit" form="mod-form-partenza" className="mod-btn mod-primario" disabled={op.inCorso}>Salva</button>
      </>
    }>
      <form id="mod-form-partenza" className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name">{f => <CampoTesto f={f} etichetta="Nome" aiuto="Il nome pubblico, mai l'indirizzo." maxLength={40} autoFocus autoComplete="off" />}</form.Field>
        <Errore errore={op.errore} />
      </form>
    </Modale>
  );
}

function Cancella({ p, onChiudi }: { p: Partenza; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const eventi = useDati(api.entries.list, {});
  const usata = ordinaEventi(eventi.data?.concerts ?? []).filter(e => e.from && chiaveNome(e.from) === chiaveNome(p.name));
  return (
    <Conferma
      titolo={`Cancellare ${p.name}?`}
      bloccato={p.concerti > 0}
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        if (await op.esegui(() => convex.mutation(api.departures.remove, { id: p.id, confirm: true }))) onChiudi("Partenza cancellata.");
      }}
    >
      {p.concerti > 0 ? (
        <>
          <p>
            <b>{p.name}</b> è la partenza di {p.concerti === 1 ? "un concerto" : `${p.concerti} concerti`}: cambiala lì prima di cancellarla.
          </p>
          {usata.length > 0 && (
            <ul className="mod-elenco-breve">
              {usata.slice(0, 20).map(e => <li key={e.id}>{e.date} · {titoloDi(e)}</li>)}
            </ul>
          )}
        </>
      ) : (
        <p><b>{p.name}</b> sparisce con il suo indirizzo. Se la ripristini da «Attività» torna senza indirizzo.</p>
      )}
    </Conferma>
  );
}
