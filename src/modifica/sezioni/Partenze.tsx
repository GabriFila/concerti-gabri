/* ──────────────────────────────────────────────────────────────
   #partenze (T5; SPEC "Partenze", PIANO §1.22, §5.5; spec ux-modifica
   §6.6): da dove si parte per i concerti. Il nome è pubblico; l'indirizzo
   lo vede solo il proprietario, qui e solo nel browser.

   - L'elenco viene da `departures.addresses` (solo dashboard), che dà il
     TESTO dell'indirizzo e mai le coordinate; come ogni dato di queste
     sezioni si chiede dopo l'idratazione, quindi non entra mai nell'HTML
     né nello stato SSR. La vista si monta solo se la si apre.
   - L'indirizzo si imposta con AddressPicker (src/ui, corsia 3):
     candidati di Nominatim → scelta → `departures.confirmAddress`. La
     finestra la apre l'hash, `#partenze?indirizzo=<departureId>` (solo
     l'id, mai l'indirizzo): ci portano l'avviso dei km in #concerti, il
     form di un concerto, la notifica «Imposta l'indirizzo» e la partenza
     appena aggiunta; «indietro» la chiude.
   - Correggerlo ricalcola i km dei concerti collegati con un nuovo scarto
     casuale: al massimo una volta al giorno per partenza. Chi cambia casa
     aggiunge una partenza nuova (i concerti di prima restano con i loro km).
   - Cancellare è bloccato finché la partenza è usata da un concerto.
   - Le notifiche: aggiungere, rinominare e cancellare hanno «Annulla»;
     l'indirizzo no (non si annulla, e la notifica non lo nomina mai).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { aggiungiPartenzaInput } from "../../../shared/schema/departure.ts";
import { AddressPicker } from "../../ui/AddressPicker.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { Vuoto } from "../ui/campi.tsx";
import { useScrittura, useToast } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, Modale, useConvex, useDati } from "./comuni.tsx";
import { chiaveNome, erroriSchema, ordinaEventi, titoloDi } from "./forme.ts";

type Partenza = FunctionReturnType<typeof api.departures.addresses>["partenze"][number];
type Azione = { tipo: "rinomina" | "cancella"; p: Partenza } | null;

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

/** Corretta nelle ultime 24 ore: un'altra correzione aspetta. */
const inAttesa = (p: Partenza, adesso: number) => p.stato === "impostato" && p.correzioneDa !== null && p.correzioneDa > adesso;

export function SezionePartenze(_props: SezioneProps) {
  // solo nel browser, dopo l'idratazione (useDati): gli indirizzi non entrano mai nell'SSR
  const q = useDati(api.departures.addresses);
  const { vista, parametri, apriPannello, chiudiPannello } = useVista();
  const [azione, setAzione] = useState<Azione>(null);
  // la partenza appena aggiunta, finché non arriva nell'elenco (la finestra dell'indirizzo si apre subito)
  const [creata, setCreata] = useState<Partenza | null>(null);
  const adesso = useAdesso();
  const chiudi = () => setAzione(null);

  const idIndirizzo = vista === "partenze" ? (parametri.indirizzo ?? null) : null;
  const partenze = q.data?.partenze;
  const perIndirizzo = idIndirizzo ? (partenze?.find(p => p.id === idIndirizzo) ?? (creata?.id === idIndirizzo ? creata : undefined)) : undefined;
  // un id che non c'è (cancellata, o di un'altra pagina): l'hash torna #partenze
  useEffect(() => {
    if (idIndirizzo && partenze && !perIndirizzo) chiudiPannello();
  }, [idIndirizzo, partenze, perIndirizzo, chiudiPannello]);

  return (
    <CorniceSezione>
      <IntestazioneVista
        id="partenze"
        titolo="Partenze"
        descrizione="Da dove parti per i concerti: i km li calcola il server. Il nome è pubblico, l'indirizzo lo vedi solo tu, qui."
        titoloAiuto="Hai cambiato casa?"
        aiuto={<p>Aggiungi una nuova partenza: i concerti di prima restano con i loro km.</p>}
      />
      <NuovaPartenza
        onCreata={p => {
          setCreata(p);
          // subito l'indirizzo: senza, i km dei suoi concerti restano in attesa
          void apriPannello({ indirizzo: p.id });
        }}
      />
      <Caricamento q={q} righe>
        {({ partenze }) =>
          partenze.length === 0 ? (
            <Vuoto
              icona="pin"
              titolo="Nessuna partenza, per ora."
              testo="Aggiungine una, per esempio «Casa Milano»: dall'indirizzo il server calcola i km dei viaggi."
            />
          ) : (
            <ul className="mf-carte" aria-label="Partenze">
              {partenze.map(p => (
                <SchedaPartenza
                  key={p.id}
                  p={p}
                  adesso={adesso}
                  onIndirizzo={() => void apriPannello({ indirizzo: p.id })}
                  onAzione={tipo => setAzione({ tipo, p })}
                />
              ))}
            </ul>
          )
        }
      </Caricamento>
      {perIndirizzo && (
        <Indirizzo
          key={perIndirizzo.id}
          p={perIndirizzo}
          bloccata={inAttesa(perIndirizzo, adesso)}
          onChiudi={() => chiudiPannello()}
          onFatto={() => chiudiPannello({ dopoSalvataggio: true })}
        />
      )}
      {azione?.tipo === "rinomina" && <Rinomina p={azione.p} onChiudi={chiudi} />}
      {azione?.tipo === "cancella" && <Cancella p={azione.p} onChiudi={chiudi} />}
    </CorniceSezione>
  );
}

