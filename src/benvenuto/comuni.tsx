/* Pezzi comuni dei passi di /benvenuto. */

import { useState, type ReactNode } from "react";
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

/** Indietro / Avanti tra i passi 2–4: avanzano `onboardingStep` sul server. */
export function Navigazione({ indietro, avanti, etichettaAvanti = "Avanti" }: { indietro?: PassoDb; avanti: PassoDb; etichettaAvanti?: string }) {
  const imposta = useMutation(api.profiles.setOnboardingStep);
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  // me.profile cambia dal vivo e /benvenuto mostra il passo nuovo
  const vai = async (passo: PassoDb) => {
    setErrore(null);
    setAttesa(true);
    try {
      await imposta({ input: { passo } });
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setAttesa(false);
    }
  };
  return (
    <div className="acc-navigazione">
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
      <button type="button" className="acc-btn" disabled={attesa} onClick={() => vai(avanti)}>
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
