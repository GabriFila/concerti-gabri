/* /admin: la tabella ordinabile di tutti i profili (anche quelli a metà
   onboarding, senza handle), con i link alla pagina, a «I dati» e al
   dettaglio. Sola lettura. */

import { useMemo, useState, type ReactNode } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { giorno, quando, queryProfili, useRegistraAccesso, type VoceProfilo } from "./comuni.ts";

type Valore = string | number | null;
interface Colonna {
  id: string;
  titolo: string;
  num?: boolean;
  valore: (p: VoceProfilo) => Valore;
  cella?: (p: VoceProfilo) => ReactNode;
}

const conTetto = (n: number, oltre: boolean) => (oltre ? `${n}+` : String(n));

const COLONNE: Colonna[] = [
  {
    id: "profilo",
    titolo: "Profilo",
    valore: p => p.handle ?? "",
    cella: p =>
      p.handle ? (
        <>
          <Link className="ad-link" to="/admin/$handle" params={{ handle: p.handle }}>
            {p.handle}
          </Link>
          {p.displayName && p.displayName !== p.handle ? <span className="ad-muto"> · {p.displayName}</span> : null}
        </>
      ) : (
        <span className="ad-muto">senza handle{p.displayName ? ` · ${p.displayName}` : ""}</span>
      ),
  },
  { id: "stato", titolo: "Stato", valore: p => p.status, cella: p => <span className="ad-stato">{p.status === "active" ? "attivo" : "onboarding"}</span> },
  { id: "creato", titolo: "Creato", valore: p => p._creationTime, cella: p => giorno(p._creationTime) },
  { id: "attivita", titolo: "Ultima modifica", valore: p => p.ultimaAttivita, cella: p => quando(p.ultimaAttivita) },
  { id: "eventi", titolo: "Eventi", num: true, valore: p => p.conteggi.eventi },
  { id: "concerti", titolo: "Concerti", num: true, valore: p => p.conteggi.concerti },
  { id: "persone", titolo: "Persone", num: true, valore: p => p.conteggi.persone },
  { id: "foto", titolo: "Foto", num: true, valore: p => p.conteggi.foto },
  { id: "wishlist", titolo: "Wishlist", num: true, valore: p => p.conteggi.wishlist },
  { id: "chatPubbliche", titolo: "Chat pubbliche", num: true, valore: p => p.conteggi.chatPubbliche, cella: p => conTetto(p.conteggi.chatPubbliche, p.conteggi.chatOltre) },
  { id: "chatPrivate", titolo: "Chat private", num: true, valore: p => p.conteggi.chatPrivate, cella: p => conTetto(p.conteggi.chatPrivate, p.conteggi.chatOltre) },
  {
    id: "partenze",
    titolo: "Partenze",
    num: true,
    valore: p => p.partenze.length,
    cella: p => {
      const senza = p.partenze.filter(d => !d.indirizzo).length;
      return senza ? `${p.partenze.length} (${senza} senza indirizzo)` : String(p.partenze.length);
    },
  },
  { id: "nascoste", titolo: "Sezioni nascoste", num: true, valore: p => p.sezioniNascoste.length },
];

type Verso = "asc" | "desc";

function confronta(a: Valore, b: Valore): number {
  // i vuoti (null, "") sempre in fondo
  const vuotoA = a === null || a === "";
  const vuotoB = b === null || b === "";
  if (vuotoA || vuotoB) return vuotoA === vuotoB ? 0 : vuotoA ? 1 : -1;
  return typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "it");
}

export function Elenco() {
  const { data } = useSuspenseQuery(queryProfili());
  useRegistraAccesso("elenco");
  const [ordine, setOrdine] = useState<{ col: string; verso: Verso }>({ col: "attivita", verso: "desc" });
  const righe = useMemo(() => {
    const col = COLONNE.find(c => c.id === ordine.col)!;
    const segno = ordine.verso === "asc" ? 1 : -1;
    return [...data].sort((a, b) => {
      const va = col.valore(a);
      const vb = col.valore(b);
      const vuoto = (x: Valore) => x === null || x === "";
      // i vuoti restano in fondo in tutti e due i versi
      if (vuoto(va) || vuoto(vb)) return confronta(va, vb);
      return segno * confronta(va, vb);
    });
  }, [data, ordine]);

  const ordina = (id: string) =>
    setOrdine(o => (o.col === id ? { col: id, verso: o.verso === "asc" ? "desc" : "asc" } : { col: id, verso: COLONNE.find(c => c.id === id)!.num || id === "attivita" || id === "creato" ? "desc" : "asc" }));

  const attivi = data.filter(p => p.status === "active").length;

  return (
    <main className="ad" id="contenuto">
      <header className="ad-testa">
        <h1 className="ad-h1">Profili</h1>
        <p className="ad-nota">
          {data.length} profili, {attivi} attivi · sola lettura
        </p>
      </header>
      <div className="ad-scorri" role="region" aria-label="Tabella dei profili" tabIndex={0}>
        <table className="ad-tabella ad-fissa">
          <caption className="ad-didascalia">
            Tocca un'intestazione per ordinare.
          </caption>
          <thead>
            <tr>
              {COLONNE.map(c => {
                const attiva = ordine.col === c.id;
                return (
                  <th key={c.id} scope="col" className={c.num ? "ad-num" : undefined} aria-sort={attiva ? (ordine.verso === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className="ad-ordina" onClick={() => ordina(c.id)}>
                      {c.titolo}
                      <span className="ad-freccia" aria-hidden="true">
                        {attiva ? (ordine.verso === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th scope="col">Link</th>
            </tr>
          </thead>
          <tbody>
            {righe.map(p => (
              <tr key={p._id}>
                {COLONNE.map(c => (
                  <td key={c.id} className={c.num ? "ad-num" : undefined}>
                    {c.cella ? c.cella(p) : c.valore(p)}
                  </td>
                ))}
                <td>
                  {p.handle && p.status === "active" ? (
                    <span className="ad-link-riga">
                      <Link className="ad-link" to="/$handle" params={{ handle: p.handle }}>
                        Pagina
                      </Link>
                      <Link className="ad-link" to="/$handle/dati" params={{ handle: p.handle }}>
                        Dati
                      </Link>
                    </span>
                  ) : (
                    <span className="ad-muto">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
