import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { BottoneEsci } from "../accesso/Esci.tsx";
import { PannelloAccesso } from "../accesso/PannelloAccesso.tsx";
import { profiloDiChiGuarda, useProfiloDiChiGuarda } from "../lib/viewer.ts";

/* ──────────────────────────────────────────────────────────────
   La landing (PIANO traguardo 3, §1.39, §6).
   - `/?chat=<id>`: i vecchi link dell'Oracolo → 308 a `/gabrifila?chat=<id>`,
     con tutta la query string (il frammento lo conserva il browser).
   - Visitatore: "Entra / Crea il tuo sito" apre la finestra di accesso
     sopra la landing (Google e, se attivo, "Entra con email").
   - Utente entrato: "La tua pagina" e "Modifica", senza redirect. Un
     profilo ancora in `onboarding` (senza handle) va a /benvenuto.
   ────────────────────────────────────────────────────────────── */

const flagsQuery = () => convexQuery(api.authFlags.get, {});

export const Route = createFileRoute("/")({
  beforeLoad: async ({ location, context }) => {
    if ((location.search as Record<string, unknown>).chat !== undefined) {
      throw redirect({ href: "/gabrifila" + location.searchStr, statusCode: 308 });
    }
    const p = await profiloDiChiGuarda(context);
    if (p?.status === "onboarding") throw redirect({ href: "/benvenuto", statusCode: 307 });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(flagsQuery()),
  head: () => ({ meta: [{ title: "Concerti · la tua pagina dei concerti" }] }),
  component: Landing,
});

function Landing() {
  const { data: flags } = useSuspenseQuery(flagsQuery());
  const autenticato = Route.useRouteContext({ select: c => !!c.auth?.autenticato });
  const { data: me } = useProfiloDiChiGuarda();
  const [aperta, setAperta] = useState(false);

  return (
    <main className="acc acc-landing">
      <p className="acc-marchio">Concerti</p>
      <h1 className="acc-titolo">Ogni concerto che vedi, in una pagina sola.</h1>
      <p className="acc-sub">
        Voti, compagni, posti, chilometri e soldi spesi diventano grafici e numeri. La pagina è pubblica e la scrivi tu,
        dalla dashboard o col tuo agente AI.
      </p>
      <div className="acc-azioni">
        {me?.handle ? (
          <>
            <Link className="acc-btn" to="/$handle" params={{ handle: me.handle }}>
              La tua pagina
            </Link>
            <Link className="acc-btn acc-btn--ghost" to="/$handle/modifica" params={{ handle: me.handle }}>
              Modifica
            </Link>
          </>
        ) : (
          // senza JavaScript (o prima dell'idratazione) porta ad /accedi
          <a
            className="acc-btn"
            href="/accedi?next=%2Fbenvenuto"
            onClick={e => {
              e.preventDefault();
              setAperta(true);
            }}
          >
            Entra / Crea il tuo sito
          </a>
        )}
        <Link className="acc-link" to="/$handle" params={{ handle: "gabrifila" }}>
          Guarda un esempio
        </Link>
      </div>
      {me?.status === "active" && me.onboardingStep !== "fatto" && (
        <p className="acc-nota">
          <a href="/benvenuto">Riprendi la configurazione</a> da dove l'avevi lasciata.
        </p>
      )}
      <footer className="acc-piede">
        <a href="/privacy">Privacy</a>
        {autenticato && <BottoneEsci />}
      </footer>
      {aperta && <FinestraAccesso flags={flags} onChiudi={() => setAperta(false)} />}
    </main>
  );
}

/** La finestra di accesso sopra la landing; Esc o un clic fuori la chiudono. */
function FinestraAccesso({ flags, onChiudi }: { flags: { emailLogin: boolean; googleLogin: boolean }; onChiudi: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onChiudi();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChiudi]);
  return (
    <div className="acc-modale" onMouseDown={e => e.target === e.currentTarget && onChiudi()}>
      <div className="acc-finestra" role="dialog" aria-modal="true" aria-labelledby="acc-finestra-titolo">
        <div className="acc-finestra-testa">
          <h2 id="acc-finestra-titolo">Entra</h2>
          <button type="button" className="acc-chiudi" aria-label="Chiudi" onClick={onChiudi}>
            ×
          </button>
        </div>
        <PannelloAccesso next="/benvenuto" flags={flags} />
      </div>
    </div>
  );
}
