/* ──────────────────────────────────────────────────────────────
   #persone (T5, spec ux-modifica §6.5): i compagni di concerto, un
   elenco privato del profilo.

   - In cima l'aggiunta rapida, l'unico «Aggiungi» della vista (con la
     regola dei soprannomi, §1.42); un nome che c'è già si segnala mentre
     si scrive («Esiste già «Lu».»).
   - Sotto, la barra degli strumenti: cerca (`/`), «Tutte» · «Mai in un
     concerto», ordine per nome o per numero di concerti. Aggiunta e barra
     sono un solo blocco fermo sotto la barra in alto mentre l'elenco
     scorre (per questo cerca, filtro e ordine stanno nella sezione).
   - Ogni riga apre il pannello della persona (`?apri=<personId>`):
     rinomina, i concerti in cui c'è (ognuno apre il suo pannello), unisci
     a un'altra persona, cancella. Il menu ⋯ della riga: «Rinomina» (il
     pannello col focus sul nome), «Unisci…», «Vedi i concerti» (#concerti
     col filtro «Con X»), «Cancella…».
   - Unire due persone è un solo lotto nel registro (Annulla le rimette
     com'erano); cancellare è bloccato finché la persona è in qualche
     concerto. Ogni scrittura finisce in una notifica con «Annulla».
   ────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { todayKey } from "../../../shared/lib/dates.ts";
import { aggiungiPersonaInput } from "../../../shared/schema/people.ts";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { BarraStrumenti, TestaFerma, Vuoto } from "../ui/campi.tsx";
import { Menu } from "../ui/Menu.tsx";
import { Pannello } from "../ui/Pannello.tsx";
import { useScrittura } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, Soprannomi, useConvex, useDati } from "./comuni.tsx";
import {
  chiaveNome, elencoPersone, erroriSchema, eventiConPersona, eventiDiPersona, nomeGiaUsato, titoloDi, ultimoConcertoPerPersona,
  type EventoUi, type FiltroPersone, type OrdinePersone,
} from "./forme.ts";

type Persona = FunctionReturnType<typeof api.people.list>["people"][number];
type Azione = { tipo: "unisci" | "cancella"; p: Persona } | null;
/** Cerca, filtro e ordine dell'elenco. */
type Cerca = { testo: string; filtro: FiltroPersone; ordine: OrdinePersone };
/** Il focus sul nome nel pannello («Rinomina»): `n` cambia a ogni richiesta, anche col pannello già aperto. */
type FuocoNome = { id: string; n: number } | null;

const ORDINI = [
  { valore: "nome", testo: "Nome A–Z" },
  { valore: "piu", testo: "Più concerti" },
  { valore: "meno", testo: "Meno concerti" },
];
/** Nel pannello, i primi concerti della persona; gli altri nell'elenco filtrato. */
const CONCERTI_NEL_PANNELLO = 20;
const FORM = "mod-form-persona";
const CERCA_INIZIALE: Cerca = { testo: "", filtro: "tutte", ordine: "nome" };

const quantePersone = (n: number) => (n === 1 ? "1 persona" : `${n} persone`);
const quantiConcerti = (n: number) => (n === 0 ? "nessun concerto" : n === 1 ? "1 concerto" : `${n} concerti`);

