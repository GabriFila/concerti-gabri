/* ──────────────────────────────────────────────────────────────
   /benvenuto (PIANO traguardo 3, §1.19, §6 guard): i 4 passi del primo
   accesso, ripresi da dove si era rimasti. Il passo viene dal profilo
   (`me.profile`, dal vivo): `onboarding` → 1, poi `onboardingStep`
   partenze → 2, agente → 3, fatto → 4 ("pagina pronta"). Il passo
   "regalato da" non c'è più (si gestisce da #regali): chi era rimasto lì
   riprende dall'agente, il cui Avanti chiude l'onboarding.
   Ogni "Avanti" scrive il passo sul server, quindi un reload riprende lì.
   Finché i passi 2–3 non sono finiti anche `/` porta qui (routes/index.tsx):
   un link sotto il passo porta comunque alla pagina, che dal passo 1
   esiste già, e la prossima volta si riprende da dov'era.
   A onboarding finito il guard della rotta porta a /<handle>/modifica.
   I passi già raggiunti nell'elenco in alto si cliccano per tornarci: il 2
   e il 3 riportano lì `onboardingStep` (come Indietro), il 1 riapre il
   form del profilo in modifica (`profiles.update`) senza toccare il passo
   salvato, che resta quello a cui si torna.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { messaggioErrore } from "../accesso/errori.ts";
import { BottoneEsci } from "../accesso/Esci.tsx";
import { useProfiloDiChiGuarda } from "../lib/viewer.ts";
import type { PassoDb } from "./comuni.tsx";
import { PassoAgente } from "./PassoAgente.tsx";
import { PassoPartenze } from "./PassoPartenze.tsx";
import { PassoProfilo, RivediProfilo } from "./PassoProfilo.tsx";

const NUMERO: Record<PassoDb, number> = { partenze: 2, agente: 3, regali: 3, fatto: 4 };
const NOMI = ["La pagina", "Partenze", "Agente", "Pronta"];
/** Il passo da scrivere sul server per tornare ai passi 2 e 3 (il 4 si raggiunge solo con Avanti). */
const DB: Partial<Record<number, PassoDb>> = { 2: "partenze", 3: "agente" };

export function Benvenuto() {
  const { data: me, isPending } = useProfiloDiChiGuarda();
  const imposta = useMutation(api.profiles.setOnboardingStep);
  // il passo 1 riaperto dall'elenco: vive solo qui, il server resta sul passo raggiunto
  const [rivedoProfilo, setRivedoProfilo] = useState(false);
  const [attesa, setAttesa] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  if (!me) {
    return (
      <main className="acc acc-benvenuto">
        <p className="acc-marchio">
          <a href="/">Concerti</a>
        </p>
        {isPending ? (
          <p className="acc-nota">Un attimo…</p>
        ) : (
          <>
            <p className="acc-nota">Non troviamo il profilo di questo account. Esci e rientra; se succede ancora, scrivici.</p>
            <BottoneEsci verso="/" className="acc-btn" />
          </>
        )}
      </main>
    );
  }

  const raggiunto = me.status === "onboarding" || !me.handle ? 1 : NUMERO[me.onboardingStep];
  const passo = rivedoProfilo && raggiunto > 1 ? 1 : raggiunto;
  const vaiA = async (n: number) => {
    setErrore(null);
    setRivedoProfilo(n === 1);
    const db = DB[n];
    if (n === 1 || n === raggiunto || !db) return;
    setAttesa(true);
    try {
      // me.profile cambia dal vivo e qui si vede il passo scelto
      await imposta({ input: { passo: db } });
    } catch (e) {
      setErrore(messaggioErrore(e));
    } finally {
      setAttesa(false);
    }
  };
  return (
    <main className="acc acc-benvenuto">
      <p className="acc-marchio">
        <a href="/">Concerti</a>
      </p>
      <h1 className="acc-titolo acc-titolo--piccolo">Ti diamo il benvenuto</h1>
      <ol className="acc-passi" aria-label="Passi">
        {NOMI.map((nome, i) => {
          const n = i + 1;
          // ogni passo già raggiunto (anche quello da cui si è tornati indietro col passo 1) si riapre
          const cliccabile = n !== passo && n <= raggiunto;
          return (
            <li key={nome} className={n === passo ? "on" : n <= raggiunto ? "fatto" : undefined} aria-current={n === passo ? "step" : undefined}>
              {cliccabile ? (
                <button type="button" className="acc-passi-vai" disabled={attesa} onClick={() => void vaiA(n)}>
                  {nome}
                </button>
              ) : (
                nome
              )}
            </li>
          );
        })}
      </ol>
      <p className="acc-piccolo">
        Passo {passo} di {NOMI.length}
      </p>
      {errore && (
        <p className="acc-errore" role="alert">
          {errore}
        </p>
      )}

      {passo === 1 && (raggiunto > 1 ? <RivediProfilo onFatto={() => setRivedoProfilo(false)} /> : <PassoProfilo />)}
      {passo === 2 && <PassoPartenze />}
      {passo === 3 && me.handle && <PassoAgente handle={me.handle} />}
      {passo >= 2 && passo <= 3 && me.handle && (
        <p className="acc-secondaria">
          Puoi finire dopo:{" "}
          <Link className="acc-link" to="/$handle" params={{ handle: me.handle }}>
            vai alla tua pagina
          </Link>
          . La prossima volta riprendi da qui.
        </p>
      )}
      {passo === 4 && me.handle && (
        <section className="acc-passo" aria-labelledby="acc-passo-titolo">
          <h2 id="acc-passo-titolo">La tua pagina è pronta</h2>
          <div className="acc-azioni">
            <Link className="acc-btn" to="/$handle" params={{ handle: me.handle }}>
              Vai alla tua pagina
            </Link>
            <Link className="acc-btn acc-btn--ghost" to="/$handle/modifica" params={{ handle: me.handle }}>
              Modifica
            </Link>
          </div>
        </section>
      )}
      <footer className="acc-piede">
        <a href="/privacy">Privacy</a>
        <BottoneEsci verso="/" />
      </footer>
    </main>
  );
}
