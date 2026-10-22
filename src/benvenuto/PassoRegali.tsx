/* Passo 4 di /benvenuto: chi ti regala i biglietti ("regalato da"), con un
   link facoltativo. Il logo si carica poi in #regali. Facoltativo. */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { REGOLA_SOPRANNOMI } from "../../shared/schema/campi.ts";
import { aggiungiRegaloInput } from "../../shared/schema/gifter.ts";
import { messaggioErrore } from "../accesso/errori.ts";
import { ErroriCampo, Navigazione, Passo } from "./comuni.tsx";

const campi = aggiungiRegaloInput.shape;

export function PassoRegali() {
  const { data } = useQuery(convexQuery(api.gifters.list, {}));
  const aggiungi = useMutation(api.gifters.add);
  const [errore, setErrore] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { label: "", url: "" },
    onSubmit: async ({ value, formApi }) => {
      setErrore(null);
      try {
        await aggiungi({ input: { label: value.label.trim(), url: value.url.trim() || undefined } });
        formApi.reset();
      } catch (e) {
        setErrore(messaggioErrore(e));
      }
    },
  });

  const regali = data?.gifters ?? [];
  return (
    <Passo titolo="Regalato da">
      <p className="acc-nota">
        Qualcuno ti regala i biglietti? Aggiungi chi: una persona o un'azienda, con un link se vuoi. Il logo si carica poi
        da Modifica → Regalato da.
      </p>
      <p className="acc-suggerimento">Se è una persona: {REGOLA_SOPRANNOMI}.</p>

      {regali.length > 0 && (
        <ul className="acc-elenco">
          {regali.map(g => (
            <li key={g.id} className="acc-elenco-voce">
              <b>{g.label}</b>
              {g.url && <span className="acc-piccolo"> · {g.url}</span>}
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
          name="label"
          validators={{ onChange: ({ value }) => (campi.label.safeParse(value).success ? undefined : "Da 1 a 60 caratteri.") }}
          children={field => (
            <label className="acc-campo">
              <span>Nome</span>
              <input
                name="regalatoDa"
                maxLength={60}
                placeholder="Marco R."
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <ErroriCampo meta={field.state.meta} />
            </label>
          )}
        />
        <form.Field
          name="url"
          validators={{ onChange: ({ value }) => (!value.trim() || campi.url.safeParse(value.trim()).success ? undefined : "Serve un indirizzo che inizia con https://") }}
          children={field => (
            <label className="acc-campo">
              <span>Link (facoltativo)</span>
              <input
                name="link"
                type="url"
                inputMode="url"
                maxLength={500}
                placeholder="https://"
                value={field.state.value}
                onChange={e => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              <ErroriCampo meta={field.state.meta} />
            </label>
          )}
        />
        {errore && (
          <p className="acc-errore" role="alert">
            {errore}
          </p>
        )}
        <form.Subscribe
          selector={s => [s.canSubmit, s.isSubmitting, s.values.label.trim().length > 0] as const}
          children={([puo, invio, pieno]) => (
            <button type="submit" className="acc-btn acc-btn--ghost" disabled={!puo || invio || !pieno}>
              Aggiungi
            </button>
          )}
        />
      </form>

      <Navigazione indietro="agente" avanti="fatto" etichettaAvanti="Fine" />
    </Passo>
  );
}
