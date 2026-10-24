/* ──────────────────────────────────────────────────────────────
   Il pannello di un concerto o di un festival (#concerti, spec
   ux-modifica §6.2): il form (i campi in ConcertoForm.tsx) dentro
   Pannello (ui/Pannello.tsx), aperto dall'hash (`?nuovo=concerto|festival`,
   `?apri=<id>`, `&completa=1` per la coda dei "da completare") o dal
   ponte dell'editor (editor.tsx) con una bozza.

   Il form (TanStack Form) si valida con lo schema unico di
   shared/schema/entry.ts (`concertoInput`, `festivalInput`): gli stessi
   controlli di Convex, MCP e dell'import, con i messaggi in italiano di
   forme.ts; i suggerimenti dei campi sono le descrizioni dello schema.
   Nuovo → `entries.add`, esistente → `entries.update` (i campi svuotati si
   tolgono); l'esito è una notifica con «Annulla» (useScrittura).

   - Un invio con errori mostra in testa «Controlla N campi: …» (ogni nome
     porta al suo campo) e il focus va al primo; un ConvexError con
     `campo` sta sotto quel campo.
   - Coda (`completa=1`): il focus parte dal primo campo che manca;
     «Salva e vai al prossimo» salva e apre il prossimo da completare al
     posto di questo; «Da completare · 2 di 5» nel sottotitolo; finita la
     coda, «Tutto completo.».
   - Un form nuovo (non dal ponte) passa da concerto a festival e
     viceversa portandosi dietro i valori (forme.ts).
   - Nella testa, ⋯ «Duplica» e «Cancella…» (solo modifica).
   - Concorrenza: il pannello guarda la riga dal vivo di entries.list. Se
     cambia (l'Oracolo, un agente, un'altra scheda) e il form è pulito si
     ricarica; con modifiche, un avviso chiede quali dati tenere; se sparisce,
     «Salva» si spegne.
   - Modo scheda (il «Modulo completo» dell'Oracolo): niente scritture,
     «Usa nella scheda» restituisce i valori al ponte.
   - Una proposta o un duplicato non si perdono in silenzio anche se non
     toccati: la guardia chiede comunque.
   ────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import type { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { todayKey } from "../../../shared/lib/dates.ts";
import { concertoInput, festivalInput } from "../../../shared/schema/entry.ts";
import { useEditorConcerti, type AperturaConcerto } from "../editor.tsx";
import type { VoceMenu } from "../ui/Menu.tsx";
import { Pannello } from "../ui/Pannello.tsx";
import { useScrittura, useToast, type AzioneToast } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { useNomi } from "./campiConcerto.tsx";
import { CampiConcerto, CampiFestival, ProviderModulo, SaltiModulo, ScegliTipo, type ContestoModulo, type FormEvento } from "./ConcertoForm.tsx";
import { Conferma, Errore, useConvex } from "./comuni.tsx";
import {
  campiMancanti, campoDaServer, chiaveNome, daConcertoAFestival, daFestivalAConcerto, eFestival, eValoriFestival, erroriSchema, etichettaCampo,
  inProgrammaValori, inputConcerto, inputFestival, ordinaCampi, patchConcerto, patchFestival, titoloDi, ultimaPartenza, valoriConcerto,
  valoriDuplicati, valoriFestival, venueRecenti, type EventoUi, type ValoriConcerto, type ValoriFestival,
} from "./forme.ts";

const FORM = "mod-form-evento";

/* ── i tipi del pannello ──────────────────────────────────────── */

/** Come è andato il salvataggio (per il ponte dell'editor; la notifica la mostra il form). */
export interface Salvataggio {
  id: string;
  kmPending: boolean;
}

/** Dopo il salvataggio: il prossimo della coda da aprire (o null), e se l'evento ora è completo. */
export interface DopoSalvataggio {
  prossimo: string | null;
  completo: boolean;
}

/** La coda dei "da completare" (`completa=1`): dove siamo e chi viene dopo. */
export interface InfoCoda {
  posizione: number;
  totale: number;
  prossimo: string | null;
}

/** I valori portati da un form nuovo all'altro tipo (concerto ↔ festival). */
export interface Passaggio {
  tipo: "concert" | "festival";
  valori: ValoriConcerto | ValoriFestival;
  /** Il form di prima aveva modifiche: anche questo le ha. */
  sporco: boolean;
}

