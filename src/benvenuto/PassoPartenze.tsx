/* Passo 2 di /benvenuto: le partenze, nome pubblico e indirizzo privato
   (AddressPicker, lo stesso di #partenze). Facoltativo: i km dei concerti
   senza indirizzo restano in attesa finché non lo imposti. */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { aggiungiPartenzaInput } from "../../shared/schema/departure.ts";
import { messaggioErrore } from "../accesso/errori.ts";
import { AddressPicker } from "../ui/AddressPicker.tsx";
import { ErroriCampo, Navigazione, Passo } from "./comuni.tsx";

export function PassoPartenze() {
  const { data } = useQuery(convexQuery(api.departures.list, {}));
  const aggiungi = useMutation(api.departures.add);
  const [aperta, setAperta] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value, formApi }) => {
      setErrore(null);
      try {
        const { id } = await aggiungi({ input: { name: value.name.trim() } });
        formApi.reset();
        setAperta(id);
      } catch (e) {
        setErrore(messaggioErrore(e));
      }
    },
  });

  const partenze = data?.departures ?? [];
  return (
    <Passo titolo="Da dove parti">
      <p className="acc-nota">
        Ogni viaggio parte da una partenza: un nome pubblico (es. «Casa Milano») e un indirizzo che vedi solo tu e che
        serve a calcolare i km. Se cambi casa, aggiungi una partenza nuova: i viaggi di prima restano com'erano.
      </p>

      {partenze.length > 0 && (
        <ul className="acc-elenco">
          {partenze.map(d => (
            <li key={d.id} className="acc-elenco-voce">
              <div className="acc-riga acc-riga--spazio">
                <span>
                  <b>{d.name}</b>{" "}
                  <span className={d.stato === "impostato" ? "acc-stato acc-stato--ok" : "acc-stato"}>
                    {d.stato === "impostato" ? "indirizzo impostato" : "indirizzo mancante"}
                  </span>
                </span>
                {aperta !== d.id && (
                  <button type="button" className="acc-link" onClick={() => setAperta(d.id)}>
                    {d.stato === "impostato" ? "Correggi l'indirizzo" : "Imposta l'indirizzo"}
                  </button>
                )}
              </div>
              {aperta === d.id && (
                <AddressPicker
                  departureId={d.id}
                  correzione={d.stato === "impostato"}
                  onConfermato={() => setAperta(null)}
                  onAnnulla={() => setAperta(null)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="acc-form"
        onSubmit={e => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="name"
          validators={{ onChange: ({ value }) => (aggiungiPartenzaInput.shape.name.safeParse(value).success ? undefined : "Da 1 a 40 caratteri.") }}
          children={field => (
            <label className="acc-campo">
              <span>Nome della partenza</span>
              <span className="acc-riga">
                <input
                  name="partenza"
                  maxLength={40}
                  placeholder="Casa Milano"
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                <form.Subscribe
                  selector={s => [s.canSubmit, s.isSubmitting, s.values.name.trim().length > 0] as const}
                  children={([puo, invio, pieno]) => (
                    <button type="submit" className="acc-btn" disabled={!puo || invio || !pieno}>
                      Aggiungi
                    </button>
                  )}
                />
              </span>
              <ErroriCampo meta={field.state.meta} />
            </label>
          )}
        />
        {errore && (
          <p className="acc-errore" role="alert">
            {errore}
          </p>
        )}
      </form>

      <Navigazione avanti="agente" etichettaAvanti={partenze.length ? "Avanti" : "Salta per ora"} />
    </Passo>
  );
}
