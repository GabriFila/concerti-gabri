/* ──────────────────────────────────────────────────────────────
   Indirizzo di una partenza (contratto di ondata). Campo → candidati
   (`geo.geocodeDeparture`) → scelta → `departures.confirmAddress`.
   Solo client, montato dopo l'idratazione: l'indirizzo non entra mai
   nello stato SSR né nei log. Lo implementa la corsia 3 (passo 2 di
   /benvenuto); la corsia 5 lo usa in #partenze.

   - Si cerca all'invio (niente autocompletamento: regole di Nominatim).
   - Dal server arrivano solo etichette e indici: le coordinate restano
     nella bozza privata (`geocodeDrafts`) e la scelta va per indice.
   - Niente TanStack Query qui: l'indirizzo e i candidati vivono solo nello
     stato del componente e spariscono dopo la conferma.
   ────────────────────────────────────────────────────────────── */

import { useId, useState } from "react";
import { useHydrated } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { indirizzo as schemaIndirizzo } from "../../shared/schema/departure.ts";
import { messaggioErrore } from "../accesso/errori.ts";

export interface AddressPickerProps {
  /** La partenza (già creata) di cui confermare l'indirizzo. */
  departureId: string;
  /** La partenza ha già un indirizzo: confermarne un altro è una correzione (una al giorno). */
  correzione?: boolean;
  /** Dopo una conferma riuscita, con l'esito di `departures.confirmAddress`. */
  onConfermato?: (esito: { correzione: boolean; stessoPunto: boolean }) => void;
  onAnnulla?: () => void;
}

type Candidato = { indice: number; etichetta: string };

export function AddressPicker({ departureId, correzione = false, onConfermato, onAnnulla }: AddressPickerProps) {
  const idratato = useHydrated();
  const geocodifica = useAction(api.geo.geocodeDeparture);
  const conferma = useMutation(api.departures.confirmAddress);
  const id = useId();
  const [testo, setTesto] = useState("");
  const [candidati, setCandidati] = useState<Candidato[] | null>(null);
  const [attribuzione, setAttribuzione] = useState("");
  const [scelto, setScelto] = useState<number | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState(false);
  const [attesa, setAttesa] = useState(false);

  // lo spazio c'è già nell'HTML, il campo arriva solo nel browser
  if (!idratato) return <div className="acc-indirizzo acc-indirizzo--attesa" aria-hidden="true" />;

  async function cerca(ev: { preventDefault(): void }) {
    ev.preventDefault();
    setErrore(null);
    setFatto(false);
    if (!schemaIndirizzo.safeParse(testo).success) {
      setErrore("Scrivi l'indirizzo con via, numero e città (da 5 a 200 caratteri).");
      return;
    }
    setAttesa(true);
    try {
      const r = await geocodifica({ input: { departureId, address: testo } });
      setCandidati(r.candidati);
      setAttribuzione(r.attribuzione);
      setScelto(r.candidati.length === 1 ? r.candidati[0].indice : null);
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setAttesa(false);
    }
  }

  async function confermaScelta() {
    if (scelto === null) return;
    setErrore(null);
    setAttesa(true);
    try {
      const r = await conferma({ input: { departureId, indice: scelto } });
      // l'indirizzo non serve più nel browser
      setTesto("");
      setCandidati(null);
      setScelto(null);
      setFatto(true);
      onConfermato?.({ correzione: r.correzione, stessoPunto: r.stessoPunto });
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setAttesa(false);
    }
  }

  return (
    <div className="acc-indirizzo">
      {correzione && (
        <p className="acc-avviso">
          Correggere l'indirizzo ricalcola i km di questa partenza con un nuovo scarto casuale. Si può fare una volta al
          giorno.
        </p>
      )}
      <form className="acc-form acc-form--riga" onSubmit={cerca}>
        <label className="acc-campo" htmlFor={`${id}-indirizzo`}>
          <span>Indirizzo (lo vedi solo tu)</span>
        </label>
        <div className="acc-riga">
          <input
            id={`${id}-indirizzo`}
            name="indirizzo"
            autoComplete="street-address"
            maxLength={200}
            value={testo}
            onChange={e => {
              setTesto(e.target.value);
              setCandidati(null);
            }}
            placeholder="Via, numero civico, città"
          />
          <button type="submit" className="acc-btn" disabled={attesa || !testo.trim()}>
            Cerca
          </button>
        </div>
        <p className="acc-piccolo">
          Serve solo a calcolare i km dei viaggi, che sulla pagina hanno sempre uno scarto casuale. Non esce mai dal
          server.
        </p>
      </form>

      {candidati && candidati.length === 0 && (
        <p className="acc-nota">Nessun risultato: prova ad aggiungere la città o il CAP.</p>
      )}
      {candidati && candidati.length > 0 && (
        <fieldset className="acc-candidati">
          <legend>Quale di questi?</legend>
          {candidati.map(c => (
            <label key={c.indice} className="acc-candidato">
              <input type="radio" name={`${id}-candidato`} checked={scelto === c.indice} onChange={() => setScelto(c.indice)} />
              <span>{c.etichetta}</span>
            </label>
          ))}
          <p className="acc-piccolo">{attribuzione}</p>
          <button type="button" className="acc-btn" disabled={attesa || scelto === null} onClick={confermaScelta}>
            Conferma l'indirizzo
          </button>
        </fieldset>
      )}

      {fatto && <p className="acc-ok">Indirizzo salvato.</p>}
      {errore && (
        <p className="acc-errore" role="alert">
          {errore}
        </p>
      )}
      {onAnnulla && (
        <button type="button" className="acc-link" onClick={onAnnulla} disabled={attesa}>
          Annulla
        </button>
      )}
    </div>
  );
}
