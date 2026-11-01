/* ──────────────────────────────────────────────────────────────
   I campi del form di un concerto che servono anche fuori dal pannello
   (#concerti, spec ux-modifica §6.2; la scheda dell'Oracolo li usa così
   come sono): la venue, i compagni, il prezzo e le liste di nomi.

   - Compagni: nomi già tra le persone; uno nuovo si aggiunge da qui, con
     la regola dei soprannomi (§1.42). Con `creaSubito={false}` (il
     «Modulo completo» della scheda dell'Oracolo) la persona nuova resta
     un chip segnato «nuova» e non si crea: la crea il salvataggio della
     scheda. Sotto, le scorciatoie «Frequenti».
   - Venue: una delle tue (ognuno ha le sue, DECISIONI «Venue per
     profilo»), oppure nuova col nome che scrivi: la si cerca su
     OpenStreetMap e si sceglie tra i risultati, o se non c'è se ne cerca
     l'indirizzo. Il nome del posto, mai un indirizzo. Le scorciatoie
     «Usate di recente» sono le venue degli ultimi concerti.
   - Suggerimenti ed errori stanno fuori dalle etichette, indicati da
     aria-describedby; `segno` va accanto all'etichetta (il punto
     «proposto dall'Oracolo»).
   ────────────────────────────────────────────────────────────── */

import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { api } from "../../../convex/_generated/api";
import { concertoInput } from "../../../shared/schema/entry.ts";
import { Errore, ErroriCampo, Soprannomi, useConvex, useDati, useDescrizione, useOperazione } from "./comuni.tsx";
import { sembraIndirizzoCivico } from "../../../shared/lib/nomi.ts";
import { chiaveNome, descrizione } from "./forme.ts";

const C = concertoInput.shape;

/** Il prezzo, quando nel biglietto c'è «Ricordo il prezzo» («Non ricordo il prezzo» è `"na"`, ConcertoForm.tsx); vuoto = non si sa. */
export function CampoCosto({ f, segno }: { f: AnyFieldApi; segno?: ReactNode }) {
  const v = f.state.value as number | "na" | undefined;
  const d = useDescrizione(f, true);
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Prezzo (€)
        {segno}
      </label>
      <input
        id={d.id}
        type="number"
        inputMode="decimal"
        min={0}
        step={0.01}
        value={typeof v === "number" ? v : ""}
        onChange={e => f.handleChange(e.target.value === "" ? undefined : Number(e.target.value))}
        onBlur={f.handleBlur}
        aria-invalid={d.invalido}
        aria-describedby={d.descritto}
      />
      {/* la descrizione per gli agenti spiega "na"; qui è la scelta «Non ricordo il prezzo» del biglietto */}
      <span id={d.idAiuto} className="mod-hint">{descrizione(C.cost)?.replace(/,?\s*oppure "na".*$/, ".")}</span>
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}

/** Scorciatoie a un tocco sotto un campo («Frequenti:», «Usate di recente:»). */
function Rapidi({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div className="mf-rapidi" role="group" aria-label={titolo}>
      <span className="mf-rapidi-titolo" aria-hidden="true">{titolo}:</span>
      {children}
    </div>
  );
}

/**
 * I compagni di un concerto: nomi già tra le persone (senza maiuscole e
 * accenti), oppure una persona nuova aggiunta da qui (con `creaSubito`
 * falso resta un chip «nuova», senza scritture).
 */
