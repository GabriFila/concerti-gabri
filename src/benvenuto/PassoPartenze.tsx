/* Passo 2 di /benvenuto: le partenze, nome pubblico e indirizzo privato
   (AddressPicker, lo stesso di #partenze). Facoltativo: i km dei concerti
   senza indirizzo restano in attesa finché non lo imposti. Una partenza in
   più si aggiunge solo quando quelle di prima hanno l'indirizzo. */

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
  // un'azione principale per volta: senza partenze è Aggiungi ("Salta per ora" resta un'uscita); con
  // l'indirizzo aperto (anche subito dopo Aggiungi) è Cerca/Conferma dell'AddressPicker; poi Avanti
  const nessuna = partenze.length === 0;
  const avantiSecondario = nessuna || partenze.some(d => d.id === aperta);
  // la prossima partenza si aggiunge solo con tutte le altre confermate (e nessun indirizzo aperto)
  const puoiAggiungere = aperta === null && partenze.every(d => d.stato === "impostato");
  return (
    <Passo titolo="Da dove parti solitamente">
      <p className="acc-nota">
        La tua pagina calcolerà i km che hai percorso per vedere i concerti, per questo dobbiamo sapere da dove parti
        solitamente. La posizione è nascosta e i km sono calcolati in modo tale da non poter risalire all'origine degli
        spostamenti. Puoi aggiungere più origini per i tuoi concerti.
      </p>

      {partenze.length > 0 && (
        <ul className="acc-elenco">
          {partenze.map(d => (
            <li key={d.id} className="acc-elenco-voce">
              <div className="acc-riga acc-riga--spazio">
                <span>
                  <b>{d.name}</b>
                  {d.stato !== "impostato" && <span className="acc-stato">indirizzo mancante</span>}
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

      {puoiAggiungere && !nessuna && <p className="acc-nuova">Parti anche da un altro posto? Aggiungi un'altra partenza.</p>}
      {puoiAggiungere && (
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
                <span>{nessuna ? "Nome della partenza" : "Nome della nuova partenza"}</span>
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
                      <button type="submit" className={nessuna ? "acc-btn" : "acc-btn acc-btn--ghost"} disabled={!puo || invio || !pieno}>
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
      )}

      <Navigazione avanti="agente" etichettaAvanti={nessuna ? "Salta per ora" : "Avanti"} avantiSecondario={avantiSecondario} />
    </Passo>
  );
}
