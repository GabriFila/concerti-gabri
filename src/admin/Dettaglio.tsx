/* /admin/<handle>: i conteggi di un profilo, le partenze (solo nome e
   indirizzo impostato o mancante), le sezioni nascoste, le ultime 50 righe
   del registro e i metadati delle chat (delle private nemmeno il titolo).
   Sola lettura. */

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { quando, queryProfilo, useRegistraAccesso, type DettaglioProfilo } from "./comuni.ts";

const VIA: Record<DettaglioProfilo["registro"][number]["via"], string> = {
  dashboard: "Dashboard",
  oracolo: "Tour manager",
  mcp: "MCP",
  apikey: "API key",
  sistema: "Sistema",
};

export function Dettaglio({ handle }: { handle: string }) {
  const { data } = useSuspenseQuery(queryProfilo(handle));
  useRegistraAccesso("profilo", handle);
  if (!data) return null; // il loader ha già risposto 404; dal vivo il profilo può sparire
  const c = data.conteggi;
  const conteggi: [string, string][] = [
    ["Eventi", String(c.eventi)],
    ["Concerti", String(c.concerti)],
    ["Persone", String(c.persone)],
    ["Foto", String(c.foto)],
    ["Wishlist", String(c.wishlist)],
    ["Chat pubbliche", c.chatOltre ? `${c.chatPubbliche}+` : String(c.chatPubbliche)],
    ["Chat private", c.chatOltre ? `${c.chatPrivate}+` : String(c.chatPrivate)],
  ];

  return (
    <main className="ad" id="contenuto">
      <Link className="ad-link ad-indietro" to="/admin">
        ← Tutti i profili
      </Link>
      <header className="ad-testa">
        <h1 className="ad-h1">{data.displayName ?? data.handle}</h1>
        <p className="ad-nota">
          {data.handle} · <span className="ad-stato">{data.status === "active" ? "attivo" : "onboarding"}</span> · creato {quando(data._creationTime)} · ultima modifica{" "}
          {quando(data.ultimaAttivita)}
        </p>
      </header>
      {data.status === "active" && data.handle ? (
        <p className="ad-link-riga">
          <Link className="ad-link" to="/$handle" params={{ handle: data.handle }}>
            Sul palco
          </Link>
          <Link className="ad-link" to="/$handle/dati" params={{ handle: data.handle }}>
            I dati
          </Link>
        </p>
      ) : null}

      <h2 className="ad-h2">Conteggi</h2>
      <dl className="ad-conteggi">
        {conteggi.map(([dt, dd]) => (
          <div className="ad-conteggio" key={dt}>
            <dt>{dt}</dt>
            <dd>{dd}</dd>
          </div>
        ))}
      </dl>

      <h2 className="ad-h2">Partenze</h2>
      {data.partenze.length ? (
        <ul className="ad-elenco">
          {data.partenze.map(d => (
            <li key={d.nome}>
              {d.nome} <span className="ad-muto">· {d.indirizzo ? "indirizzo impostato" : "indirizzo mancante"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ad-nota">Nessuna partenza.</p>
      )}

      <h2 className="ad-h2">Sezioni nascoste</h2>
      {data.sezioniNascoste.length ? (
        <ul className="ad-elenco">
          {data.sezioniNascoste.map(s => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      ) : (
        <p className="ad-nota">Nessuna: il layout mostra tutte le sezioni.</p>
      )}

      <h2 className="ad-h2">Registro (ultime {data.registro.length})</h2>
      {data.registro.length ? (
        <div className="ad-scorri" role="region" aria-label="Registro delle modifiche" tabIndex={0}>
          <table className="ad-tabella">
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Autore</th>
                <th scope="col">Operazione</th>
                <th scope="col">Riassunto</th>
              </tr>
            </thead>
            <tbody>
              {data.registro.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td>{quando(r.at)}</td>
                  <td>
                    {r.autore}
                    {r.autore !== VIA[r.via] ? <span className="ad-muto"> · {VIA[r.via]}</span> : null}
                  </td>
                  <td>{r.op}</td>
                  <td className="ad-testo">
                    {r.riassunto}
                    {r.annullata ? <span className="ad-muto"> (annullata)</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ad-nota">Nessuna modifica registrata.</p>
      )}

      <h2 className="ad-h2">Chat</h2>
      <p className="ad-nota">Solo metadati: delle conversazioni private con il Tour manager non si vede nemmeno il titolo.</p>
      {data.chat.length ? (
        <div className="ad-scorri" role="region" aria-label="Conversazioni" tabIndex={0}>
          <table className="ad-tabella">
            <thead>
              <tr>
                <th scope="col">Visibilità</th>
                <th scope="col">Titolo</th>
                <th scope="col" className="ad-num">
                  Messaggi
                </th>
                <th scope="col">Iniziata</th>
                <th scope="col">Ultimo messaggio</th>
                <th scope="col">Scade</th>
              </tr>
            </thead>
            <tbody>
              {data.chat.map((t, i) => (
                <tr key={`${t.creata}-${i}`}>
                  <td>{t.visibility === "pubblica" ? "pubblica" : "privata (Tour manager)"}</td>
                  <td className="ad-testo">
                    {t.visibility === "pubblica" ? (
                      <>
                        {t.titolo}
                        {t.autore ? <span className="ad-muto"> · {t.autore}</span> : null}
                      </>
                    ) : (
                      <span className="ad-muto">—</span>
                    )}
                  </td>
                  <td className="ad-num">{t.messaggi}</td>
                  <td>{quando(t.creata)}</td>
                  <td>{quando(t.aggiornata)}</td>
                  <td>{quando(t.scade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ad-nota">Nessuna conversazione.</p>
      )}
    </main>
  );
}
