/* ──────────────────────────────────────────────────────────────
   La scheda di un concerto nella chat dell'Oracolo in scrittura (spec
   ux-agente §9): quando il modello chiama propose_concert il run si
   ferma e qui compare la proposta, modificabile. Niente è scritto finché
   il proprietario non preme Salva.

   - Lo stato viene dall'output dello strumento, dall'interruzione del run
     (useChat) e dallo store (statoScheda in bozza.ts): bozza, pronta (in
     un lotto, aspetta le altre), in salvataggio, salvata (EsitoScheda),
     scartata, corretta, chiusa, scaduta.
   - I nomi si risolvono dal vivo sui dati del proprietario (persone,
     partenze, "regalato da", venue del catalogo); una venue che non c'è,
     con la città, è nuova: un avviso, e la aggiunge il Salva (il server
     ne cerca la posizione, lib/venueUtente.ts).
   - Salva: la scheda si valida come la valida il server, poi risolve
     l'approvazione con `{approved: true, editedArgs: proposta}`; Scarta
     con il rifiuto tipizzato `{motivo: "scartata"}`. Le correzioni
     scritte nella chat le instrada ChatScrittura (send()).
   - Una scheda nuova non prende il focus: la casella lo tiene, e uno
     screen reader sente «Nuova scheda: …».
   - Doppioni: lo stesso artista lo stesso giorno (in archivio, o in
     un'altra scheda del run) blocca, con «Aggiorna quello» (la scheda
     diventa la modifica di quello) e «È un altro concerto»; un giorno
     prima o dopo è un avviso con «Apri quello».
   - ⋯ di una scheda nuova: «È un festival» / «Fanne un concerto singolo».
     «Modulo completo» apre il form dei concerti in modo scheda (il ponte
     di editor.tsx): «Usa nella scheda» riporta qui i valori, senza
     scrivere niente. Finché è aperto (accanto, da 1024 px) Salva e
     Scarta sono spenti: decidere la scheda perderebbe i valori del
     modulo. Se arrivano lo stesso a scheda già decisa, una notifica lo
     dice.
   - Con più schede nel run il piede diventa la casella «Da salvare»: le
     salva o le scarta tutte insieme la barra del lotto (BarraSchede.tsx).
     Ogni scheda le scrive nello store se è pronta.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
import { isPlanned, todayKey } from "../../../shared/lib/dates.ts";
import { chiaveNome } from "../../../shared/lib/nomi.ts";
import { propostaConcertoInput, type EventoEsterno, type PropostaConcerto } from "../../../shared/schema/proposta.ts";
import { useEditorConcerti, type EsitoConcerto } from "../editor.tsx";
import { Menu, type VoceMenu } from "../ui/Menu.tsx";
import { useToast } from "../ui/Toast.tsx";
import { Soprannomi, useDati } from "../sezioni/comuni.tsx";
import type { ValoriConcerto, ValoriFestival } from "../sezioni/forme.ts";
import {
  aggiornaQuello, campoDiMancante, conSetInPiu, daModulo, differenzeScheda, distanza, dopoDi, evidenziaDi, giornoLungo, giornoParlato, idApprovazione, inConcerto,
  inFestival, problemiScheda, singoloPossibile, statoScheda, tieniSet, toglieSet, validaScheda, valoriDaProposta,
  type Bozza, type CampoScheda, type Doppione, type ParteScheda, type Problema, type ProblemiScheda, type StatoScheda,
} from "./bozza.ts";
import { CampiScheda, Sr, focusEditor, focusSet, type NomiScheda } from "./CampiScheda.tsx";
import { EsitoScheda, SchedaChiusa, VaiA } from "./EsitoScheda.tsx";
import { dopoProblema, recuperaFocus, riprovaFocus } from "./focus.ts";
import { useRun, type Risolvibile } from "./run.ts";
import { aggiorna, apriEditor, cambia, inizia, leggi, rimpiazza, segnaModulo, useFratelli, useScheda, type VoceScheda } from "./store.ts";

/** La proposta del modello (già validata dal server: qui solo per sicurezza). */
function propostaDi(part: ParteScheda): PropostaConcerto {
  const r = propostaConcertoInput.safeParse(part.input ?? {});
  return r.success ? r.data : {};
}

/** Il titolo per gli stati chiusi: dalla bozza se c'è, altrimenti dalla proposta. */
export function titoloScheda(part: ParteScheda, voce?: VoceScheda): string {
  if (voce) return (voce.tipo === "festival" ? (voce.valori as ValoriFestival).name : (voce.valori as ValoriConcerto).artist).trim() || "senza titolo";
  const p = propostaDi(part);
  return (p.name ?? p.artist ?? "").trim() || "senza titolo";
}

