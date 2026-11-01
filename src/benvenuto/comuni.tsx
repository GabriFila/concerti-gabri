/* Pezzi comuni dei passi di /benvenuto. */

import { useState, type ReactNode } from "react";
import { revalidateLogic, type ValidationLogicFn } from "@tanstack/react-form";
import { useHydrated } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { PASSI_ONBOARDING } from "../../shared/schema/profile.ts";
import { messaggioErrore } from "../accesso/errori.ts";

export type PassoDb = (typeof PASSI_ONBOARDING)[number];

/** L'origine del sito, solo dopo l'idratazione ("" nell'HTML: niente differenze tra server e browser). */
export function useOrigine(): string {
  return useHydrated() ? window.location.origin : "";
}

/**
 * Quando si controllano i validatori `onDynamic` di un campo (la `validationLogic` di TanStack Form,
 * sopra `revalidateLogic`): mentre si scrive la prima volta niente errori, si controlla quando si
 * lascia il campo; da lì a ogni modifica, così l'errore sparisce appena è corretto. Dopo un invio,
 * tutti i campi a ogni modifica.
 */
export const dopoIlPrimoBlur: ValidationLogicFn = props => {
  // handleBlur segna il campo come lasciato prima di validare: il blur stesso controlla sempre
  const lasciato = props.event.type !== "blur" && !!props.event.fieldName && !!props.form.getFieldMeta(props.event.fieldName)?.isBlurred;
  return revalidateLogic({ mode: lasciato ? "change" : "blur", modeAfterSubmission: "change" })(props);
};

/** I primi errori di un campo di TanStack Form, solo dopo che è stato toccato. */
export function ErroriCampo({ meta }: { meta: { isTouched: boolean; errors: unknown[] } }) {
  const msg = meta.isTouched ? meta.errors.filter((e): e is string => typeof e === "string")[0] : undefined;
  return msg ? <span className="acc-errore-campo">{msg}</span> : null;
}

/** Un bottone "Copia" per un testo lungo (URL, prompt, comando). */
export function Copia({ testo, etichetta = "Copia" }: { testo: string; etichetta?: string }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <button
      type="button"
      className="acc-btn acc-btn--ghost acc-btn--piccolo"
      disabled={!testo}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(testo);
          setCopiato(true);
          setTimeout(() => setCopiato(false), 2000);
        } catch {
          setCopiato(false);
        }
      }}
    >
      {copiato ? "Copiato" : etichetta}
    </button>
  );
}

/** Dove porta un bottone di Navigazione: un passo sul server, oppure una parte dello stesso passo. */
type Meta = PassoDb | (() => void);

/** Indietro / Avanti tra i passi 2–4: avanzano `onboardingStep` sul server (o cambiano parte del passo, con una
 *  funzione). Avanti è l'azione principale del passo, tranne con `avantiSecondario` (es. "Salta per ora" quando la
 *  principale è un'altra). `fissa`: la barra resta in fondo allo schermo, così Avanti si vede senza scorrere. */
export function Navigazione({
  indietro,
  avanti,
  etichettaAvanti = "Avanti",
  avantiSecondario = false,
  fissa = false,
}: {
  indietro?: Meta;
  avanti: Meta;
  etichettaAvanti?: string;
  avantiSecondario?: boolean;
  fissa?: boolean;
}) {
  const imposta = useMutation(api.profiles.setOnboardingStep);
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // me.profile cambia dal vivo e /benvenuto mostra il passo nuovo
  const vai = async (meta: Meta) => {
    if (typeof meta === "function") return meta();
    setErrore(null);
    setAttesa(true);
    try {
      await imposta({ input: { passo: meta } });
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setAttesa(false);
    }
  };
  return (
    <div className={fissa ? "acc-navigazione acc-navigazione--fissa" : "acc-navigazione"}>
      {errore && (
        <p className="acc-errore" role="alert">
          {errore}
        </p>
      )}
      {indietro && (
        <button type="button" className="acc-btn acc-btn--ghost" disabled={attesa} onClick={() => vai(indietro)}>
          Indietro
        </button>
      )}
      <button type="button" className={avantiSecondario ? "acc-btn acc-btn--ghost" : "acc-btn"} disabled={attesa} onClick={() => vai(avanti)}>
        {etichettaAvanti}
      </button>
    </div>
  );
}

export function Passo({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <section className="acc-passo" aria-labelledby="acc-passo-titolo">
      <h2 id="acc-passo-titolo">{titolo}</h2>
      {children}
    </section>
  );
}