export function SezionePersone(_props: SezioneProps) {
  const q = useDati(api.people.list);
  const eventi = useDati(api.entries.list, {});
  const { vista, parametri, apriPannello, chiudiPannello } = useVista();
  const [azione, setAzione] = useState<Azione>(null);
  const [fuoco, setFuoco] = useState<FuocoNome>(null);
  // qui e non nell'elenco: la barra sta nel blocco fermo con l'aggiunta rapida
  const [cerca, setCerca] = useState<Cerca>(CERCA_INIZIALE);
  const persone = q.data?.people;
  const trovate = useMemo(() => (persone ? elencoPersone(persone, cerca) : []), [persone, cerca]);
  const n = persone?.length;
  const aperta = vista === "persone" ? (parametri.apri ?? null) : null;
  // "oggi" a Roma: la sezione esiste solo nel browser, dopo l'idratazione
  const oggi = todayKey(Date.now());
  const ultime = useMemo(() => ultimoConcertoPerPersona(eventi.data?.concerts ?? [], oggi), [eventi.data, oggi]);

  const apri = (p: Persona, rinomina = false) => {
    setFuoco(rinomina ? { id: p.id, n: Date.now() } : null);
    void apriPannello({ apri: p.id });
  };
  // unita o cancellata col suo pannello aperto: il pannello si chiude (senza guardia: la scrittura è fatta)
  const fatto = (p: Persona) => {
    setAzione(null);
    if (aperta === p.id) chiudiPannello({ dopoSalvataggio: true });
  };

  return (
    <CorniceSezione>
      <IntestazioneVista
        id="persone"
        titolo="Persone"
        meta={n !== undefined && quantePersone(n)}
        descrizione="Le persone con cui vai ai concerti. Sulla pagina pubblica compaiono solo i nomi usati nei concerti."
      />
      <TestaFerma>
        <NuovaPersona persone={persone} />
        {persone && persone.length > 0 && <Strumenti persone={persone} trovate={trovate.length} cerca={cerca} onCerca={setCerca} />}
      </TestaFerma>
      <Caricamento q={q} righe>
        {({ people }) =>
          people.length === 0 ? (
            <Vuoto icona="users" titolo="Nessuna persona, per ora." testo="Si aggiungono anche dal modulo di un concerto, in «Con chi»." />
          ) : (
            <Elenco
              persone={people}
              trovate={trovate}
              ultime={ultime}
              aperta={aperta}
              onAzzera={() => setCerca(c => ({ ...c, testo: "", filtro: "tutte" }))}
              onApri={apri}
              onAzione={setAzione}
            />
          )
        }
      </Caricamento>
      {aperta && q.data && (
        <PannelloPersona
          key={aperta}
          id={aperta}
          persone={q.data.people}
          eventi={eventi.data?.concerts}
          ultime={ultime}
          fuoco={fuoco}
          onAzione={setAzione}
        />
      )}
      {azione?.tipo === "unisci" && <Unisci p={azione.p} persone={q.data?.people ?? []} onChiudi={() => setAzione(null)} onFatto={() => fatto(azione.p)} />}
      {azione?.tipo === "cancella" && (
        <Cancella p={azione.p} eventi={eventi.data?.concerts ?? []} onChiudi={() => setAzione(null)} onFatto={() => fatto(azione.p)} />
      )}
    </CorniceSezione>
  );
}

/** «Esiste già «Lu».»: un errore del campo, così l'invio non parte (il server lo rifiuterebbe). */
const esisteGia = (nomi: readonly string[], nome: string) => {
  const x = nomeGiaUsato(nomi, nome);
  return x ? { fields: { name: `esiste già «${x}»` } } : undefined;
};

function NuovaPersona({ persone }: { persone: Persona[] | undefined }) {
  const convex = useConvex();
  const op = useScrittura();
  const modulo = useRef<HTMLFormElement>(null);
  // il validatore legge sempre l'elenco di adesso
  const nomi = useRef<string[]>([]);
  nomi.current = persone?.map(p => p.name) ?? [];
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPersonaInput, value) ?? esisteGia(nomi.current, value.name) },
    onSubmit: async ({ value, formApi }) => {
      const r = await op.esegui(() => convex.mutation(api.people.add, { name: value.name }), { successo: "Persona aggiunta.", annullabile: true, tabelle: ["people"] });
      if (!r) return;
      formApi.reset();
      modulo.current?.querySelector("input")?.focus();
    },
  });
  return (
    <form ref={modulo} className="mod-form mf-aggiungi" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <form.Field name="name">
        {f => (
          <CampoTesto
            f={f}
            etichetta="Nuova persona"
            aiuto={<Soprannomi />}
            maxLength={40}
            autoComplete="off"
            azione={<button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>}
          />
        )}
      </form.Field>
      <Errore errore={op.errore} />
    </form>
  );
}

/* ── la barra e l'elenco ───────────────────────────────────────── */

