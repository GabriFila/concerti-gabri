/* ──────────────────────────────────────────────────────────────
   I campi del form di un concerto che servono anche fuori dal pannello
   (#concerti, spec ux-modifica §6.2; la scheda dell'Oracolo li usa così
   come sono): la venue, i compagni, il prezzo e le liste di nomi.

   - Compagni: nomi già tra le persone; uno nuovo si aggiunge da qui, con
     la regola dei soprannomi (§1.42). Con `creaSubito={false}` (il
     «Modulo completo» della scheda dell'Oracolo) la persona nuova resta
     un chip segnato «nuova» e non si crea: la crea il salvataggio della
     scheda. Sotto, le scorciatoie «Frequenti».
   - Venue: dal catalogo condiviso, oppure nuova con nome e città così
     come li scrivi: la crea il salvataggio e il server ne cerca la
     posizione (lib/venueUtente.ts, DECISIONI «Venue per nome»). Il nome
     del locale, mai un indirizzo. Le scorciatoie «Usate di recente» sono
     le venue degli ultimi concerti.
   - Suggerimenti ed errori stanno fuori dalle etichette, indicati da
     aria-describedby; `segno` va accanto all'etichetta (il punto
     «proposto dall'Oracolo»).
   ────────────────────────────────────────────────────────────── */

import { useId, useMemo, useState, type ReactNode } from "react";
import type { AnyFieldApi } from "@tanstack/react-form";
import { api } from "../../../convex/_generated/api";
import { concertoInput } from "../../../shared/schema/entry.ts";
import { Errore, ErroriCampo, Soprannomi, useConvex, useDati, useDescrizione, useOperazione } from "./comuni.tsx";
import { sembraIndirizzoCivico } from "../../../shared/lib/nomi.ts";
import { chiaveNome, descrizione } from "./forme.ts";

const C = concertoInput.shape;

/** Il prezzo: un numero, oppure "pagato ma dimenticato" ("na"); vuoto = non si sa. */
export function CampoCosto({ f, segno }: { f: AnyFieldApi; segno?: ReactNode }) {
  const v = f.state.value as number | "na" | undefined;
  const d = useDescrizione(f, true);
  return (
    <div className="mod-campo" data-campo={f.name}>
      <label className="mod-etichetta" htmlFor={d.id}>
        Prezzo (€)
        {segno}
      </label>
      <div className="mod-riga">
        <input
          id={d.id}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={typeof v === "number" ? v : ""}
          disabled={v === "na"}
          onChange={e => f.handleChange(e.target.value === "" ? undefined : Number(e.target.value))}
          onBlur={f.handleBlur}
          aria-invalid={d.invalido}
          aria-describedby={d.descritto}
        />
        <label className="mod-spunta">
          <input type="checkbox" checked={v === "na"} onChange={e => f.handleChange(e.target.checked ? "na" : undefined)} />
          Pagato, prezzo dimenticato
        </label>
      </div>
      {/* la descrizione per gli agenti spiega "na"; qui lo dice la casella accanto */}
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


/**
 * La venue: dal catalogo condiviso, oppure nuova con nome e città così come li scrivi (la crea il
 * salvataggio, lib/venueUtente.ts). `recenti` sono le scorciatoie «Usate di recente»; `iniziale`
 * riempie la ricerca e la città della venue nuova (la scheda dell'Oracolo).
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
  const catalogo = useDati(api.entries.venueCatalogo);
  const idEtichetta = useId();
  const idCitta = useId();
  const [aperta, setAperta] = useState(!venue);
  const [testo, setTesto] = useState(iniziale?.venue ?? "");
  const [citta, setCitta] = useState(iniziale?.city ?? "");

  const venues = catalogo.data?.venues ?? [];
  const parole = chiaveNome(testo).split(" ").filter(w => w.length > 1);
  const locali = parole.length
    ? venues.filter(v => parole.every(w => chiaveNome(`${v.name} ${v.city}`).includes(w))).slice(0, 8)
    : [];
  const rapide = recenti.filter(r => !(chiaveNome(r.venue) === chiaveNome(venue) && chiaveNome(r.city) === chiaveNome(city)));
  // già nel catalogo con questo nome e questa città: si usa quella
  const esistente = venues.find(v => chiaveNome(v.name) === chiaveNome(testo) && chiaveNome(v.city) === chiaveNome(citta));

  const scegli = (name: string, c: string) => {
    onScegli(name, c);
    setAperta(false);
    setTesto("");
    setCitta("");
  };
  // il catalogo è pubblico: un indirizzo non diventa una venue (lo rifiuta anche il server)
  const indirizzo = !esistente && sembraIndirizzoCivico(testo);
  const nuova = testo.trim().length >= 2 && citta.trim().length >= 1 && !indirizzo;
  const usaNuova = () => {
    if (!nuova) return;
    scegli(esistente?.name ?? testo.trim(), esistente?.city ?? citta.trim());
  };

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
              placeholder="Nome del locale"
              aria-label="Cerca una venue"
              maxLength={120}
              onChange={e => setTesto(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  usaNuova();
                }
              }}
            />
            {venue && <button type="button" className="mod-btn" onClick={() => setAperta(false)}>Tieni {venue}</button>}
          </div>
          {!testo.trim() && rapide.length > 0 && (
            <Rapidi titolo="Usate di recente">
              {rapide.map(r => (
                <button key={`${r.venue}|${r.city}`} type="button" className="mf-rapido" onClick={() => scegli(r.venue, r.city)}>
                  {r.venue} <span>· {r.city}</span>
                </button>
              ))}
            </Rapidi>
          )}
          {locali.length > 0 && (
            <ul className="mod-opzioni" aria-label="Venue del catalogo">
              {locali.map(v => (
                <li key={v.id}><button type="button" onClick={() => scegli(v.name, v.city)}>{v.name} <span>· {v.city}</span></button></li>
              ))}
            </ul>
          )}
          {testo.trim().length >= 2 && (
            <div className="mod-venue-nuova">
              {indirizzo ? (
                <span className="mod-campo-errore" role="alert">Sembra un indirizzo: scrivi il nome del locale, il catalogo delle venue è pubblico.</span>
              ) : (
                <span className="mod-hint">{locali.length ? "Non è nessuna di queste? " : ""}Scrivi la città e usala così com'è.</span>
              )}
              <div className="mod-riga">
                <input
                  id={idCitta}
                  value={citta}
                  placeholder="Città"
                  aria-label="Città della venue"
                  maxLength={80}
                  onChange={e => setCitta(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      usaNuova();
                    }
                  }}
                />
                <button type="button" className="mod-btn mod-primario" disabled={!nuova} onClick={usaNuova}>
                  {esistente ? `Usa ${esistente.name}` : "Usa questa venue"}
                </button>
              </div>
            </div>
          )}
          <span className="mod-hint">
            Il nome del locale, mai un indirizzo: il catalogo delle venue è condiviso tra tutte le pagine. Una venue nuova
            si aggiunge quando salvi, e la sua posizione la cerchiamo su OpenStreetMap.
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
