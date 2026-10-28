import { useEffect, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../convex/_generated/api";
import { BottoneEsci } from "../accesso/Esci.tsx";
import { PannelloAccesso, type FlagsAccesso } from "../accesso/PannelloAccesso.tsx";
import { profiloDiChiGuarda } from "../lib/viewer.ts";

/* ──────────────────────────────────────────────────────────────
   La landing (PIANO traguardo 3, §6; §1.39 rivisto nella Fase 3).
   - `/?chat=<id>`: i vecchi link dell'Oracolo → 308 a `/gabrifila?chat=<id>`,
     con tutta la query string (il frammento lo conserva il browser). Vince
     su tutto, anche per chi è entrato.
   - Chi è entrato non vede la landing (307, nell'SSR e nelle navigazioni
     del browser: beforeLoad gira in tutti e due):
     - onboarding finito (`active`, passo `fatto`) → la sua pagina `/<handle>`;
     - altrimenti → /benvenuto: senza handle non c'è ancora una pagina, e
       un profilo `active` a metà dei passi 2–4 li riprende da dove li
       aveva lasciati (si saltano con un clic, e un link porta comunque
       alla pagina: chi vuole finisce dopo; da `fatto` in poi si cambia
       tutto da Modifica).
     L'HTML e i redirect dell'SSR escono `private, no-store` (src/server.ts):
     un redirect diverso per sessione non finisce in nessuna cache. Anche il
     marchio "Concerti" che porta a `/` (accesso, privacy) riporta così chi
     è entrato alla sua pagina.
   - Visitatore: "Crea la tua pagina" (l'azione principale) apre la finestra di
     accesso sopra la landing: Google crea l'account o entra in quello che
     c'è, "Entra con email" solo dove PannelloAccesso la mostra. "Guarda un
     esempio" e, per chi ha già un account, "Entra" sono link, in grigio:
     l'ambra resta all'azione principale. Senza JavaScript (o prima
     dell'idratazione) i link portano ad /accedi.
   ────────────────────────────────────────────────────────────── */

const flagsQuery = () => convexQuery(api.authFlags.get, {});

export const Route = createFileRoute("/")({
  beforeLoad: async ({ location, context }) => {
    if ((location.search as Record<string, unknown>).chat !== undefined) {
      throw redirect({ href: "/gabrifila" + location.searchStr, statusCode: 308 });
    }
    const p = await profiloDiChiGuarda(context);
    if (!p) return;
    if (p.status === "active" && p.handle && p.onboardingStep === "fatto") {
      throw redirect({ to: "/$handle", params: { handle: p.handle }, statusCode: 307 });
    }
    throw redirect({ href: "/benvenuto", statusCode: 307 });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(flagsQuery()),
  head: () => ({ meta: [{ title: "Concerti · la tua pagina dei concerti" }] }),
  component: Landing,
});

/** Da dove si apre la finestra: il suo titolo e dove si arriva dopo l'accesso. */
type Finestra = { titolo: string; next: string };

const CREA: Finestra = { titolo: "Crea la tua pagina", next: "/benvenuto" };
// chi ha già un account torna a `/`, che lo porta alla sua pagina (o a /benvenuto)
const ENTRA: Finestra = { titolo: "Entra", next: "/" };

const hrefAccedi = (f: Finestra) => `/accedi?next=${encodeURIComponent(f.next)}`;

function Landing() {
  const { data: flags } = useSuspenseQuery(flagsQuery());
  // da entrato qui arriva solo un account senza profilo: gli resta "Esci"
  const autenticato = Route.useRouteContext({ select: c => !!c.auth?.autenticato });
  const [aperta, setAperta] = useState<Finestra | null>(null);
  const apri = (f: Finestra) => (e: { preventDefault(): void }) => {
    e.preventDefault();
    setAperta(f);
  };

  return (
    <main className="acc acc-landing">
      <p className="acc-marchio">Concerti</p>
      <h1 className="acc-titolo">
        Tutti i tuoi concerti,{" "}
        <br />
        in un solo posto.
      </h1>
      <div className="acc-azioni">
        <a className="acc-btn" href={hrefAccedi(CREA)} onClick={apri(CREA)}>
          Crea la tua pagina
        </a>
        <Link className="acc-link" to="/$handle" params={{ handle: "gabrifila" }}>
          Guarda un esempio
        </Link>
      </div>
      <p className="acc-secondaria">
        Hai già un account?{" "}
        <a className="acc-link" href={hrefAccedi(ENTRA)} onClick={apri(ENTRA)}>
          Entra
        </a>
      </p>
      <footer className="acc-piede">
        <a href="/privacy">Privacy</a>
        {autenticato && <BottoneEsci />}
      </footer>
      {aperta && <FinestraAccesso finestra={aperta} flags={flags} onChiudi={() => setAperta(null)} />}
    </main>
  );
}

/** La finestra di accesso sopra la landing; Esc o un clic fuori la chiudono. */
function FinestraAccesso({ finestra, flags, onChiudi }: { finestra: Finestra; flags: FlagsAccesso; onChiudi: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onChiudi();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onChiudi]);
  return (
    <div className="acc-modale" onMouseDown={e => e.target === e.currentTarget && onChiudi()}>
      <div className="acc-finestra" role="dialog" aria-modal="true" aria-labelledby="acc-finestra-titolo">
        <div className="acc-finestra-testa">
          <h2 id="acc-finestra-titolo">{finestra.titolo}</h2>
          <button type="button" className="acc-chiudi" aria-label="Chiudi" onClick={onChiudi}>
            ×
          </button>
        </div>
        <PannelloAccesso next={finestra.next} flags={flags} />
      </div>
    </div>
  );
}