export function PersoneScelte({ f, persone, creaSubito = true, frequenti = [], segno, etichetta = "Con chi" }: {
  f: AnyFieldApi;
  persone: string[];
  /** false: «Nuova persona» aggiunge solo il chip, segnato «nuova» (niente people.add). */
  creaSubito?: boolean;
  /** Le persone con più concerti (compagniFrequenti): un tocco le aggiunge. */
  frequenti?: string[];
  segno?: ReactNode;
  etichetta?: string;
}) {
  const convex = useConvex();
  const op = useOperazione();
  const [testo, setTesto] = useState("");
  const lista = useId();
  const idEtichetta = useId();
  const d = useDescrizione(f, true);
  const valore = (f.state.value as string[]) ?? [];
  const nome = testo.trim();
  const trovato = persone.find(p => chiaveNome(p) === chiaveNome(nome));
  const scelti = new Set(valore.map(chiaveNome));
  const note = new Set(persone.map(chiaveNome));
  // i nomi già noti che somigliano a quello scritto: meglio sceglierne uno che creare un doppione
  const simili = nome.length >= 2 ? persone.filter(p => !scelti.has(chiaveNome(p)) && chiaveNome(p).includes(chiaveNome(nome))).slice(0, 5) : [];
  const liberi = frequenti.filter(p => !scelti.has(chiaveNome(p)));

  const aggiungiNome = (n: string) => {
    if (!scelti.has(chiaveNome(n))) f.handleChange([...valore, n]);
    setTesto("");
  };

  const aggiungi = async () => {
    if (!nome) return;
    if (!trovato && creaSubito) {
      const r = await op.esegui(() => convex.mutation(api.people.add, { name: nome }));
      if (!r) return;
    }
    aggiungiNome(trovato ?? nome);
  };

  return (
    <div className="mod-campo" role="group" aria-labelledby={idEtichetta} data-campo={f.name}>
      <span className="mod-etichetta" id={idEtichetta}>
        {etichetta}
        {segno}
      </span>
      {valore.length > 0 && (
        <ul className="mod-chips" aria-label="Compagni">
          {valore.map(n => (
            <li key={n} className="mod-chip">
              {n}
              {!note.has(chiaveNome(n)) && <span className="mf-nuova">nuova</span>}
              <button type="button" aria-label={`Togli ${n}`} onClick={() => f.handleChange(valore.filter(x => x !== n))}>×</button>
            </li>
          ))}
        </ul>
      )}
      <div className="mod-riga">
        <input
          list={lista}
          value={testo}
          placeholder="Aggiungi un compagno"
          aria-label="Aggiungi un compagno"
          aria-describedby={d.descritto}
          aria-invalid={d.invalido}
          maxLength={40}
          onChange={e => setTesto(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              void aggiungi();
            }
          }}
        />
        <button type="button" className="mod-btn" disabled={!nome || op.inCorso} onClick={() => void aggiungi()}>
          {nome && !trovato ? "Nuova persona" : "Aggiungi"}
        </button>
      </div>
      <datalist id={lista}>
        {persone.filter(p => !scelti.has(chiaveNome(p))).map(p => <option key={p} value={p} />)}
      </datalist>
      {nome && !trovato && simili.length > 0 && (
        <div className="mod-riga mod-simili">
          <span className="mod-hint">Forse:</span>
          {simili.map(p => (
            <button key={p} type="button" className="mod-btn" onClick={() => aggiungiNome(p)}>{p}</button>
          ))}
        </div>
      )}
      {nome && !trovato && (
        <span className="mod-hint">
          «{nome}» non è ancora tra le tue persone: «Nuova persona» {creaSubito ? "la aggiunge." : "la segna come nuova (la crea il salvataggio della scheda)."}
        </span>
      )}
      {!nome && liberi.length > 0 && (
        <Rapidi titolo="Frequenti">
          {liberi.map(p => (
            <button key={p} type="button" className="mf-rapido" onClick={() => aggiungiNome(p)}>{p}</button>
          ))}
        </Rapidi>
      )}
      <div id={d.idAiuto}>
        <Soprannomi />
      </div>
      <Errore errore={op.errore} />
      <ErroriCampo f={f} id={d.idErrore} />
    </div>
  );
}


type Candidato = { ref: string; name: string; city: string; label: string };

/**
 * La venue: una delle tue (ognuno ha le sue), oppure una nuova col nome che scrivi. Per una nuova si
 * cerca il nome su OpenStreetMap (geo.searchVenue) e si sceglie tra i risultati; se non c'è, si cerca il
 * suo indirizzo (geo.cercaIndirizzoVenue). La venue nasce subito (venues.createFromCandidate) col nome
 * scritto e la posizione scelta. Ultima spiaggia, nome e città: la crea il salvataggio e la posizione la
 * cerca il server (lib/venueUtente.ts). `recenti` sono le scorciatoie «Usate di recente»; `iniziale`
 * riempie il nome e la città (la scheda dell'Oracolo).
 */