export function SchedaConcerto({ part }: { part: ParteScheda }) {
  const run = useRun();
  const idInt = idApprovazione(part);
  const interruzione = run.interruzioni.find(i => i.interruptId === idInt) as Risolvibile | undefined;
  const voce = useScheda(part.id);
  const erroreRipresa = run.erroriRipresa.some(e => e.interruptIds.includes(idInt));
  // «in arrivo» vale solo per le schede del run che sta rispondendo, non per quelle vecchie dello storico
  const stato = statoScheda(part, interruzione, voce, { caricando: run.caricando && run.delRun.has(part.id), erroreRipresa });
  const titolo = titoloScheda(part, voce);

  switch (stato) {
    case "salvata":
    case "annullata":
      return <EsitoScheda part={part} />;
    case "in_arrivo":
      return (
        <div className="scheda scheda-attesa" data-scheda={part.id} aria-busy="true">
          <span className="scheda-occhiello">Scheda</span>
          <p>Preparo la scheda…</p>
        </div>
      );
    case "bozza":
    case "pronta":
    case "in_salvataggio":
      return <SchedaAperta part={part} interruzione={interruzione} stato={stato} />;
    case "errore_ripresa": {
      // conversazione troppo lunga (413): né riprovare né rifarla qui serve, solo una chat nuova
      if (run.troppoLunga) {
        return (
          <SchedaChiusa part={part} tono="errore" testo="Non sono riuscito a salvare: la conversazione è troppo lunga. Apri una nuova chat e raccontami di nuovo questo concerto.">
            <button type="button" className="mod-btn" onClick={run.nuovaChat}>Apri una nuova chat</button>
          </SchedaChiusa>
        );
      }
      // ritentabile: la connessione o un limite; altrimenti la scheda non vale più (scaduta, cambiata, rifiutata)
      const ritenta = run.erroriRipresa.find(e => e.interruptIds.includes(idInt))?.retryable;
      return (
        <SchedaChiusa
          part={part}
          tono="errore"
          testo={ritenta ? "Non sono riuscito a salvare: la richiesta non è arrivata. Riprova." : "Non sono riuscito a salvare: la scheda non è più valida."}
        >
          {ritenta ? (
            <button type="button" className="mod-btn" onClick={run.riprova}>Riprova</button>
          ) : (
            <button type="button" className="mod-btn" onClick={() => run.invia(`Rifai la scheda di ${titolo}`)}>Chiedi di rifarla</button>
          )}
        </SchedaChiusa>
      );
    }
    default:
      return <SchedaChiusa part={part} stato={stato} titolo={titolo} />;
  }
}

/* ── la scheda aperta ─────────────────────────────────────────── */

function SchedaAperta({ part, interruzione, stato }: { part: ParteScheda; interruzione: Risolvibile | undefined; stato: StatoScheda }) {
  const proposta = propostaDi(part);
  const voce = useScheda(part.id);
  // la base di una modifica è il concerto com'è adesso (solo la prima volta: poi la bozza è nello store)
  if (proposta.id && !voce) return <BaseModifica part={part} interruzione={interruzione} stato={stato} proposta={proposta} />;
  return <Corpo part={part} interruzione={interruzione} stato={stato} base={() => valoriDaProposta(proposta)} />;
}

function BaseModifica({ part, interruzione, stato, proposta }: { part: ParteScheda; interruzione: Risolvibile | undefined; stato: StatoScheda; proposta: PropostaConcerto }) {
  const q = useDati(api.entries.get, { id: proposta.id! });
  if (q.isError) return <BersaglioSparito part={part} interruzione={interruzione} />;
  if (!q.data) {
    return (
      <div className="scheda scheda-attesa" data-scheda={part.id} aria-busy="true">
        <span className="scheda-occhiello">Modifica</span>
        <p>Preparo la scheda…</p>
      </div>
    );
  }
  return <Corpo part={part} interruzione={interruzione} stato={stato} base={() => valoriDaProposta(proposta, q.data as EventoEsterno)} />;
}

/** Una modifica di un concerto che non c'è più: solo Scarta. */
function BersaglioSparito({ part, interruzione }: { part: ParteScheda; interruzione: Risolvibile | undefined }) {
  const idT = useId();
  return (
    <article className="scheda" data-scheda={part.id} data-stato="bozza" role="group" aria-labelledby={idT}>
      <div className="scheda-testa">
        <span className="scheda-occhiello" id={idT}>Modifica concerto</span>
      </div>
      <div className="mod-attenzione scheda-box" aria-live="polite">
        <p>Questo concerto non c'è più: forse è stato cancellato o annullato.</p>
      </div>
      <div className="scheda-piede">
        <div className="scheda-azioni">
          <button type="button" className="mod-btn mod-primario" disabled={!interruzione} onClick={() => scarta(part.id, interruzione)}>Scarta</button>
        </div>
      </div>
    </article>
  );
}

function scarta(id: string, interruzione: Risolvibile | undefined) {
  if (!interruzione || leggi(id)?.moduloAperto !== undefined) return;
  aggiorna(id, () => ({ scartata: true, editorAperto: null }));
  try {
    interruzione.resolveInterrupt({ approved: false, payload: { motivo: "scartata" } });
    // la scheda diventa la riga «Scheda scartata»: il focus va lì (o resta su «Cambia idea» se aspetta le altre)
    recuperaFocus(id, ".scheda-azioni button");
  } catch {
    aggiorna(id, () => ({ scartata: false }));
  }
}

/** Il concerto di una modifica c'è ancora? (undefined finché non si sa; niente query per un evento nuovo) */
function useEsiste(id: string | undefined): boolean | undefined {
  const idratata = useHydrated();
  const q = useQuery({ ...convexQuery(api.entries.get, { input: { id: id ?? "" } }), enabled: idratata && !!id, retry: false });
  if (!id) return undefined;
  return q.isError ? false : q.data ? true : undefined;
}

/* ── venue: solo il catalogo (una nuova la crea il Salva) ─────── */

type VenueCatalogo = { id: string; name: string; city: string };