type Valori = ValoriConcerto | ValoriFestival;

interface PropsPannello {
  /** La riga dal vivo (assente = nuovo; quella vista per ultima se nel frattempo è sparita). */
  evento?: EventoUi;
  /** La riga non c'è più in entries.list. */
  sparito?: boolean;
  tipo: "concert" | "festival";
  /** L'apertura dal ponte dell'editor (bozza, origine, modo), se c'è. */
  apertura?: AperturaConcerto | null;
  /** Tutti gli eventi (le scorciatoie del form). */
  eventi: EventoUi[];
  coda?: InfoCoda | null;
  passaggio?: Passaggio | null;
  onChiudi: () => void;
  onSalvato: (s: Salvataggio, dopo: DopoSalvataggio) => void;
  onUsato: (v: Valori) => void;
  /** Cancellato dal menu della testa: il pannello si chiude senza guardia. */
  onCancellato: () => void;
  /** La guardia ha tenuto aperto il pannello. */
  onResta?: () => void;
  /** Un form nuovo cambia tipo (solo se non arriva dal ponte). */
  onTipo?: (p: Passaggio) => void;
}

/* ── il pannello ──────────────────────────────────────────────── */

export function ConcertoPannello(props: PropsPannello) {
  const { evento, tipo, apertura, passaggio } = props;
  const festival = evento ? eFestival(evento) : tipo === "festival";
  // la bozza vale solo per il tipo giusto (un festival non prende i campi di un concerto)
  const bozza = apertura && (apertura.tipo === "festival") === festival ? apertura.bozza : undefined;
  // la riga da cui parte il form: cambia solo ricaricando (form pulito, o «Usa i dati nuovi»)
  const [base, setBase] = useState(evento);
  const [revisione, setRevisione] = useState(0);
  const live = useRef(evento);
  live.current = evento;
  const iniziali = useMemo<Valori>(() => {
    if (passaggio) return passaggio.valori;
    return festival
      ? { ...valoriFestival(base && eFestival(base) ? base : undefined), ...(bozza as Partial<ValoriFestival> | undefined) }
      : { ...valoriConcerto(base && !eFestival(base) ? base : undefined), ...(bozza as Partial<ValoriConcerto> | undefined) };
    // la bozza e il tipo restano quelli dell'apertura: cambia solo la riga
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, revisione]);
  const ricarica = useCallback(() => {
    setBase(live.current);
    setRevisione(r => r + 1);
  }, []);
  return (
    <ModuloEvento
      {...props}
      festival={festival}
      base={base}
      live={evento}
      iniziali={iniziali}
      revisione={revisione}
      sporcoIniziale={!!passaggio?.sporco}
      onRicarica={ricarica}
    />
  );
}

/** `?apri=` con un id che non c'è (cancellato, o di un'altra pagina). */
export function ConcertoMancante({ onChiudi }: { onChiudi: () => void }) {
  return (
    <Pannello titolo="Modifica concerto" sporco={false} onChiudi={onChiudi} piedi={null}>
      <p className="mod-vuoto">Questo concerto non c'è più: forse è stato cancellato.</p>
    </Pannello>
  );
}

/** La cancellazione di un concerto o festival (la riga ⋯ dell'elenco e il ⋯ del pannello): conferma, poi la notifica con «Annulla». */
export function CancellaEvento({ e, onChiudi, onCancellato }: { e: EventoUi; onChiudi: () => void; onCancellato?: () => void }) {
  const op = useScrittura();
  const convex = useConvex();
  const fest = eFestival(e);
  return (
    <Conferma
      titolo={`Cancellare ${fest ? "il festival" : "il concerto"}?`}
      onChiudi={onChiudi}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        const r = await op.esegui(() => convex.mutation(api.entries.remove, { id: e.id, confirm: true }), {
          successo: fest ? "Festival cancellato." : "Concerto cancellato.",
          annullabile: true,
          tabelle: ["entries"],
        });
        if (!r) return;
        onChiudi();
        onCancellato?.();
      }}
    >
      <p>
        <b>{titoloDi(e)}</b>, {e.date} a {e.venue}. Sparisce dalla tua pagina; se lo riaggiungi, o lo ripristini con «Annulla», torna
        con gli stessi km.
      </p>
    </Conferma>
  );
}

/* ── il form ──────────────────────────────────────────────────── */

