/* Passo 1 di /benvenuto (PIANO §1.19): handle, forma e nome visualizzato
   → `profiles.completeOnboarding` (profilo `active`: la pagina esiste da
   qui). L'handle si controlla dal vivo: formato e riservati nel browser
   (shared/handles.ts), profili e alias presi con `profiles.handleAvailable`.
   Riaperto dall'elenco dei passi a pagina già creata (`RivediProfilo`), lo
   stesso form parte dai valori attuali e salva con `profiles.update` solo
   quel che è cambiato (il vecchio handle diventa un alias, come da Modifica). */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "@tanstack/react-form";
import { convexQuery } from "@convex-dev/react-query";
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

interface Valori {
  handle: string;
  forma: Forma | "";
  displayName: string;
}

/** Il passo 1 riaperto a pagina già creata: i valori attuali, poi `onFatto` riporta al passo raggiunto. */
export function RivediProfilo({ onFatto }: { onFatto: () => void }) {
  const { data } = useQuery(convexQuery(api.profiles.get, {}));
  if (!data) return <p className="acc-nota">Un attimo…</p>;
  return <PassoProfilo attuale={{ handle: data.handle ?? "", forma: data.forma ?? "", displayName: data.displayName ?? "" }} onFatto={onFatto} />;
}

export function PassoProfilo({ attuale, onFatto }: { attuale?: Valori; onFatto?: () => void } = {}) {
  const convex = useConvex();
  const completa = useMutation(api.profiles.completeOnboarding);
  const aggiorna = useMutation(api.profiles.update);
  const origine = useOrigine();
  const [errore, setErrore] = useState<string | null>(null);

  const form = useForm({
    defaultValues: attuale ?? ({ handle: "", forma: "", displayName: "" } as Valori),
    onSubmit: async ({ value }) => {
      setErrore(null);
      const v = { handle: normalizzaHandle(value.handle), forma: value.forma as Forma, displayName: value.displayName.trim() };
      try {
        if (!attuale) {
          // poi me.profile cambia dal vivo e /benvenuto passa al passo 2
          await completa({ input: v });
          return;
        }
        const patch = {
          ...(v.handle !== attuale.handle && { handle: v.handle }),
          ...(v.forma !== attuale.forma && { forma: v.forma }),
          ...(v.displayName !== attuale.displayName && { displayName: v.displayName }),
        };
        if (Object.keys(patch).length) await aggiorna({ input: patch });
        onFatto?.();
      } catch (e) {
        setErrore(messaggioErrore(e));
      }
    },
  });

  return (
    <Passo titolo="La tua pagina">
      <p className="acc-nota">
        Scegli l'indirizzo della pagina, come vuoi che si riferisca a te e il tuo nome sulla pagina.
        {attuale && " Se cambi l'indirizzo, quello di prima continua a portare alla tua pagina."}
      </p>
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
              {attuale ? "Salva e continua" : "Crea la pagina"}
            </button>
          )}
        />
      </form>
    </Passo>
  );
}
