/* ──────────────────────────────────────────────────────────────
   #persone (T5): i compagni di concerto, un elenco privato del profilo.
   Aggiungi e rinomina (con la regola dei soprannomi, §1.42); unisci due
   persone (un solo lotto nel registro: Annulla le rimette com'erano);
   cancella, bloccato finché la persona è in qualche concerto.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { aggiungiPersonaInput } from "../../../shared/schema/people.ts";
import type { SezioneProps } from "../tipi.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, Modale, Soprannomi, useAvviso, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { erroriSchema, eventiConPersona, type EventoUi } from "./forme.ts";

type Persona = FunctionReturnType<typeof api.people.list>["people"][number];
type Azione = { tipo: "rinomina" | "unisci" | "cancella"; p: Persona } | null;

export function SezionePersone(_props: SezioneProps) {
  const q = useDati(api.people.list);
  const eventi = useDati(api.entries.list, {});
  const [azione, setAzione] = useState<Azione>(null);
  const [avviso, setAvviso] = useAvviso();
  const chiudi = (m?: string) => {
    setAzione(null);
    if (m) setAvviso(m);
  };
  return (
    <CorniceSezione>
      <p className="mod-hint">Le persone con cui vai ai concerti. Sulla pagina pubblica compaiono solo i nomi usati nei concerti.</p>
      <NuovaPersona />
      {avviso}
      <Caricamento q={q}>
        {({ people }) =>
          people.length === 0 ? (
            <p className="mod-vuoto">Nessuna persona, per ora.</p>
          ) : (
            <ul className="mod-lista mod-lista-semplice" aria-label="Persone">
              {[...people].sort((a, b) => a.name.localeCompare(b.name, "it")).map(p => (
                <li key={p.id}>
                  <span className="mod-nome">{p.name}</span>
                  <span className="mod-conta">{p.concerti === 1 ? "1 concerto" : `${p.concerti} concerti`}</span>
                  <span className="mod-evento-azioni">
                    <button type="button" className="mod-btn" aria-label={`Rinomina ${p.name}`} onClick={() => setAzione({ tipo: "rinomina", p })}>Rinomina</button>
                    <button type="button" className="mod-btn" aria-label={`Unisci ${p.name}`} disabled={people.length < 2} onClick={() => setAzione({ tipo: "unisci", p })}>Unisci…</button>
                    <button type="button" className="mod-btn mod-pericolo-lieve" aria-label={`Cancella ${p.name}`} onClick={() => setAzione({ tipo: "cancella", p })}>Cancella</button>
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </Caricamento>
      {azione?.tipo === "rinomina" && <Rinomina p={azione.p} onChiudi={chiudi} />}
      {azione?.tipo === "unisci" && <Unisci p={azione.p} persone={q.data?.people ?? []} onChiudi={chiudi} />}
      {azione?.tipo === "cancella" && <Cancella p={azione.p} eventi={eventi.data?.concerts ?? []} onChiudi={chiudi} />}
    </CorniceSezione>
  );
}

function NuovaPersona() {
  const convex = useConvex();
  const op = useOperazione();
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPersonaInput, value) },
    onSubmit: async ({ value, formApi }) => {
      if (await op.esegui(() => convex.mutation(api.people.add, { name: value.name }))) formApi.reset();
    },
  });
  return (
    <form className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="mod-riga mod-riga-fondo">
        <form.Field name="name">{f => <CampoTesto f={f} etichetta="Nuova persona" maxLength={40} autoComplete="off" />}</form.Field>
        <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>
      </div>
      <Soprannomi />
      <Errore errore={op.errore} />
    </form>
  );
}

function Rinomina({ p, onChiudi }: { p: Persona; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const form = useForm({
    defaultValues: { name: p.name },
    validators: { onChange: ({ value }) => erroriSchema(aggiungiPersonaInput, value) },
    onSubmit: async ({ value }) => {
      if (await op.esegui(() => convex.mutation(api.people.rename, { id: p.id, name: value.name }))) onChiudi("Persona rinominata: i concerti seguono da soli.");
    },
  });
  return (
    <Modale titolo={`Rinomina ${p.name}`} onChiudi={() => onChiudi()} piedi={
      <>
        <button type="button" className="mod-btn" onClick={() => onChiudi()}>Annulla</button>
        <button type="submit" form="mod-form-persona" className="mod-btn mod-primario" disabled={op.inCorso}>Salva</button>
      </>
    }>
      <form id="mod-form-persona" className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="name">{f => <CampoTesto f={f} etichetta="Nome" maxLength={40} autoFocus autoComplete="off" />}</form.Field>
        <Soprannomi />
        <Errore errore={op.errore} />
      </form>
    </Modale>
  );
}

function Unisci({ p, persone, onChiudi }: { p: Persona; persone: Persona[]; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
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
        if (await op.esegui(() => convex.mutation(api.people.merge, { from: p.id, into: destinazione.id }))) {
          onChiudi(`Persone unite: ${p.name} → ${destinazione.name}. Puoi annullarlo da «Attività».`);
        }
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

function Cancella({ p, eventi, onChiudi }: { p: Persona; eventi: EventoUi[]; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const usata = eventiConPersona(eventi, p.name);
  return (
    <Conferma
      titolo={`Cancellare ${p.name}?`}
      bloccato={p.concerti > 0}
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        if (await op.esegui(() => convex.mutation(api.people.remove, { id: p.id, confirm: true }))) onChiudi("Persona cancellata.");
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