/** Concerto o festival: lo schema, l'input di add_concert e la patch di update_concert. */
interface Tipo {
  festival: boolean;
  etichetta: "Concerto" | "Festival";
  schema: z.ZodType;
  input: (v: never) => unknown;
  patch: (v: never) => unknown;
}
const CONCERTO: Tipo = { festival: false, etichetta: "Concerto", schema: concertoInput, input: inputConcerto as (v: never) => unknown, patch: patchConcerto as (v: never) => unknown };
const FESTIVAL: Tipo = { festival: true, etichetta: "Festival", schema: festivalInput, input: inputFestival as (v: never) => unknown, patch: patchFestival as (v: never) => unknown };

/**
 * Salva (add o update) con la notifica «Concerto aggiunto.» & co. e
 * «Annulla»; senza l'indirizzo della partenza, i km arrivano dopo e la
 * notifica porta all'indirizzo di quella partenza. Un concerto nuovo
 * arrivato dalla wishlist («L'ho visto») offre di togliere l'artista
 * dalla wishlist (`daWishlist`: il nome com'è nella lista).
 */
function useSalvaEvento(tipo: "Concerto" | "Festival", nuovo: boolean, daWishlist?: string) {
  const op = useScrittura();
  const togli = useScrittura();
  const { mostra } = useToast();
  const convex = useConvex();
  const nomi = useNomi();
  const { vai } = useVista();
  /** Dalla notifica, anche a pannello chiuso: la wishlist di adesso, senza l'artista. */
  const togliDallaWishlist = async (artista: string) => {
    // il pannello non c'è più a mostrare un errore: lo dice la notifica
    const fallito = () => mostra({ testo: `${artista} è ancora nella wishlist: non sono riuscito a toglierlo, riprova da «Wishlist».` });
    let artists: string[];
    try {
      ({ artists } = await convex.query(api.wishlist.list, {}));
    } catch {
      fallito();
      return;
    }
    const lista = artists.filter(a => chiaveNome(a) !== chiaveNome(artista));
    if (lista.length === artists.length) {
      mostra({ testo: `${artista} non è più nella wishlist.` });
      return;
    }
    const r = await togli.esegui(() => convex.mutation(api.wishlist.set, { artists: lista }), {
      successo: `${artista} tolto dalla wishlist.`,
      annullabile: true,
      tabelle: ["wishlist"],
    });
    if (!r) fallito();
  };
  const salva = async (f: () => Promise<{ id: string; avviso?: string } | { id: string }>, from: string): Promise<Salvataggio | undefined> => {
    const partenza = from ? nomi.partenze.find(d => chiaveNome(d.name) === chiaveNome(from)) : undefined;
    const inSospeso = (r: { id: string; avviso?: string } | { id: string }) => ("avviso" in r ? !!r.avviso : partenza?.stato === "mancante");
    const r = await op.esegui(f, {
      successo: r =>
        !nuovo ? `${tipo} modificato.` : inSospeso(r) ? `${tipo} aggiunto: i km arrivano quando la partenza ha un indirizzo.` : `${tipo} aggiunto.`,
      annullabile: true,
      tabelle: ["entries"],
      azioni: (r): AzioneToast[] => [
        ...(nuovo && inSospeso(r) ? [{ etichetta: "Imposta l'indirizzo", onClick: () => void vai("partenze", partenza ? { indirizzo: partenza.id } : {}) }] : []),
        ...(nuovo && daWishlist ? [{ etichetta: `Togli ${daWishlist} dalla wishlist`, onClick: () => togliDallaWishlist(daWishlist) }] : []),
      ],
    });
    return r && { id: r.id, kmPending: inSospeso(r) };
  };
  return { op, nomi, salva };
}

/** Il primo campo di un controllo del form (anche di un gruppo: la venue, le pastiglie, i compagni). */
function focusCampo(campo: string) {
  const form = document.getElementById(FORM);
  const c = campo === "city" ? "venue" : campo;
  const blocco = form?.querySelector<HTMLElement>(`[data-campo="${CSS.escape(c)}"]`) ?? form?.querySelector<HTMLElement>(`[name="${CSS.escape(c)}"]`);
  const el = blocco?.matches("input, select, textarea, button")
    ? blocco
    : blocco?.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)");
  el?.focus();
}

/** Dopo che React ha reso lo stato appena cambiato (un concerto del festival aperto). */
const dopoIlRender = (f: () => void) => setTimeout(() => requestAnimationFrame(f), 0);