/** La barra degli strumenti, sotto l'aggiunta rapida nel blocco fermo. */
function Strumenti({ persone, trovate, cerca, onCerca }: {
  persone: Persona[];
  /** Quante passano cerca e filtro. */
  trovate: number;
  cerca: Cerca;
  onCerca: Dispatch<SetStateAction<Cerca>>;
}) {
  const mai = persone.filter(p => p.concerti === 0).length;
  const filtrato = cerca.testo.trim() !== "" || cerca.filtro !== "tutte";
  return (
    <BarraStrumenti
      incassata
      cerca={{ etichetta: "Cerca una persona", segnaposto: "Cerca una persona", valore: cerca.testo, onCambia: testo => onCerca(c => ({ ...c, testo })) }}
      filtri={{
        etichetta: "Filtra le persone",
        valore: cerca.filtro,
        opzioni: [
          { valore: "tutte", testo: "Tutte", conta: persone.length },
          { valore: "mai", testo: "Mai in un concerto", conta: mai },
        ],
        onCambia: v => onCerca(c => ({ ...c, filtro: v as FiltroPersone })),
      }}
      ordina={{ valore: cerca.ordine, opzioni: ORDINI, onCambia: v => onCerca(c => ({ ...c, ordine: v as OrdinePersone })) }}
      conta={filtrato ? `${trovate} di ${persone.length}` : quantePersone(persone.length)}
    />
  );
}

