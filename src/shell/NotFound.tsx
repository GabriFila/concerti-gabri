import { useRouteContext, useRouterState } from "@tanstack/react-router";

/* La pagina 404: un handle che non esiste o un indirizzo sbagliato.
   A chi non è entrato offre anche «Entra», che torna qui dopo il login:
   è la stessa per ogni 404, così /admin (404 per chi non è admin, DECISIONI
   «Vista admin») resta indistinguibile da una pagina che non c'è, ma si
   può entrare e riaprirla. */
export function NotFound() {
  const autenticato = useRouteContext({ from: "__root__", select: c => !!c.auth?.autenticato });
  const qui = useRouterState({ select: s => s.location.pathname + s.location.searchStr });
  return (
    <main className="notfound">
      <h1 className="notfound-h">Qui non suona nessuno</h1>
      <p className="desc">Questa pagina non esiste: forse il link è sbagliato o il profilo non c'è.</p>
      <p className="notfound-azioni">
        <a className="notfound-link" href="/gabrifila">Vai ai concerti di Gabri</a>
        {!autenticato && (
          <a className="notfound-link" href={`/accedi?next=${encodeURIComponent(qui)}`}>
            Entra
          </a>
        )}
      </p>
    </main>
  );
}