interface PropsModulo extends PropsPannello {
  festival: boolean;
  base?: EventoUi;
  live?: EventoUi;
  iniziali: Valori;
  /** Cresce a ogni ricarica dalla riga dal vivo: il form riparte da `iniziali` (senza rimontare il pannello). */
  revisione: number;
  sporcoIniziale: boolean;
  onRicarica: () => void;
}

function ModuloEvento(p: PropsModulo) {
  const { festival, base, live, apertura, coda } = p;
  const t = festival ? FESTIVAL : CONCERTO;
  const scheda = apertura?.modo === "scheda";
  const origine = apertura?.origine;
  const convex = useConvex();
  const { vai } = useVista();
  const editor = useEditorConcerti();
  // dalla wishlist («L'ho visto»): l'artista com'era nella lista, per toglierlo dopo il salvataggio
  const daWishlist = origine === "wishlist" && !scheda && !festival ? (apertura?.bozza as Partial<ValoriConcerto> | undefined)?.artist : undefined;
  const { op, nomi, salva } = useSalvaEvento(t.etichetta, !base, daWishlist);
  const prefisso = `mf${useId().replace(/[^A-Za-z0-9]/g, "")}`;
  const [oggi] = useState(() => todayKey(Date.now()));
  const [andataAperta, setAndataAperta] = useState(false);
  const [setAperti, setSetAperti] = useState<ReadonlySet<number>>(() => {
    const n = eValoriFestival(p.iniziali) ? p.iniziali.concerts.length : 0;
    return new Set(n <= 3 ? Array.from({ length: n }, (_, i) => i) : []);
  });
  const [ignorata, setIgnorata] = useState<string | null>(null);
  const [cancella, setCancella] = useState(false);
  // dal primo invio a buon fine il pannello sta per chiudersi: niente avvisi né ricariche
  const salvando = useRef(false);
  const conProssimo = !!coda?.prossimo && !scheda;

  const espandi = useCallback((k: "andata" | number, aperto: boolean) => {
    if (k === "andata") setAndataAperta(aperto);
    else
      setSetAperti(s => {
        const n = new Set(s);
        if (aperto) n.add(k);
        else n.delete(k);
        return n;
      });
  }, []);
  const scambia = useCallback((i: number, j: number) => {
    setSetAperti(s => {
      const n = new Set(s);
      const [a, b] = [s.has(i), s.has(j)];
      if (a) n.add(j);
      else n.delete(j);
      if (b) n.add(i);
      else n.delete(i);
      return n;
    });
  }, []);
  const rimuovi = useCallback((i: number) => {
    setSetAperti(s => new Set([...s].filter(x => x !== i).map(x => (x > i ? x - 1 : x))));
  }, []);

  /** Porta a un campo: prima apre la parte che lo nasconde. */
  const vaiAlCampo = useCallback((campo: string) => {
    const set = /^concerts\[(\d+)\]/.exec(campo);
    if (set) espandi(Number(set[1]), true);
    if (/(^|\.)(voto|vicinanza|canzoniNote)$/.test(campo)) setAndataAperta(true);
    dopoIlRender(() => focusCampo(campo));
  }, [espandi]);

  const errori = (v: Valori) => erroriSchema(t.schema, t.input(v as never));

  const form = useForm({
    defaultValues: p.iniziali,
    onSubmitMeta: { poi: "chiudi" } as { poi: "chiudi" | "prossimo" },
    validators: { onChange: ({ value }: { value: Valori }) => errori(value) },
    onSubmitInvalid: ({ value }) => {
      const primo = ordinaCampi(Object.keys(errori(value)?.fields ?? {}))[0];
      if (primo) vaiAlCampo(primo);
    },
    onSubmit: async ({ value, meta }) => {
      // la riga non c'è più: «Salva» è spento, e ⌘/Ctrl+Invio non scrive lo stesso
      if (p.sparito) return;
      // un secondo invio mentre il primo salva (o dopo, col pannello che si chiude): niente doppioni né un secondo «indietro»
      if (salvando.current) return;
      if (scheda) {
        salvando.current = true;
        p.onUsato(value);
        return;
      }
      // il prossimo della coda si decide prima di salvare, sull'elenco di adesso
      const prossimo = meta.poi === "prossimo" ? (coda?.prossimo ?? null) : null;
      salvando.current = true;
      const s = await salva(
        () =>
          base
            ? convex.mutation(api.entries.update, { id: base.id, patch: t.patch(value as never) } as never)
            : convex.mutation(api.entries.add, t.input(value as never) as never),
        value.from,
      );
      if (!s) {
        salvando.current = false;
        return;
      }
      p.onSalvato(s, { prossimo, completo: campiMancanti(value, oggi).length === 0 });
    },
  });

  // ricaricato dalla riga dal vivo: i valori nuovi diventano quelli di partenza (il form torna pulito)
  const { revisione, iniziali } = p;
  useEffect(() => {
    if (revisione > 0) form.reset(iniziali);
  }, [revisione, iniziali, form]);

  const valori = useStore(form.store, s => s.values) as Valori;
  const tentativi = useStore(form.store, s => s.submissionAttempts);
  const formSporco = useStore(form.store, s => !s.isDefaultValue);
  // una proposta, un duplicato o i valori portati dall'altro tipo non si perdono in silenzio; nel modo scheda la scheda li tiene già
  const sporco = scheda ? formSporco : formSporco || p.sporcoIniziale || (origine !== undefined && origine !== "dacompletare");
  const mancanti = useMemo(() => campiMancanti(valori, oggi), [valori, oggi]);
  const recenti = useMemo(() => venueRecenti(p.eventi), [p.eventi]);
  const ultima = useMemo(() => (base ? null : ultimaPartenza(p.eventi)), [base, p.eventi]);

  // il riepilogo degli errori dopo un invio, aggiornato mentre si correggono
  const daControllare = tentativi > 0 ? ordinaCampi(Object.keys(errori(valori)?.fields ?? {})) : [];
  const riepilogo = daControllare.filter((c, i) => daControllare.findIndex(x => etichettaCampo(x) === etichettaCampo(c)) === i);

  // in coda («Completa»): il focus parte dal primo campo che manca, non dal titolo (una volta, all'apertura)
  const primoMancante = coda && !scheda ? ordinaCampi(mancanti)[0] : undefined;
  const avviato = useRef(false);
  useEffect(() => {
    if (avviato.current) return;
    avviato.current = true;
    if (primoMancante) vaiAlCampo(primoMancante);
  }, [primoMancante, vaiAlCampo]);

  // l'errore del server va sotto il suo campo, e il focus lì
  const campoErrore = campoDaServer(op.errore?.campo);
  useEffect(() => {
    if (campoErrore) vaiAlCampo(campoErrore);
  }, [op.errore, campoErrore, vaiAlCampo]);

  // la riga è cambiata da un'altra parte: form pulito → si ricarica; con modifiche → l'avviso
  const jsonLive = live ? JSON.stringify(live) : null;
  const cambiato = !!base && !!live && jsonLive !== JSON.stringify(base);
  const { onRicarica } = p;
  useEffect(() => {
    if (cambiato && !sporco && !salvando.current) onRicarica();
  }, [cambiato, sporco, jsonLive, onRicarica]);
  const conflitto = cambiato && sporco && jsonLive !== ignorata && !salvando.current && !p.sparito;

  const tipoParola = festival ? "festival" : "concerto";
  const titolo = scheda ? `Scheda: ${base ? "modifica" : "nuovo"} ${tipoParola}` : `${base ? "Modifica" : "Nuovo"} ${tipoParola}`;
  const sottotitolo = scheda
    ? "Dalla scheda dell'Oracolo: «Usa nella scheda» la aggiorna, senza salvare."
    : origine === "oracolo"
      ? "Proposta dell'Oracolo: controlla e salva."
      : coda
        ? `Da completare · ${coda.posizione} di ${coda.totale}`
        : base
          ? `${titoloDi(base)} · ${base.date}`
          : undefined;

  const evento = live ?? base;
  const azioni: VoceMenu[] =
    base && !scheda && evento
      ? [
          { etichetta: "Duplica", icona: "copy", onClick: () => void editor.apri({ tipo: festival ? "festival" : "concert", bozza: valoriDuplicati(evento), origine: "duplica" }) },
          { etichetta: "Cancella…", icona: "trash", pericolo: true, onClick: () => setCancella(true) },
        ]
      : [];

  const testa = (
    <>
      <SaltiModulo festival={festival} prefisso={prefisso} mancanti={mancanti} />
      {p.sparito && (
        <p className="mod-attenzione mf-avviso-pannello" role="status">
          {festival ? "Questo festival non c'è più." : "Questo concerto non c'è più."}
        </p>
      )}
      {conflitto && (
        <div className="mod-attenzione mf-avviso-pannello" role="status">
          <p>Nel frattempo questo {tipoParola} è cambiato (Oracolo, un agente o un'altra scheda).</p>
          <div className="mf-avviso-azioni">
            <button type="button" className="mod-btn" onClick={p.onRicarica}>Usa i dati nuovi</button>
            <button type="button" className="mod-btn mf-btn-fantasma" onClick={() => setIgnorata(jsonLive)}>Tieni le mie modifiche</button>
          </div>
        </div>
      )}
      {riepilogo.length > 0 && (
        <div className="mod-errore mf-riepilogo" role="alert">
          <p>
            Controlla {riepilogo.length === 1 ? "1 campo" : `${riepilogo.length} campi`}:{" "}
            {riepilogo.map((c, i) => (
              <span key={c}>
                {i > 0 && ", "}
                <button type="button" className="mf-link-testo" onClick={() => vaiAlCampo(c)}>{etichettaCampo(c)}</button>
              </span>
            ))}
            .
          </p>
        </div>
      )}
    </>
  );

  const fermo = op.inCorso || !!p.sparito;
  const piedi = (
    <>
      <button type="button" className="mod-btn mf-btn-fantasma" onClick={p.onChiudi}>{scheda ? "Torna alla scheda" : "Annulla"}</button>
      {conProssimo && (
        <button type="submit" form={FORM} className="mod-btn" data-poi="chiudi" disabled={fermo}>Salva</button>
      )}
      <button type="submit" form={FORM} className="mod-btn mod-primario" data-poi={conProssimo ? "prossimo" : "chiudi"} disabled={fermo}>
        {scheda ? "Usa nella scheda" : op.inCorso ? "Salvo…" : conProssimo ? "Salva e vai al prossimo" : "Salva"}
      </button>
    </>
  );

  const contesto: ContestoModulo = {
    form: form as unknown as FormEvento,
    festival,
    valori,
    evento,
    scheda,
    nomi,
    recenti,
    ultima,
    inProgramma: inProgrammaValori(valori, oggi),
    mancanti,
    evidenzia: new Set(apertura?.evidenzia ?? []),
    erroreServer: campoErrore && op.errore ? { campo: campoErrore, errore: op.errore } : null,
    andataAperta,
    setAperti,
    espandi,
    scambia,
    rimuovi,
    prefisso,
    autofocus: p.passaggio ? "tipo" : base ? null : "campo",
    vai: (v, par) => void vai(v, par),
  };

  return (
    <>
      <Pannello
        titolo={titolo}
        sottotitolo={sottotitolo}
        sporco={sporco}
        onChiudi={p.onChiudi}
        onResta={p.onResta}
        modulo={FORM}
        azioni={azioni}
        testa={testa}
        piedi={piedi}
        subito={!!p.passaggio}
      >
        <ProviderModulo value={contesto}>
          <form
            id={FORM}
            className="mod-form mf-modulo"
            noValidate
            onSubmit={e => {
              e.preventDefault();
              // ⌘/Ctrl+Invio (senza pulsante) in coda vuol dire «Salva e vai al prossimo»
              const da = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
              const poi = da ? (da.dataset.poi === "prossimo" ? "prossimo" : "chiudi") : conProssimo ? "prossimo" : "chiudi";
              void form.handleSubmit({ poi });
            }}
          >
            {p.onTipo && !base && !apertura && (
              <ScegliTipo
                festival={festival}
                autofocus={!!p.passaggio}
                onTipo={nuovo =>
                  nuovo !== (festival ? "festival" : "concert") &&
                  p.onTipo!({
                    tipo: nuovo,
                    valori: eValoriFestival(valori) ? daFestivalAConcerto(valori) : daConcertoAFestival(valori),
                    sporco: formSporco || p.sporcoIniziale,
                  })
                }
              />
            )}
            {festival ? <CampiFestival /> : <CampiConcerto />}
            {!campoErrore && <Errore errore={op.errore} />}
          </form>
        </ProviderModulo>
      </Pannello>
      {cancella && evento && (
        <CancellaEvento
          e={evento}
          onChiudi={() => setCancella(false)}
          onCancellato={() => {
            salvando.current = true;
            p.onCancellato();
          }}
        />
      )}
    </>
  );
}