function Elenco({ persone, trovate, ultime, aperta, onAzzera, onApri, onAzione }: {
  persone: Persona[];
  /** Quelle che passano cerca e filtro, in ordine. */
  trovate: Persona[];
  ultime: Map<string, string>;
  /** La persona col pannello aperto. */
  aperta: string | null;
  onAzzera: () => void;
  onApri: (p: Persona, rinomina?: boolean) => void;
  onAzione: (a: Azione) => void;
}) {
  const { vai } = useVista();
  return trovate.length === 0 ? (
    <Vuoto icona="search" titolo="Nessuna persona con questi filtri." azioni={<button type="button" className="mod-btn" onClick={onAzzera}>Azzera i filtri</button>} />
  ) : (
    <ul className="mod-lista mf-righe mf-righe-persone" aria-label="Persone">
      {trovate.map(p => (
        <li key={p.id} className="mf-riga mf-riga-persona" aria-current={p.id === aperta ? "true" : undefined}>
          <span className="mf-riga-titolo">
            <button type="button" className="mf-riga-apri" aria-label={`Apri ${p.name}`} onClick={() => onApri(p)}>
              {p.name}
            </button>
          </span>
          <span className="mf-riga-conta" data-zero={p.concerti === 0 ? "" : undefined}>{quantiConcerti(p.concerti)}</span>
          <span className="mf-riga-ultima">{ultime.has(chiaveNome(p.name)) ? `ultima volta ${ultime.get(chiaveNome(p.name))}` : ""}</span>
          <span className="mf-riga-menu">
            <Menu
              etichetta={`Altre azioni per ${p.name}`}
              voci={[
                { etichetta: "Rinomina", icona: "pen", onClick: () => onApri(p, true) },
                { etichetta: "Unisci…", icona: "users", disabilitata: persone.length < 2, onClick: () => onAzione({ tipo: "unisci", p }) },
                { etichetta: "Vedi i concerti", icona: "ticket", disabilitata: p.concerti === 0, onClick: () => void vai("concerti", { con: p.id }) },
                { etichetta: "Cancella…", icona: "trash", pericolo: true, onClick: () => onAzione({ tipo: "cancella", p }) },
              ]}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── il pannello di una persona ───────────────────────────────── */

/** `?apri=<personId>`: il pannello della persona, o «non c'è più» (unita, cancellata, o un link vecchio). */
function PannelloPersona({ id, persone, eventi, ultime, fuoco, onAzione }: {
  id: string;
  persone: Persona[];
  eventi: EventoUi[] | undefined;
  ultime: Map<string, string>;
  fuoco: FuocoNome;
  onAzione: (a: Azione) => void;
}) {
  const { chiudiPannello } = useVista();
  // l'ultima versione vista: se sparisce mentre è aperto (unita altrove), il pannello resta con l'avviso
  const visto = useRef<Persona | null>(null);
  const p = persone.find(x => x.id === id);
  if (p) visto.current = p;
  const ultima = p ?? visto.current ?? undefined;
  if (!ultima) {
    return (
      <Pannello titolo="Persona" larghezza="media" sporco={false} onChiudi={() => chiudiPannello()} piedi={null}>
        <p className="mod-vuoto">Questa persona non c'è più: forse è stata cancellata o unita a un'altra.</p>
      </Pannello>
    );
  }
  return <ModuloPersona p={ultima} sparita={!p} persone={persone} eventi={eventi} ultima={ultime.get(chiaveNome(ultima.name))} fuoco={fuoco} onAzione={onAzione} />;
}

function ModuloPersona({ p, sparita, persone, eventi, ultima, fuoco, onAzione }: {
  p: Persona;
  sparita: boolean;
  persone: Persona[];
  eventi: EventoUi[] | undefined;
  ultima: string | undefined;
  fuoco: FuocoNome;
  onAzione: (a: Azione) => void;
}) {
  const convex = useConvex();
  const op = useScrittura();
  const { chiudiPannello, apriPannello, vai } = useVista();
  const nome = useRef<HTMLFormElement>(null);
  const altri = useRef<string[]>([]);
  altri.current = persone.filter(x => x.id !== p.id).map(x => x.name);
  const inVolo = useRef(false);
  const form = useForm({
    defaultValues: { name: p.name },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPersonaInput, value) ?? esisteGia(altri.current, value.name) },
    onSubmit: async ({ value, formApi }) => {
      // niente da salvare (il nome è quello di prima) o salva già: nessuna voce vuota nel registro
      if (sparita || inVolo.current || formApi.state.isDefaultValue) return;
      inVolo.current = true;
      const r = await op.esegui(() => convex.mutation(api.people.rename, { id: p.id, name: value.name }), {
        successo: "Persona rinominata: i concerti seguono da soli.",
        annullabile: true,
        tabelle: ["people"],
      });
      if (r) chiudiPannello({ dopoSalvataggio: true });
      else inVolo.current = false;
    },
  });
  const sporco = useStore(form.store, s => !s.isDefaultValue);
  const suoi = useMemo(() => eventiDiPersona(eventi ?? [], p.name), [eventi, p.name]);
  const vuoleNome = fuoco?.id === p.id;

  // rinominata da un'altra parte (l'Oracolo, un agente): col campo non toccato arriva il nome nuovo
  const sporcoRef = useRef(sporco);
  sporcoRef.current = sporco;
  useEffect(() => {
    if (!sporcoRef.current && form.state.values.name !== p.name) form.reset({ name: p.name });
  }, [p.name, form]);

  // «Rinomina» dal menu della riga col pannello già aperto: il focus va al nome
  useEffect(() => {
    if (vuoleNome) nome.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
  }, [vuoleNome, fuoco?.n]);

  return (
    <Pannello
      titolo={p.name}
      sottotitolo={`${quantiConcerti(p.concerti)}${ultima ? ` · ultima volta ${ultima}` : ""}`}
      larghezza="media"
      sporco={sporco}
      onChiudi={() => chiudiPannello()}
      modulo={FORM}
      testa={sparita ? <p className="mod-attenzione" role="note">Questa persona non c'è più: forse è stata unita a un'altra o cancellata da un'altra parte.</p> : undefined}
      piedi={
        <>
          <button type="button" className="mod-btn" onClick={() => chiudiPannello()}>Annulla</button>
          <button type="submit" form={FORM} className="mod-btn mod-primario" disabled={!sporco || op.inCorso || sparita}>
            {op.inCorso ? "Salvo…" : "Salva"}
          </button>
        </>
      }
    >
      <form ref={nome} id={FORM} className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name">
          {f => <CampoTesto f={f} etichetta="Nome" aiuto={<Soprannomi />} maxLength={40} autoFocus={vuoleNome} autoComplete="off" />}
        </form.Field>
        <Errore errore={op.errore} />
      </form>

      <section className="mf-blocco" aria-labelledby={`${FORM}-concerti`}>
        <h3 id={`${FORM}-concerti`}>
          Nei concerti <span className="mod-conta">{suoi.length}</span>
        </h3>
        {suoi.length === 0 ? (
          <p className="mod-hint">Non è ancora in nessun concerto: si aggiunge dal modulo di un concerto, in «Con chi».</p>
        ) : (
          <>
            <ul className="mf-collegamenti">
              {suoi.slice(0, CONCERTI_NEL_PANNELLO).map(e => (
                <li key={e.id}>
                  <button type="button" className="mf-collegamento" onClick={() => void apriPannello({ apri: e.id }, "concerti")}>
                    <span className="mf-collegamento-data">{e.date}</span>
                    <span className="mf-collegamento-titolo">{titoloDi(e)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mod-link" onClick={() => void vai("concerti", { con: p.id })}>
              {suoi.length > CONCERTI_NEL_PANNELLO ? `Vedili tutti nell'elenco (${suoi.length})` : "Vedili nell'elenco dei concerti"}
            </button>
          </>
        )}
      </section>

      <section className="mf-blocco" aria-labelledby={`${FORM}-unisci`}>
        <h3 id={`${FORM}-unisci`}>Unisci a un'altra persona</h3>
        <p className="mod-hint">
          È la stessa persona scritta in due modi? Uniscila all'altra: i suoi concerti passano lì e questa sparisce. «Annulla» la disfa in un passo.
        </p>
        <button type="button" className="mod-btn" disabled={persone.length < 2 || sparita} onClick={() => onAzione({ tipo: "unisci", p })}>
          Unisci…
        </button>
      </section>

      <section className="mf-blocco mf-blocco-pericolo" aria-labelledby={`${FORM}-cancella`}>
        <h3 id={`${FORM}-cancella`}>Cancella</h3>
        <p className="mod-hint">
          {p.concerti > 0
            ? "Si cancella solo quando non è in nessun concerto: toglila da lì, oppure uniscila a un'altra persona."
            : "Non è in nessun concerto: sparisce dall'elenco."}
        </p>
        <button type="button" className="mod-btn mod-pericolo-lieve" disabled={sparita} onClick={() => onAzione({ tipo: "cancella", p })}>
          Cancella la persona
        </button>
      </section>
    </Pannello>
  );
}

/* ── unisci e cancella (dalla riga o dal pannello) ────────────── */

function Unisci({ p, persone, onChiudi, onFatto }: { p: Persona; persone: Persona[]; onChiudi: () => void; onFatto: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
  const altre = persone.filter(x => x.id !== p.id).sort((a, b) => a.name.localeCompare(b.name, "it"));
  const [into, setInto] = useState(altre[0]?.id ?? "");
  const destinazione = altre.find(x => x.id === into);
  return (
    <Conferma
      titolo={`Unire ${p.name} a un'altra persona?`}
      etichetta="Unisci"
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        if (!destinazione) return;
        const r = await op.esegui(() => convex.mutation(api.people.merge, { from: p.id, into: destinazione.id }), {
          successo: `Persone unite: ${p.name} → ${destinazione.name}.`,
          annullabile: true,
          tabelle: ["entries", "people"],
        });
        if (r) onFatto();
      }}
    >
      <label className="mod-campo">
        <span className="mod-etichetta">Resta</span>
        <select value={into} onChange={e => setInto(e.target.value)}>
          {altre.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <p>
        <b>{p.name}</b> sparisce: nei suoi {p.concerti === 1 ? "concerto" : `${p.concerti} concerti`} al suo posto ci sarà{" "}
        <b>{destinazione?.name ?? "…"}</b>. L'unione è un solo passo nel registro: «Annulla» la disfa tutta.
      </p>
    </Conferma>
  );
}

function Cancella({ p, eventi, onChiudi, onFatto }: { p: Persona; eventi: EventoUi[]; onChiudi: () => void; onFatto: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
  const usata = eventiConPersona(eventi, p.name);
  return (
    <Conferma
      titolo={`Cancellare ${p.name}?`}
      bloccato={p.concerti > 0}
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        const r = await op.esegui(() => convex.mutation(api.people.remove, { id: p.id, confirm: true }), { successo: "Persona cancellata.", annullabile: true, tabelle: ["people"] });
        if (r) onFatto();
      }}
    >
      {p.concerti > 0 ? (
        <>
          <p>
            <b>{p.name}</b> è in {p.concerti === 1 ? "un concerto" : `${p.concerti} concerti`}: toglila da lì, oppure uniscila a un'altra
            persona, prima di cancellarla.
          </p>
          {usata.length > 0 && (
            <ul className="mod-elenco-breve">
              {usata.slice(0, 20).map(c => <li key={c}>{c}</li>)}
            </ul>
          )}
        </>
      ) : (
        <p><b>{p.name}</b> non è in nessun concerto: sparisce dall'elenco.</p>
      )}
    </Conferma>
  );
}
