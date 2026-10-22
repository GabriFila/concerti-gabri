/* ──────────────────────────────────────────────────────────────
   Lo scheletro di /<handle>/modifica (SPEC §3, PIANO traguardo 3): una
   pagina sola con le 9 sezioni di SEZIONI_MODIFICA nell'ordine del
   contratto, ognuna `<section id>` con la sua ancora, e l'indice in alto.
   Le sezioni le scrivono le corsie 5 e 7; l'Oracolo in scrittura
   (ChatScrittura, corsia 6) si rende una volta sola. In #account c'è già
   "Esci" (§1.39).
   ────────────────────────────────────────────────────────────── */

import { Link } from "@tanstack/react-router";
import { BottoneEsci } from "../accesso/Esci.tsx";
import { ChatScrittura } from "./ChatScrittura.tsx";
import { SEZIONI_MODIFICA } from "./sezioni.ts";

export function Scheletro({ handle }: { handle: string }) {
  return (
    <main className="modifica">
      <header className="modifica-testa">
        <h1 className="acc-titolo acc-titolo--piccolo">Modifica</h1>
        <p className="acc-nota">
          Le modifiche valgono subito e si annullano dal registro in Attività.{" "}
          <Link to="/$handle" params={{ handle }}>
            Vedi la pagina
          </Link>
        </p>
        <nav className="modifica-indice" aria-label="Sezioni di Modifica">
          {SEZIONI_MODIFICA.map(s => (
            <a key={s.id} href={`#${s.id}`}>
              {s.titolo}
            </a>
          ))}
        </nav>
      </header>
      {SEZIONI_MODIFICA.map(({ id, titolo, Componente }) => (
        <section key={id} id={id} className="modifica-sezione" aria-labelledby={`${id}-titolo`}>
          <h2 id={`${id}-titolo`}>{titolo}</h2>
          <Componente handle={handle} />
          {id === "account" && (
            <p className="modifica-esci">
              <BottoneEsci verso={`/${handle}`} className="acc-btn acc-btn--ghost" />
            </p>
          )}
        </section>
      ))}
      <ChatScrittura handle={handle} />
    </main>
  );
}