/** Come sta la venue della scheda rispetto al catalogo condiviso. */
interface StatoVenue {
  /** Nel catalogo con questo nome e città (undefined: catalogo non ancora caricato o venue vuota). */
  nelCatalogo?: boolean;
  /** Senza città: le venue del catalogo con questo nome (con più di una si sceglie). */
  omonime: VenueCatalogo[];
  /** Fuori catalogo: una venue dal nome simile nella stessa città. */
  simile?: VenueCatalogo;
}

/**
 * La venue della scheda contro il catalogo (entries.venueCatalogo). Senza città e con una
 * sola venue di quel nome è lei; fuori catalogo con la città è una venue nuova, che il
 * Salva aggiunge (lib/venueUtente.ts): nessuna ricerca su OpenStreetMap da qui.
 */
function useVenue(id: string, voce: VoceScheda | undefined): StatoVenue {
  const catalogo = useDati(api.entries.venueCatalogo);
  const venues = catalogo.data?.venues;
  const venue = voce?.valori.venue.trim() ?? "";
  const citta = voce?.valori.city.trim() ?? "";
  const kv = chiaveNome(venue);
  const kc = chiaveNome(citta);
  const esatta = !!venues?.some(x => chiaveNome(x.name) === kv && chiaveNome(x.city) === kc);
  const omonime = useMemo(() => (venues ?? []).filter(x => chiaveNome(x.name) === kv), [venues, kv]);

  // città mancante e una sola venue con quel nome: è lei
  useEffect(() => {
    if (!voce || !venue || citta || omonime.length !== 1) return;
    aggiorna(id, v => ({ valori: { ...v.valori, venue: omonime[0].name, city: omonime[0].city } }));
  }, [id, voce, venue, citta, omonime]);

  if (!venue || !venues) return { omonime };
  if (esatta) return { nelCatalogo: true, omonime };
  // un nome simile nella stessa città («Forum» e «Unipol Forum»): si propone, non si impone
  const parole = kv.split(" ").filter(w => w.length > 2);
  const simile = kc && parole.length
    ? venues.find(x => chiaveNome(x.city) === kc && (parole.every(w => chiaveNome(x.name).includes(w)) || chiaveNome(x.name).split(" ").filter(w => w.length > 2).every(w => kv.includes(w))))
    : undefined;
  return { nelCatalogo: false, omonime: citta ? [] : omonime, ...(simile ? { simile } : {}) };
}

/* ── corpo ────────────────────────────────────────────────────── */

/** L'occhiello sopra il titolo, su una riga sola accanto alla pillola (quanti concerti ha un festival lo dice la riga «Concerti · 3»). */
const OCCHIELLO = (b: Pick<Bozza, "tipo" | "id">) =>
  b.id
    ? b.tipo === "festival" ? "Modifica festival" : "Modifica concerto"
    : b.tipo === "festival" ? "Nuovo festival" : "Nuovo concerto";

/** Cosa sistemare, in breve, per il suggerimento sotto il Salva disabilitato. */
function cosaSistemare(p: Problema[]): string {
  const voci = p.map(x => {
    switch (x.tipo) {
      case "venue_manca":
      case "venue_ambigua":
      case "venue_indirizzo":
        return "venue";
      case "citta_manca":
        return "città";
      case "persona_ambigua":
      case "nome_completo":
        return x.ruolo === "regalo" ? "regalato da" : "persone";
      case "partenza_indirizzo":
        return "partenza";
      case "festival_corto":
      case "set_senza_artista":
      case "set_rimosso":
        return "concerti";
      case "doppione":
        return "già in archivio";
      case "manca":
        return x.campo === "name" ? "nome del festival" : x.campo === "artist" ? "artista" : "data";
      case "data_non_valida":
        return "data";
      default:
        return x.testo.split(":")[0].toLowerCase();
    }
  });
  return [...new Set(voci)].join(", ");
}

