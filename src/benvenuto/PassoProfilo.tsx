/* Passo 1 di /benvenuto (PIANO §1.19): handle, forma e nome visualizzato
   → `profiles.completeOnboarding` (profilo `active`: la pagina esiste da
   qui). L'handle si controlla dal vivo: formato e riservati nel browser
   (shared/handles.ts), profili e alias presi con `profiles.handleAvailable`. */

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { messaggioHandle, motivoFormatoHandle, normalizzaHandle } from "../../shared/handles.ts";
import { completaOnboardingInput } from "../../shared/schema/onboarding.ts";
import { messaggioErrore } from "../accesso/errori.ts";
import { ErroriCampo, Passo, useOrigine } from "./comuni.tsx";

type Forma = "f" | "m" | "n";

const FORME: { valore: Forma; etichetta: string; esempio: string }[] = [
  { valore: "f", etichetta: "Al femminile", esempio: "«Dove sono andata»" },
  { valore: "m", etichetta: "Al maschile", esempio: "«Dove sono andato»" },
  { valore: "n", etichetta: "Neutra", esempio: "frasi senza participi: «I miei posti»" },
];

const campi = completaOnboardingInput.shape;

export function PassoProfilo() {
  const convex = useConvex();
  const completa = useMutation(api.profiles.completeOnboarding);
  const origine = useOrigine();
  const [errore, setErrore] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { handle: "", forma: "" as Forma | "", displayName: "" },
    onSubmit: async ({ value }) => {
      setErrore(null);
      try {
        // poi me.profile cambia dal vivo e /benvenuto passa al passo 2
        await completa({ input: { handle: normalizzaHandle(value.handle), forma: value.forma as Forma, displayName: value.displayName.trim() } });
      } catch (e) {
        setErrore(messaggioErrore(e));
      }
    },
  });

  return (
    <Passo titolo="La tua pagina">
      <p className="acc-nota">Scegli l'indirizzo della pagina, come vuoi che si riferisca a te e il tuo nome sulla pagina.</p>
      <form
        className="acc-form"
        onSubmit={e => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="handle"
          validators={{
            onChange: ({ value }) => {
              const m = motivoFormatoHandle(normalizzaHandle(value));
              return m ? messaggioHandle(m) : undefined;
            },
            onChangeAsyncDebounceMs: 400,
            onChangeAsync: async ({ value }) => {
              const r = await convex.query(api.profiles.handleAvailable, { handle: normalizzaHandle(value) });
              return r.disponibile ? undefined : messaggioHandle(r.motivo ?? "");
            },
          }}
          children={field => (
            <label className="acc-campo">
              <span>Indirizzo della pagina</span>
              <span className="acc-prefisso">
                <span aria-hidden="true">{(origine || "").replace(/^https?:\/\//, "")}/</span>
                <input
                  name="handle"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={30}
                  value={field.state.value}
                  onChange={e => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
              </span>
              <span className="acc-piccolo">Minuscole, numeri e trattini, da 3 a 30 caratteri.</span>
              {field.state.meta.isValidating ? <span className="acc-piccolo">Controllo…</span> : <ErroriCampo meta={field.state.meta} />}
            </label>
          )}
        />

        <form.Field
          name="forma"
          validators={{ onChange: ({ value }) => (campi.forma.safeParse(value).success ? undefined : "Scegli come vuoi che la pagina si riferisca a te.") }}
          children={field => (
            <fieldset className="acc-campo acc-scelte">
              <legend>Come vuoi che la pagina si riferisca a te?</legend>
              {FORME.map(f => (
                <label key={f.valore} className="acc-scelta">
                  <input
                    type="radio"
                    name="forma"
                    value={f.valore}
                    checked={field.state.value === f.valore}
                    onChange={() => field.handleChange(f.valore)}
                    onBlur={field.handleBlur}
                  />
                  <span>
                    {f.etichetta} <span className="acc-piccolo">{f.esempio}</span>
                  </span>
                </label>
              ))}
              <ErroriCampo meta={field.state.meta} />
            </fieldset>
          )}
        />

        <form.Field
          name="displayName"
          validators={{ onChange: ({ value }) => (campi.displayName.safeParse(value).success ? undefined : "Scrivi un nome da 1 a 40 caratteri.") }}
          children={field => (
            <label className="acc-campo">
              <span>Il tuo nome sulla pagina</span>
              <input
                name="displayName"
                autoComplete="nickname"
                maxLength={40}
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
          selector={s => [s.canSubmit, s.isSubmitting] as const}
          children={([puo, invio]) => (
            <button type="submit" className="acc-btn" disabled={!puo || invio}>
              Crea la pagina
            </button>
          )}
        />
      </form>
    </Passo>
  );
}