/** Una partenza: nome e stato, l'indirizzo (solo qui), i concerti, e le sue azioni sempre in vista. */
function SchedaPartenza({ p, adesso, onIndirizzo, onAzione }: {
  p: Partenza;
  adesso: number;
  onIndirizzo: () => void;
  onAzione: (tipo: NonNullable<Azione>["tipo"]) => void;
}) {
  const bloccata = inAttesa(p, adesso);
  const impostato = p.stato === "impostato";
  return (
    <li className="mf-carta mod-partenza">
      <div className="mf-carta-testa">
        <span className="mf-carta-nome">{p.name}</span>
        <span className={`mod-stato mod-stato-${p.stato}`}>{impostato ? "indirizzo impostato" : "indirizzo mancante"}</span>
      </div>
      {p.indirizzo ? (
        <p className="mod-indirizzo">
          <Icon name="lock" size={14} stroke={1.8} />
          <span>{p.indirizzo}</span>
          <span className="mf-privato">Lo vedi solo tu</span>
        </p>
      ) : (
        !impostato && <p className="mod-hint">Senza indirizzo i km dei suoi concerti restano in attesa.</p>
      )}
      <p className="mod-conta">
        {p.concerti === 1 ? "1 concerto" : `${p.concerti} concerti`}
        {p.legacy && " · km storici conservati"}
      </p>
      {bloccata && p.correzioneDa !== null && (
        <p className="mod-hint">Già corretto nelle ultime 24 ore: puoi correggerlo di nuovo dal {quando(p.correzioneDa)}.</p>
      )}
      <div className="mf-carta-azioni">
        <button
          type="button"
          className={`mod-btn${impostato ? "" : " mf-btn-ambra"}`}
          disabled={bloccata}
          aria-label={`${impostato ? "Correggi" : "Imposta"} l'indirizzo di ${p.name}`}
          onClick={onIndirizzo}
        >
          {impostato ? "Correggi indirizzo" : "Imposta indirizzo"}
        </button>
        <button type="button" className="mod-btn mf-btn-fantasma" aria-label={`Rinomina ${p.name}`} onClick={() => onAzione("rinomina")}>Rinomina</button>
        <button type="button" className="mod-btn mf-btn-fantasma mod-pericolo-lieve" aria-label={`Cancella ${p.name}`} onClick={() => onAzione("cancella")}>
          Cancella
        </button>
      </div>
    </li>
  );
}