export function VenueScelta({ venue, city, onScegli, errore, recenti = [], segno, iniziale }: {
  venue: string;
  city: string;
  onScegli: (venue: string, city: string) => void;
  errore?: ReactNode;
  recenti?: { venue: string; city: string }[];
  segno?: ReactNode;
  iniziale?: { venue: string; city: string };
}) {
  const convex = useConvex();
  const op = useOperazione();
  const catalogo = useDati(api.entries.venueCatalogo);
  const idEtichetta = useId();
  const [aperta, setAperta] = useState(!venue);
  const [testo, setTesto] = useState(iniziale?.venue ?? "");
  // i risultati di OpenStreetMap per il nome cercato (null: non ancora cercato)
  const [trovate, setTrovate] = useState<{ per: string; candidati: Candidato[] } | null>(null);
  const [chiediIndirizzo, setChiediIndirizzo] = useState(false);
  const [indirizzo, setIndirizzo] = useState("");
  const [perIndirizzo, setPerIndirizzo] = useState<Candidato[] | null>(null);
  const [citta, setCitta] = useState(iniziale?.city ?? "");

  const venues = catalogo.data?.venues ?? [];
  const nome = testo.trim();
  const parole = chiaveNome(testo).split(" ").filter(w => w.length > 1);
  const mie = parole.length ? venues.filter(v => parole.every(w => chiaveNome(`${v.name} ${v.city}`).includes(w))).slice(0, 8) : [];
  const rapide = recenti.filter(r => !(chiaveNome(r.venue) === chiaveNome(venue) && chiaveNome(r.city) === chiaveNome(city)));
  // le venue sono pubbliche sulla pagina: un indirizzo non diventa il nome di una venue (lo rifiuta anche il server)
  const nomeIndirizzo = sembraIndirizzoCivico(nome);
  const cercabile = nome.length >= 2 && !nomeIndirizzo;
  const cercato = trovate?.per === nome ? trovate.candidati : null;

  const azzera = () => {
    setTesto("");
    setTrovate(null);
    setChiediIndirizzo(false);
    setIndirizzo("");
    setPerIndirizzo(null);
    setCitta("");
    op.setErrore(null);
  };
  const scegli = (name: string, c: string) => {
    onScegli(name, c);
    setAperta(false);
    azzera();
  };
  const cercaNome = async () => {
    if (!cercabile || op.inCorso) return;
    const r = await op.esegui(() => convex.action(api.geo.searchVenue, { query: nome }));
    if (!r) return;
    setTrovate({ per: nome, candidati: r.candidati });
    setPerIndirizzo(null);
    // niente su OpenStreetMap: si passa subito all'indirizzo
    setChiediIndirizzo(r.candidati.length === 0);
  };
  const cercaIndirizzo = async () => {
    if (indirizzo.trim().length < 3 || op.inCorso) return;
    const r = await op.esegui(() => convex.action(api.geo.cercaIndirizzoVenue, { address: indirizzo.trim() }));
    if (r) setPerIndirizzo(r.candidati);
  };
  // la venue nasce adesso, col nome scritto e la posizione del candidato scelto
  const usaCandidato = async (c: Candidato) => {
    const r = await op.esegui(() => convex.mutation(api.venues.createFromCandidate, { ref: c.ref, name: nome }));
    if (r) scegli(r.name, r.city);
  };
  const usaSoloCitta = () => {
    if (cercabile && citta.trim()) scegli(nome, citta.trim());
  };
  const invio = (f: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      f();
    }
  };
  const elenco = (candidati: Candidato[], etichetta: string) => (
    <ul className="mod-opzioni" aria-label={etichetta}>
      {candidati.map(c => (
        <li key={c.ref}>
          <button type="button" disabled={op.inCorso} onClick={() => void usaCandidato(c)}>
            {c.name} <span>· {c.city}</span>
            <small>{c.label}</small>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="mod-campo mod-venue" role="group" aria-labelledby={idEtichetta} data-campo="venue">
      <span className="mod-etichetta" id={idEtichetta}>
        Venue
        {segno}
      </span>
      {venue && !aperta ? (
        <div className="mod-riga">
          <span className="mod-venue-scelta">{venue} · {city}</span>
          <button type="button" className="mod-btn" onClick={() => setAperta(true)}>Cambia</button>
        </div>
      ) : (
        <div className="mod-venue-cerca">
          <div className="mod-riga">
            <input
              value={testo}
              placeholder="Il nome del posto"
              aria-label="Cerca una venue"
              maxLength={120}
              onChange={e => {
                setTesto(e.target.value);
                op.setErrore(null);
              }}
              onKeyDown={invio(() => (mie.length === 1 && chiaveNome(mie[0].name) === chiaveNome(nome) ? scegli(mie[0].name, mie[0].city) : void cercaNome()))}
            />
            {venue && <button type="button" className="mod-btn" onClick={() => { setAperta(false); azzera(); }}>Tieni {venue}</button>}
          </div>
          {!nome && rapide.length > 0 && (
            <Rapidi titolo="Usate di recente">
              {rapide.map(r => (
                <button key={`${r.venue}|${r.city}`} type="button" className="mf-rapido" onClick={() => scegli(r.venue, r.city)}>
                  {r.venue} <span>· {r.city}</span>
                </button>
              ))}
            </Rapidi>
          )}
          {mie.length > 0 && (
            <ul className="mod-opzioni" aria-label="Le tue venue">
              {mie.map(v => (
                <li key={v.id}><button type="button" onClick={() => scegli(v.name, v.city)}>{v.name} <span>· {v.city}</span></button></li>
              ))}
            </ul>
          )}
          {nomeIndirizzo && <span className="mod-campo-errore" role="alert">Sembra un indirizzo: scrivi il nome del posto, le venue si vedono sulla pagina pubblica.</span>}
          {cercabile && !cercato && (
            <div className="mod-riga">
              <button type="button" className="mod-btn mod-primario" disabled={op.inCorso} onClick={() => void cercaNome()}>
                {op.inCorso ? "Cerco…" : mie.length ? `Nessuna di queste: cerca «${nome}»` : `Cerca «${nome}»`}
              </button>
            </div>
          )}
          {cercato && cercato.length > 0 && (
            <div className="mod-venue-nuova">
              <span className="mod-hint">Su OpenStreetMap: scegli quella giusta, si aggiunge alle tue venue come «{nome}».</span>
              {elenco(cercato, "Risultati su OpenStreetMap")}
              {!chiediIndirizzo && (
                <button type="button" className="mf-link-testo mod-hint" onClick={() => setChiediIndirizzo(true)}>Non è nessuna di queste? Scrivi l'indirizzo</button>
              )}
            </div>
          )}
          {cercato && chiediIndirizzo && (
            <div className="mod-venue-nuova">
              <span className="mod-hint">
                {cercato.length ? "" : `«${nome}» non è su OpenStreetMap. `}Scrivi l'indirizzo e la posizione la prendiamo da lì.
              </span>
              <div className="mod-riga">
                <input
                  value={indirizzo}
                  placeholder="Via, numero e città"
                  aria-label="Indirizzo della venue"
                  maxLength={200}
                  autoFocus
                  onChange={e => setIndirizzo(e.target.value)}
                  onKeyDown={invio(() => void cercaIndirizzo())}
                />
                <button type="button" className="mod-btn mod-primario" disabled={indirizzo.trim().length < 3 || op.inCorso} onClick={() => void cercaIndirizzo()}>
                  Cerca
                </button>
              </div>
              {perIndirizzo && perIndirizzo.length > 0 && elenco(perIndirizzo, "Indirizzi trovati")}
              {perIndirizzo && perIndirizzo.length === 0 && (
                <>
                  <span className="mod-hint">Indirizzo non trovato. Controlla com'è scritto, oppure usa solo la città: la posizione la cerchiamo noi.</span>
                  <div className="mod-riga">
                    <input value={citta} placeholder="Città" aria-label="Città della venue" maxLength={80} onChange={e => setCitta(e.target.value)} onKeyDown={invio(usaSoloCitta)} />
                    <button type="button" className="mod-btn" disabled={!citta.trim() || !cercabile} onClick={usaSoloCitta}>Usa «{nome}»</button>
                  </div>
                </>
              )}
            </div>
          )}
          <Errore errore={op.errore} />
          <span className="mod-hint">
            Scegli una delle tue venue o scrivi il nome di una nuova: la cerchiamo su OpenStreetMap per metterla sulla mappa.
          </span>
        </div>
      )}
      {errore}
    </div>
  );
}

/** Le liste di nomi che servono ai campi (persone, anche con quanti concerti; partenze; "regalato da"). */
export function useNomi() {
  const persone = useDati(api.people.list);
  const partenze = useDati(api.departures.list);
  const regali = useDati(api.gifters.list);
  return {
    persone: useMemo(() => (persone.data?.people ?? []).map(p => p.name), [persone.data]),
    personeConConta: persone.data?.people ?? [],
    partenze: partenze.data?.departures ?? [],
    regali: regali.data?.gifters ?? [],
  };
}