function Corpo({ part, interruzione, stato, base }: { part: ParteScheda; interruzione: Risolvibile | undefined; stato: StatoScheda; base: () => Bozza }) {
  // la bozza nasce qui, una volta (poi vive nello store anche a pannello chiuso)
  useState(() => inizia(part.id, base()));
  const voce = useScheda(part.id)!;
  const run = useRun();
  const editor = useEditorConcerti();
  const { mostra } = useToast();
  const persone = useDati(api.people.list);
  const partenze = useDati(api.departures.list);
  const regali = useDati(api.gifters.list);
  const eventi = useDati(api.entries.list, {});
  const vivo = useEsiste(voce.id);
  const statoVenue = useVenue(part.id, voce);
  const nelCatalogo = statoVenue.nelCatalogo;
  // le schede nuove aperte prima di questa nello stesso run (doppioni tra schede)
  const nelLotto = [...run.schede.keys()];
  const fratelli = useFratelli(nelLotto.slice(0, Math.max(0, nelLotto.indexOf(part.id))));
  const idTitolo = useId();
  const idPillola = useId();
  const idBlocco = useId();
  const linkModulo = useRef<HTMLButtonElement>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const oggi = todayKey(Date.now());

  const nomi: NomiScheda = {
    persone: persone.data?.people.map(p => p.name),
    partenze: partenze.data?.departures,
    regali: regali.data?.gifters.map(g => g.label),
  };
  const sparito = !!voce.id && vivo === false;
  const archivio = eventi.data?.concerts as (EventoEsterno & { id: string })[] | undefined;
  const problemi = problemiScheda(voce, {
    oggi,
    persone: nomi.persone,
    partenze: nomi.partenze,
    regali: nomi.regali,
    venueNelCatalogo: nelCatalogo,
    venueAmbigua: nelCatalogo === false && statoVenue.omonime.length >= 2,
    ...(statoVenue.simile ? { venueSimile: { name: statoVenue.simile.name, city: statoVenue.simile.city } } : {}),
    nomiOk: voce.nomiOk,
    bersaglioSparito: sparito,
    eventi: archivio,
    fratelli,
    doppioniOk: voce.doppioniOk,
  });
  const sola = stato !== "bozza";
  const dopo = dopoDi(voce);
  const v = voce.valori;
  const festival = voce.tipo === "festival";
  const titolo = (festival ? (v as ValoriFestival).name : (v as ValoriConcerto).artist).trim();
  const diff = voce.esistente ? differenzeScheda(voce) : [];
  const soloScarta = problemi.daSistemare.some(p => p.tipo === "bersaglio_sparito" || p.tipo === "nessuna_differenza");
  const inAttesa = (!!v.venue.trim() && nelCatalogo === undefined) || !nomi.persone || !nomi.partenze || !nomi.regali || (!voce.id && !archivio);
  const bloccata = problemi.daSistemare.length > 0 || inAttesa;
  const molte = run.schedeNelRun > 1;
  // più schede nel run: niente piede, la casella «Da salvare» e la barra del lotto in fondo
  const lotto = molte && run.schede.has(part.id) && stato === "bozza";
  const nProblemi = problemi.daSistemare.length;
  // il «Modulo completo» è aperto accanto: la scheda aspetta i suoi valori («Usa nella scheda») o «Torna alla scheda»
  const conModulo = voce.moduloAperto !== undefined;
  const testoBlocco = conModulo
    ? "Il modulo completo è aperto: prima «Usa nella scheda» o «Torna alla scheda»."
    : problemi.daSistemare.length ? `Prima sistema: ${cosaSistemare(problemi.daSistemare)}.` : "Controllo i nomi e la venue…";

  // una scheda nuova si annuncia (una volta), senza spostare il focus
  useEffect(() => {
    if (voce.annunciata || stato !== "bozza" || inAttesa) return;
    aggiorna(part.id, () => ({ annunciata: true }));
    const quando = v.date.trim() ? `, ${giornoParlato(v.date)}` : "";
    const n = problemi.daSistemare.length;
    run.annuncia(`Nuova scheda: ${titolo || "senza titolo"}${quando}.${n ? ` Da sistemare: ${n}.` : ""}`);
  });

  // un'azione ha tolto il pulsante col focus (un problema sistemato…): il focus torna nella scheda
  useEffect(riprovaFocus);

  // la barra del lotto legge dallo store se la scheda è pronta
  useEffect(() => {
    if (voce.bloccata !== bloccata || voce.nProblemi !== nProblemi) aggiorna(part.id, () => ({ bloccata, nProblemi }));
  }, [part.id, bloccata, nProblemi, voce.bloccata, voce.nProblemi]);

  const salva = () => {
    if (!interruzione || bloccata || voce.moduloAperto !== undefined) return;
    const r = validaScheda(voce);
    if (!r.ok) {
      setErrore(`Non si può salvare: ${r.errori[0].campo} ${r.errori[0].messaggio}.`);
      return;
    }
    setErrore(null);
    aggiorna(part.id, () => ({ inviata: true, editorAperto: null }));
    try {
      interruzione.resolveInterrupt({ approved: true, editedArgs: r.proposta });
    } catch {
      aggiorna(part.id, () => ({ inviata: false }));
      setErrore("Non riesco a salvare adesso: riprova tra un attimo.");
    }
  };

  const cambiaIdea = () => {
    if (!interruzione) return;
    try {
      interruzione.clearResolution();
      aggiorna(part.id, () => ({ inviata: false, scartata: false }));
      recuperaFocus(part.id, ".scheda-azioni .mod-primario");
    } catch {
      // già partita: niente da fare
    }
  };

  /** «Modulo completo»: il form dei concerti in modo scheda; «Usa nella scheda» riporta qui i valori (niente scritture). */
  const modulo = async () => {
    // finché è aperto la scheda non si decide (Salva, Scarta, barra del lotto, correzione): sono spenti
    const chiuso = segnaModulo(part.id);
    let esito: EsitoConcerto;
    try {
      esito = await editor.apri({
        tipo: voce.tipo,
        ...(voce.id ? { id: voce.id } : {}),
        bozza: voce.valori,
        evidenzia: evidenziaDi(voce),
        origine: "oracolo",
        modo: "scheda",
      });
    } finally {
      chiuso();
    }
    const ora = leggi(part.id);
    if (esito.esito === "usato") {
      if (ora && !ora.inviata && !ora.scartata && ora.notaInviata === undefined && !ora.annullata) {
        const r = daModulo(ora, esito.valori);
        rimpiazza(part.id, { valori: r.valori }, r.cambiati);
      } else {
        // la scheda non c'è più (una chat nuova, il run finito): i valori del modulo non si perdono in silenzio
        mostra({ testo: "La scheda non è più aperta: le modifiche del modulo completo non sono state usate." });
        return;
      }
    }
    // un'altra apertura (il «Modulo completo» di un'altra scheda) ha preso il posto del pannello: il focus è suo
    if (esito.esito === "chiuso" && esito.sostituito) return;
    // il focus torna qui solo se si è perso: una riga dell'elenco, un'altra vista o il pannello che si chiude (che lo rende a chi l'ha aperto) l'hanno già messo a posto
    requestAnimationFrame(() => {
      const att = document.activeElement;
      const dialogo = att?.closest("dialog");
      if (att && att !== document.body && att.isConnected && (!dialogo || dialogo.open)) return;
      linkModulo.current?.focus({ preventScroll: true });
    });
  };

  // ⋯ di una scheda nuova: concerto ↔ festival
  const voci: VoceMenu[] = [];
  if (!voce.id && stato === "bozza") {
    if (!festival) voci.push({ etichetta: "È un festival", onClick: () => cambiaTipo(part.id, inFestival(voce), ".scheda-menu button") });
    else if (singoloPossibile(voce)) voci.push({ etichetta: "Fanne un concerto singolo", onClick: () => cambiaTipo(part.id, inConcerto(voce), ".scheda-menu button") });
  }

  // intestazione
  const occhiello = OCCHIELLO(voce);
  const nomeScheda = voce.id ? `modifica del ${festival ? "festival" : "concerto"}` : `nuovo ${festival ? "festival" : "concerto"}`;
  const pillola =
    stato === "in_salvataggio" ? { testo: "Salvo…", tono: "neutro" } :
    stato === "pronta" ? { testo: voce.scartata ? "Non la salvo" : "Pronta", tono: "ok" } :
    lotto && !voce.inclusa ? { testo: "Non la salvo", tono: "neutro" } :
    problemi.daSistemare.length && !soloScarta ? { testo: `Da sistemare (${problemi.daSistemare.length})`, tono: "ambra" } :
    !bloccata ? { testo: "Pronta da salvare", tono: "ok" } : null;
  const esistente = voce.esistente;
  const sotto: ReactNode[] = [];
  const data = esistente && !diff.some(d => d.campo === "Data") ? esistente.date : v.date;
  const giorno = voce.tipo === "concert" ? giornoLungo(data) : data;
  if (giorno) sotto.push(<span key="g">{giorno}</span>);
  const quando = distanza(data, oggi);
  if (quando) sotto.push(<span key="d">{quando}</span>);
  if (sortKeyValida(dopo.date)) {
    const programma = isPlanned(dopo, oggi);
    sotto.push(
      <span key="s" className={programma ? "scheda-programma" : "scheda-passato"}>
        <span aria-hidden="true" className="scheda-punto">● </span>
        {programma ? "in programma" : "passato"}
      </span>,
    );
  }
  if (v.venue.trim()) sotto.push(<span key="l">{[v.venue.trim(), v.city.trim()].filter(Boolean).join(", ")}</span>);
  const kv = chiaveNome(v.venue);
  const kc = chiaveNome(v.city);
  const primaVolta = !voce.id && nelCatalogo === true && !!eventi.data && !eventi.data.concerts.some(e => chiaveNome(e.venue) === kv && chiaveNome(e.city) === kc);

  const linkDelModulo = (
    <button type="button" ref={linkModulo} className="mod-link scheda-modulo" onClick={() => void modulo()} aria-label={molte ? `Modulo completo per «${titolo}»` : undefined}>
      Modulo completo
    </button>
  );

  return (
    <article
      className={"scheda" + (lotto && !voce.inclusa ? " scheda-esclusa" : "")}
      data-scheda={part.id}
      data-stato={stato}
      data-lotto={lotto || undefined}
      role="group"
      aria-labelledby={idTitolo}
      aria-describedby={pillola ? idPillola : undefined}
    >
      <div className="scheda-testa">
        <span className="scheda-occhiello">{occhiello}</span>
        <span className="scheda-testa-destra">
          {pillola && (
            <span className="scheda-pillola" id={idPillola} data-tono={pillola.tono}>{pillola.testo}</span>
          )}
          {voci.length > 0 && <Menu etichetta={`Altre azioni per la scheda «${titolo || "senza titolo"}»`} voci={voci} className="scheda-menu" />}
        </span>
      </div>
      <h3 className="scheda-titolo" id={idTitolo} tabIndex={-1}>
        <Sr>Scheda: {nomeScheda} </Sr>
        {titolo || (festival ? "Festival senza nome" : "Concerto senza artista")}
      </h3>
      {sotto.length > 0 && (
        <p className="scheda-sotto">
          {sotto.map((x, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {x}
            </span>
          ))}
          {primaVolta && <span className="scheda-badge">prima volta qui</span>}
        </p>
      )}

      <div className="scheda-sistemare" aria-live="polite">
        {!sola && problemi.daSistemare.length > 0 && <DaSistemare id={part.id} voce={voce} problemi={problemi} archivio={archivio} omonime={statoVenue.omonime} />}
      </div>

      <CampiScheda id={part.id} voce={voce} nomi={nomi} oggi={oggi} sola={sola} fuoriCatalogo={problemi.daSistemare.some(p => p.chiave === "venue" && p.tipo !== "venue_manca")} />

      {problemi.daControllare.length > 0 && (
        <ul className="scheda-controlla" aria-label="Da controllare">
          {problemi.daControllare.map(a => (
            <li key={a.chiave}>
              <span aria-hidden="true" className="scheda-esclamativo">!</span>
              <span>
                {a.testo}
                {(a.tipo === "partenza_nuova" || a.tipo === "partenza_senza_indirizzo") && (
                  <> <VaiA vista="partenze">Partenze</VaiA></>
                )}
                {a.tipo === "doppione_vicino" && a.doppione?.id && (
                  <> <ApriQuello d={a.doppione} /></>
                )}
                {a.tipo === "venue_nuova" && a.venueSimile && (
                  <>
                    {" "}Nel catalogo c'è «{a.venueSimile.name}» ({a.venueSimile.city}):{" "}
                    <button type="button" className="mod-link" onClick={() => cambia(part.id, "venue", () => ({ venue: a.venueSimile!.name, city: a.venueSimile!.city }))}>
                      usa quella
                    </button>
                    .
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!soloScarta && <Mancano id={part.id} mancano={problemi.mancano} completa={!bloccata} sola={sola} />}

      {stato === "pronta" ? (
        <div className="scheda-piede scheda-piede-pronta">
          <p className="scheda-blocco" role="status">{testoPronta(voce.scartata, run.altre.some(i => i.status === "pending"))}</p>
          <div className="scheda-azioni">
            <button type="button" className="mod-btn" onClick={cambiaIdea}>Cambia idea</button>
          </div>
        </div>
      ) : stato === "in_salvataggio" ? (
        <div className="scheda-piede">
          <div className="scheda-azioni">
            <button type="button" className="mod-btn mod-primario" disabled aria-busy="true">Salvo…</button>
          </div>
        </div>
      ) : lotto ? (
        <div className="scheda-piede scheda-piede-lotto">
          <div className="scheda-lotto-riga">
            <label className="scheda-inclusa">
              <input
                type="checkbox"
                checked={voce.inclusa}
                aria-label={`Da salvare: «${titolo || "senza titolo"}»`}
                onChange={e => aggiorna(part.id, () => ({ inclusa: e.target.checked }))}
              />
              <span aria-hidden="true">Da salvare</span>
            </label>
            {!soloScarta && linkDelModulo}
          </div>
          {((voce.inclusa && bloccata) || conModulo) && !soloScarta && (
            <p className="scheda-blocco">{testoBlocco}</p>
          )}
        </div>
      ) : (
        <>
          <div className="scheda-piede">
            {(bloccata || conModulo) && !soloScarta && (
              <p className="scheda-blocco" id={idBlocco}>{testoBlocco}</p>
            )}
            <div className="scheda-azioni">
              {!soloScarta && (
                <button
                  type="button"
                  className="mod-btn mod-primario"
                  disabled={bloccata || conModulo || !interruzione}
                  aria-describedby={bloccata || conModulo ? idBlocco : undefined}
                  aria-label={molte ? `${salvaTesto(voce, diff.length)} «${titolo}»` : undefined}
                  onClick={salva}
                >
                  {salvaTesto(voce, diff.length)}
                </button>
              )}
              <button
                type="button"
                className={"mod-btn" + (soloScarta ? " mod-primario" : "")}
                disabled={!interruzione || conModulo}
                aria-label={molte ? `Scarta «${titolo}»` : undefined}
                onClick={() => scarta(part.id, interruzione)}
              >
                Scarta
              </button>
            </div>
            {errore && <p className="mod-errore" role="alert">{errore}</p>}
          </div>
          {/* fuori dal piede: al tocco il piede appiccicato resta basso, e questa riga si trova in fondo alla scheda */}
          <div className="scheda-piede-altro">
            {!soloScarta && linkDelModulo}
            <p className="scheda-nota">Oppure scrivi qui sotto cosa cambiare.</p>
          </div>
        </>
      )}
    </article>
  );
}

/**
 * «Pronta» (decisa, aspetta): in un lotto le altre schede; con una scheda
 * sola, la risposta a un'altra domanda dello stesso run (TanStack riprende
 * il run solo quando tutte le approvazioni sono decise).
 */
function testoPronta(scartata: boolean, domanda: boolean): string {
  if (domanda) {
    return scartata
      ? "Non la salvo: aspetto la tua risposta alla domanda qui sopra (Conferma o Rifiuta)."
      : "Pronta: si salva quando rispondi alla domanda qui sopra (Conferma o Rifiuta).";
  }
  return scartata ? "Non la salvo: aspetto le altre schede." : "Pronta: si salva con le altre.";
}

/** Festival ↔ concerto (⋯ di una scheda nuova, o «Fanne un concerto singolo» in Da sistemare). */
function cambiaTipo(id: string, b: Bozza, ...focus: string[]) {
  rimpiazza(id, { tipo: b.tipo, valori: b.valori }, b.tipo === "festival" ? ["concerts"] : ["artist"]);
  recuperaFocus(id, ...focus, `[data-riga="${b.tipo === "festival" ? "concerts" : "artist"}"]`);
}

/** «Apri quello»: il concerto che c'è già, nel form (sul desktop accanto all'Oracolo). */
function ApriQuello({ d }: { d: Doppione }) {
  const editor = useEditorConcerti();
  return (
    <button type="button" className="scheda-link" onClick={() => void editor.apri({ tipo: d.tipo, id: d.id! })}>
      Apri quello
    </button>
  );
}

const sortKeyValida = (d: string) => /^\d{2}(?:[–-]\d{2})?\/\d{2}\/\d{4}$/.test(d);

function salvaTesto(voce: VoceScheda, n: number): string {
  if (voce.id) return `Salva modifiche (${n})`;
  return voce.tipo === "festival" ? "Salva festival" : "Salva concerto";
}

/* ── da sistemare ─────────────────────────────────────────────── */

/** Un nome scritto diventa un altro (in «Con», nei set di un festival o in "regalato da"). */
function sostituisci(id: string, voce: VoceScheda, p: Problema, con: string) {
  const k = chiaveNome(p.nome ?? "");
  const cambiaLista = (lista: string[]) =>
    lista.map(x => (chiaveNome(x) === k ? con : x)).filter((x, i, a) => a.findIndex(y => chiaveNome(y) === chiaveNome(x)) === i);
  if (p.ruolo === "regalo") cambia(id, "biglietto", () => ({ giftFrom: con }));
  else if (voce.tipo === "festival") cambia(id, "concerts", w => ({ concerts: (w.valori as ValoriFestival).concerts.map(s => ({ ...s, with: cambiaLista(s.with) })) }));
  else cambia(id, "with", w => ({ with: cambiaLista((w.valori as ValoriConcerto).with) }));
}

const confermaNome = (id: string, nome: string) => aggiorna(id, v => ({ nomiOk: [...v.nomiOk, chiaveNome(nome)] }));

/** Un concerto vuoto in fondo alla lineup, col suo editor aperto. */
function aggiungiSet(id: string, voce: VoceScheda) {
  const n = (voce.valori as ValoriFestival).concerts.length;
  cambia(id, "concerts", v => conSetInPiu(v.valori as ValoriFestival));
  apriEditor(id, "concerts", n);
}

const apri = (id: string, campo: CampoScheda | undefined) => {
  if (!campo) return;
  if (campo === "concerts") {
    // la lineup: il primo concerto a cui manca qualcosa
    const v = leggi(id);
    const sets = v?.tipo === "festival" ? (v.valori as ValoriFestival).concerts : [];
    const i = Math.max(0, sets.findIndex(s => !s.artist.trim() || s.voto === undefined || s.vicinanza === undefined || s.canzoniNote === undefined));
    // l'editor del concerto si apre col focus nel suo primo campo
    if (sets.length) apriEditor(id, "concerts", i);
    else focusSet(id, 0);
    return;
  }
  apriEditor(id, campo);
  focusEditor(id, campo);
};

/** Le parole di un campo che manca, per la voce unica «Mancano artista, data e venue.». */
const PAROLA_MANCA: Partial<Record<CampoScheda, string>> = { artist: "artista", name: "nome del festival", date: "data", venue: "venue" };

const elenco = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`);

function DaSistemare({ id, voce, problemi, archivio, omonime }: { id: string; voce: VoceScheda; problemi: ProblemiScheda; archivio?: (EventoEsterno & { id: string })[]; omonime: VenueCatalogo[] }) {
  // più campi vuoti (una scheda vuota, «aggiungi un concerto»): una voce sola, le righe sotto dicono già «+ aggiungi»
  const vuoti = problemi.daSistemare.filter(p => p.tipo === "manca" || p.tipo === "venue_manca");
  const insieme = vuoti.length >= 2;
  const voci = insieme ? problemi.daSistemare.filter(p => !vuoti.includes(p)) : problemi.daSistemare;
  return (
    <div className="mod-attenzione scheda-box">
      <p className="scheda-box-titolo">Da sistemare</p>
      <ul className="scheda-problemi">
        {insieme && (
          <li key="mancano">
            <p>Mancano {elenco(vuoti.map(p => PAROLA_MANCA[p.campo!] ?? "").filter(Boolean))}: scrivili nelle righe qui sotto, o raccontameli nella chat.</p>
            <div className="scheda-azioni-problema">
              <button type="button" className="mod-btn" onClick={() => apri(id, vuoti[0].campo)}>Compila</button>
            </div>
          </li>
        )}
        {voci.map(p => (
          <li key={p.chiave}>
            <p>{p.testo}</p>
            <AzioniProblema id={id} voce={voce} p={p} archivio={archivio} omonime={omonime} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AzioniProblema({ id, voce, p, archivio, omonime }: { id: string; voce: VoceScheda; p: Problema; archivio?: (EventoEsterno & { id: string })[]; omonime: VenueCatalogo[] }) {
  // il pulsante premuto sparisce col problema: il focus al prossimo problema, o alla riga del campo
  const fatto = (campo: string | undefined = p.campo) => recuperaFocus(id, ...dopoProblema(campo));
  switch (p.tipo) {
    case "manca":
      return <div className="scheda-azioni-problema"><button type="button" className="mod-btn" onClick={() => apri(id, p.campo)}>Aggiungi</button></div>;
    case "data_non_valida":
    case "schema":
      return p.campo && p.campo !== "concerts" ? <div className="scheda-azioni-problema"><button type="button" className="mod-btn" onClick={() => apri(id, p.campo)}>Correggi</button></div> : null;
    case "venue_manca":
      return <div className="scheda-azioni-problema"><button type="button" className="mod-btn" onClick={() => apri(id, "venue")}>Scegli la venue</button></div>;
    case "venue_ambigua":
      return <OmonimeVenue id={id} omonime={omonime} />;
    case "citta_manca":
      return <div className="scheda-azioni-problema"><button type="button" className="mod-btn" onClick={() => apri(id, "venue")}>Aggiungi la città</button></div>;
    case "venue_indirizzo":
      return <div className="scheda-azioni-problema"><button type="button" className="mod-btn" onClick={() => apri(id, "venue")}>Correggi</button></div>;
    case "persona_ambigua":
      return (
        <div className="scheda-azioni-problema">
          {(p.opzioni ?? []).map(o => (
            <button key={o} type="button" className="mod-btn" onClick={() => { sostituisci(id, voce, p, o); fatto(); }}>{o}</button>
          ))}
          <button type="button" className="mod-btn" onClick={() => { confermaNome(id, p.nome!); fatto(); }}>È una persona nuova</button>
        </div>
      );
    case "nome_completo": {
      const [suggerito, ...altri] = p.opzioni ?? [];
      return (
        <>
          <div className="scheda-azioni-problema">
            {suggerito && <button type="button" className="mod-btn" onClick={() => { sostituisci(id, voce, p, suggerito); fatto(); }}>Usa «{suggerito}»</button>}
            {altri.map(o => (
              <button key={o} type="button" className="mod-btn" onClick={() => { sostituisci(id, voce, p, o); fatto(); }}>{o}</button>
            ))}
            <button type="button" className="mod-btn" onClick={() => { confermaNome(id, p.nome!); fatto(); }}>Va bene così</button>
          </div>
          <Soprannomi />
        </>
      );
    }
    case "partenza_indirizzo":
      return <div className="scheda-azioni-problema"><button type="button" className="mod-btn" onClick={() => apri(id, "from")}>Cambia il nome</button></div>;
    case "festival_corto":
      return (
        <div className="scheda-azioni-problema">
          <button type="button" className="mod-btn" onClick={() => aggiungiSet(id, voce)}>Aggiungi un concerto</button>
          {singoloPossibile(voce) && (
            <button type="button" className="mod-btn" onClick={() => cambiaTipo(id, inConcerto(voce), ...dopoProblema())}>Fanne un concerto singolo</button>
          )}
        </div>
      );
    case "set_senza_artista": {
      const i = (voce.valori as ValoriFestival).concerts.findIndex(c => !c.artist.trim());
      return (
        <div className="scheda-azioni-problema">
          <button type="button" className="mod-btn" onClick={() => apriEditor(id, "concerts", i)}>Scrivi l'artista</button>
          {singoloPossibile(voce) && (
            <button type="button" className="mod-btn" onClick={() => cambiaTipo(id, inConcerto(voce), ...dopoProblema())}>Fanne un concerto singolo</button>
          )}
        </div>
      );
    }
    case "set_rimosso":
      return (
        <div className="scheda-azioni-problema">
          <button type="button" className="mod-btn" onClick={() => { rimpiazza(id, tieniSet(voce, p.indice!), ["concerts"]); fatto("concerts"); }}>Tienilo</button>
          <button type="button" className="mod-btn" onClick={() => { aggiorna(id, v => toglieSet(v, p.indice!)); fatto("concerts"); }}>Toglilo</button>
        </div>
      );
    case "doppione": {
      const d = p.doppione!;
      const quello = d.id && d.tipo === voce.tipo ? archivio?.find(e => e.id === d.id) : undefined;
      const altro = voce.tipo === "festival" ? "È un altro festival" : "È un altro concerto";
      return (
        <div className="scheda-azioni-problema">
          {quello && (
            <button type="button" className="mod-btn" onClick={() => { rimpiazza(id, aggiornaQuello(voce, quello)); fatto(); }}>Aggiorna quello</button>
          )}
          {d.id && !quello && <ApriQuello d={d} />}
          <button type="button" className="mod-btn" onClick={() => { aggiorna(id, v => ({ doppioniOk: [...v.doppioniOk, d.chiave] })); fatto(); }}>{altro}</button>
        </div>
      );
    }
    default:
      return null;
  }
}

/** Senza città, più venue del catalogo con lo stesso nome: «Usa» quella giusta, o un'altra venue. */
function OmonimeVenue({ id, omonime }: { id: string; omonime: VenueCatalogo[] }) {
  const usa = (o: VenueCatalogo) => {
    cambia(id, "venue", () => ({ venue: o.name, city: o.city }));
    recuperaFocus(id, ...dopoProblema("venue"));
  };
  return (
    <div className="scheda-candidati">
      <ul className="scheda-opzioni" aria-label="Venue del catalogo con questo nome">
        {omonime.slice(0, 6).map(o => (
          <li key={o.id}>
            <span>
              {o.name} <span className="scheda-muto">· {o.city}</span>
            </span>
            <button type="button" className="mod-btn" aria-label={`Usa ${o.name}, ${o.city}`} onClick={() => usa(o)}>Usa</button>
          </li>
        ))}
      </ul>
      <div className="scheda-azioni-problema">
        <button type="button" className="mod-link" onClick={() => apri(id, "venue")}>È un'altra: scrivi la città</button>
      </div>
    </div>
  );
}

/**
 * «Mancano: posizione, canzoni note, prezzo.»: ogni voce apre la sua riga.
 * Senza una data valida non si sa (niente); «Completa.» solo se non resta
 * niente da sistemare.
 */
function Mancano({ id, mancano, completa, sola }: { id: string; mancano: string[] | null; completa: boolean; sola: boolean }) {
  if (!mancano) return null;
  if (!mancano.length) return completa ? <p className="scheda-mancano">Completa.</p> : null;
  return (
    <p className="scheda-mancano">
      Mancano:{" "}
      {mancano.map((m, i) => {
        const campo = campoDiMancante(m);
        return (
          <span key={m}>
            {i > 0 && ", "}
            {sola ? m : (
              <button type="button" className="scheda-link" onClick={() => apri(id, campo)}>{m}</button>
            )}
          </span>
        );
      })}
      .
    </p>
  );
}
