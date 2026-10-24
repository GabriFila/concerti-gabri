/* ──────────────────────────────────────────────────────────────
   /benvenuto (PIANO traguardo 3, §1.19, §6 guard): i 5 passi del primo
   accesso, ripresi da dove si era rimasti. Il passo viene dal profilo
   (`me.profile`, dal vivo): `onboarding` → 1, poi `onboardingStep`
   partenze → 2, agente → 3, regali → 4, fatto → 5 ("pagina pronta").
   Ogni "Avanti" scrive il passo sul server, quindi un reload riprende lì.
   Finché i passi 2–4 non sono finiti anche `/` porta qui (routes/index.tsx):
   un link sotto il passo porta comunque alla pagina, che dal passo 1
   esiste già, e la prossima volta si riprende da dov'era.
   A onboarding finito il guard della rotta porta a /<handle>/modifica.
   ────────────────────────────────────────────────────────────── */

import { Link } from "@tanstack/react-router";
import { BottoneEsci } from "../accesso/Esci.tsx";
import { useProfiloDiChiGuarda } from "../lib/viewer.ts";
import type { PassoDb } from "./comuni.tsx";
import { PassoAgente } from "./PassoAgente.tsx";
import { PassoPartenze } from "./PassoPartenze.tsx";
import { PassoProfilo } from "./PassoProfilo.tsx";
import { PassoRegali } from "./PassoRegali.tsx";

const NUMERO: Record<PassoDb, number> = { partenze: 2, agente: 3, regali: 4, fatto: 5 };
const NOMI = ["La pagina", "Partenze", "Agente", "Regalato da", "Pronta"];

export function Benvenuto() {
  const { data: me, isPending } = useProfiloDiChiGuarda();

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

  const passo = me.status === "onboarding" || !me.handle ? 1 : NUMERO[me.onboardingStep];
  return (
    <main className="acc acc-benvenuto">
      <p className="acc-marchio">
        <a href="/">Concerti</a>
      </p>
      <h1 className="acc-titolo acc-titolo--piccolo">Ti diamo il benvenuto</h1>
      <ol className="acc-passi" aria-label="Passi">
        {NOMI.map((nome, i) => (
          <li key={nome} className={i + 1 === passo ? "on" : i + 1 < passo ? "fatto" : undefined} aria-current={i + 1 === passo ? "step" : undefined}>
            {nome}
          </li>
        ))}
      </ol>
      <p className="acc-piccolo">
        Passo {passo} di {NOMI.length}
      </p>

      {passo === 1 && <PassoProfilo />}
      {passo === 2 && <PassoPartenze />}
      {passo === 3 && me.handle && <PassoAgente handle={me.handle} />}
      {passo === 4 && <PassoRegali />}
      {passo >= 2 && passo <= 4 && me.handle && (
        <p className="acc-secondaria">
          Puoi finire dopo:{" "}
          <Link className="acc-link" to="/$handle" params={{ handle: me.handle }}>
            vai alla tua pagina
          </Link>
          . La prossima volta riprendi da qui.
        </p>
      )}
      {passo === 5 && me.handle && (
        <section className="acc-passo" aria-labelledby="acc-passo-titolo">
          <h2 id="acc-passo-titolo">La tua pagina è pronta</h2>
          <p className="acc-nota">Ha già il tema predefinito: lo stile, i concerti e tutto il resto si cambiano da Modifica.</p>
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