function NuovaPartenza({ onCreata }: { onCreata: (p: Partenza) => void }) {
  const convex = useConvex();
  const op = useScrittura();
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPartenzaInput, value) },
    onSubmit: async ({ value, formApi }) => {
      const r = await op.esegui(() => convex.mutation(api.departures.add, { name: value.name }), { successo: "Partenza aggiunta.", annullabile: true, tabelle: ["departures"] });
      if (!r) return;
      formApi.reset();
      onCreata({ id: r.id, name: value.name.trim(), stato: "mancante", indirizzo: null, legacy: false, concerti: 0, correzioneDa: null });
    },
  });
  return (
    <form className="mod-form mf-aggiungi" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <form.Field name="name">
        {f => (
          <CampoTesto
            f={f}
            etichetta="Nuova partenza"
            placeholder="Casa Milano"
            aiuto="Il nome pubblico, mai l'indirizzo."
            maxLength={40}
            autoComplete="off"
            azione={<button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>}
          />
        )}
      </form.Field>
      <Errore errore={op.errore} />
    </form>
  );
}

/** `?indirizzo=<id>`: imposta o corregge l'indirizzo (una correzione al giorno). */
function Indirizzo({ p, bloccata, onChiudi, onFatto }: { p: Partenza; bloccata: boolean; onChiudi: () => void; onFatto: () => void }) {
  const correzione = p.stato === "impostato";
  // l'esito dell'indirizzo non si annulla (e non lo ripete: solo cosa succede ai km)
  const { mostra } = useToast();
  // la chiusura dopo la conferma non è un «chiudi» (che tornerebbe indietro una volta di troppo)
  const fatto = useRef(false);
  return (
    <Modale titolo={`${correzione ? "Correggi" : "Imposta"} l'indirizzo di ${p.name}`} onChiudi={() => !fatto.current && onChiudi()}>
      {bloccata && p.correzioneDa !== null ? (
        <p className="mod-attenzione" role="note">
          Già corretto nelle ultime 24 ore: puoi correggerlo di nuovo dal {quando(p.correzioneDa)}.
        </p>
      ) : (
        <>
          {correzione ? (
            <p className="mod-attenzione" role="note">
              Una correzione ricalcola i km di tutti i concerti partiti da qui con un nuovo scarto casuale, e si può fare una volta al giorno.
              Se hai cambiato casa, aggiungi invece una nuova partenza.
            </p>
          ) : (
            <p className="mod-hint">
              L'indirizzo resta privato: lo vedi solo tu, qui.{" "}
              {p.legacy ? "I km storici di questa partenza restano com'erano; si calcolano solo quelli in attesa." : "Da qui il server calcola i km dei concerti."}
            </p>
          )}
          <AddressPicker
            departureId={p.id}
            correzione={correzione}
            onAnnulla={() => onChiudi()}
            onConfermato={esito => {
              fatto.current = true;
              onFatto();
              mostra({
                testo: esito.stessoPunto
                  ? "Indirizzo aggiornato: è lo stesso punto di prima, i km non cambiano."
                  : esito.correzione
                    ? "Indirizzo corretto: i km dei concerti si ricalcolano."
                    : "Indirizzo impostato: i km in attesa si calcolano.",
              });
            }}
          />
        </>
      )}
    </Modale>
  );
}

function Rinomina({ p, onChiudi }: { p: Partenza; onChiudi: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
  const form = useForm({
    defaultValues: { name: p.name },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPartenzaInput, value) },
    onSubmit: async ({ value }) => {
      const r = await op.esegui(() => convex.mutation(api.departures.rename, { id: p.id, name: value.name }), {
        successo: "Partenza rinominata.",
        annullabile: true,
        tabelle: ["departures"],
      });
      if (r) onChiudi();
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

function Cancella({ p, onChiudi }: { p: Partenza; onChiudi: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
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
        const r = await op.esegui(() => convex.mutation(api.departures.remove, { id: p.id, confirm: true }), {
          successo: "Partenza cancellata.",
          annullabile: true,
          tabelle: ["departures"],
        });
        if (r) onChiudi();
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
