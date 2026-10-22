import { createFileRoute } from "@tanstack/react-router";

/* /privacy (PIANO traguardo 3, SPEC §5 "minimo legale"): cookie,
   responsabili del trattamento, cosa è pubblico, esporta ed elimina.
   Testo statico, senza dati di nessuno. */
export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy · Concerti" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <main className="acc acc-testo">
      <p className="acc-marchio">
        <a href="/">Concerti</a>
      </p>
      <h1 className="acc-titolo acc-titolo--piccolo">Privacy</h1>
      <p>
        Concerti è un progetto tra amici: ognuno ha una pagina pubblica con i concerti che ha visto. Qui c'è cosa
        raccogliamo, dove finisce e come lo togli.
      </p>

      <h2>Cookie</h2>
      <ul>
        <li>
          <b>Sessione</b> (<code>better-auth.session_token</code> e affini): solo dopo che entri, serve a tenerti
          dentro. È tecnico, quindi niente banner.
        </li>
        <li>
          <b>Tema</b> (<code>tema</code>): ricorda se vuoi il tema chiaro, scuro o quello del sistema.
        </li>
      </ul>
      <p>Nessun cookie di profilazione o pubblicità, né nostro né di altri.</p>

      <h2>Cosa è pubblico</h2>
      <p>
        Tutte le pagine sono pubbliche: concerti, voti, compagni (con i nomi che scrivi tu: meglio soprannomi o
        diminutivi), "regalato da", wishlist, commenti, il tuo nome visualizzato e i nomi delle partenze. Restano privati
        l'email e gli indirizzi delle partenze: gli indirizzi li vedi solo tu dalla dashboard, non escono mai dal
        server e servono solo a calcolare i chilometri, che hanno sempre uno scarto casuale. Il tuo account è legato alla
        pagina con un identificativo opaco.
      </p>

      <h2>Chi tratta i dati per noi</h2>
      <ul>
        <li>
          <b>Convex</b> (database e funzioni, nell'Unione Europea): tutti i dati delle pagine e degli account.
        </li>
        <li>
          <b>Vercel</b>: ospita il sito e serve le pagine.
        </li>
        <li>
          <b>Google</b>: l'accesso con Google, se lo usi (riceviamo email e nome).
        </li>
        <li>
          <b>Google Gemini</b>: risponde alle domande fatte all'Oracolo, la chat della pagina.
        </li>
        <li>
          <b>Sentry</b> (UE): gli errori del sito, senza indirizzo IP né dati personali.
        </li>
        <li>
          <b>PostHog</b> (UE): statistiche di visita anonime, senza cookie e senza indirizzo IP.
        </li>
        <li>
          <b>OpenStreetMap Foundation</b> (Nominatim): trova le coordinate di venue e partenze. Riceve il testo
          cercato, mai chi lo cerca.
        </li>
        <li>
          <b>Resend</b>: manda il codice di accesso via email, solo quando l'accesso con email è attivo.
        </li>
      </ul>

      <h2>Esporta ed elimina</h2>
      <p>
        Dalla tua pagina, in <b>Modifica → Account</b>, puoi scaricare tutti i tuoi dati in un file (lo stesso formato
        dell'import) ed eliminare l'account: la pagina, i concerti, le persone, le partenze con i loro indirizzi, il
        registro e le conversazioni con l'Oracolo spariscono subito. Restano solo le venue del catalogo condiviso,
        senza il tuo nome.
      </p>
    </main>
  );
}
