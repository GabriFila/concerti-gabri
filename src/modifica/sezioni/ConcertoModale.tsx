/* ──────────────────────────────────────────────────────────────
   Il modale di un concerto o di un festival (#concerti, T5).

   Il form (TanStack Form) si valida con lo schema unico di
   shared/schema/entry.ts (`concertoInput`, `festivalInput`): gli stessi
   controlli di Convex, MCP e dell'import, con i messaggi in italiano di
   forme.ts; i suggerimenti dei campi sono le descrizioni dello schema.
   Nuovo → `entries.add`, esistente → `entries.update` (i campi svuotati si
   tolgono). Il festival ha la sua lineup: almeno due concerti, ciascuno
   con artista, compagni, voto, posizione, canzoni note e un giorno
   facoltativo; biglietto, viaggio e commento sono del festival.

   - Compagni: nomi già tra le persone; uno nuovo si aggiunge da qui, con
     la regola dei soprannomi (§1.42).
   - Venue: dal catalogo condiviso, oppure nuova da OpenStreetMap
     (`geo.searchVenue` → `venues.createFromCandidate`, §5.5.4): si cerca
     il nome del locale, mai un indirizzo.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useId, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useForm, type AnyFieldApi } from "@tanstack/react-form";
import { api } from "../../../convex/_generated/api";
import { CN_LABELS, CN_ORDER, VIC_LABELS, VIC_ORDER } from "../../../shared/model/scale.ts";
import { concertoInput, festivalInput } from "../../../shared/schema/entry.ts";
import { CampoTesto, Errore, ErroriCampo, Modale, Soprannomi, useConvex, useDati, useOperazione } from "./comuni.tsx";
import {
  chiaveNome, descrizione, eFestival, erroriSchema, inputConcerto, inputFestival, nuovoSet, patchConcerto, patchFestival,
  valoriConcerto, valoriFestival, type EventoUi, type ValoriConcerto, type ValoriFestival,
} from "./forme.ts";

const VOTI = [5, 4, 3, 2, 1] as const;
const C = concertoInput.shape;
const F = festivalInput.shape;

/* ── campi ────────────────────────────────────────────────────── */

/** Una scelta numerica facoltativa (voto, posizione, canzoni note); "" = non ancora. */
function CampoScelta({ f, etichetta, opzioni, aiuto }: {
  f: AnyFieldApi;
  etichetta: string;
  opzioni: { valore: number | string; testo: string }[];
  aiuto?: string;
}) {
  const v = f.state.value as number | string | undefined;
  return (
    <label className="mod-campo">
      <span className="mod-etichetta">{etichetta}</span>
      <select
        name={f.name}
        value={v === undefined ? "" : String(v)}
        onChange={e => {
          const scelto = opzioni.find(o => String(o.valore) === e.target.value);
          f.handleChange(scelto?.valore);
        }}
        onBlur={f.handleBlur}
      >
        <option value="">—</option>
        {opzioni.map(o => <option key={o.valore} value={String(o.valore)}>{o.testo}</option>)}
      </select>
      {aiuto && <span className="mod-hint">{aiuto}</span>}
      <ErroriCampo f={f} />
    </label>
  );
}

const OPZ_VOTO = VOTI.map(v => ({ valore: v, testo: `${"★".repeat(v)} ${v}` }));
const OPZ_VIC = VIC_ORDER.map(v => ({ valore: v, testo: `${v} · ${VIC_LABELS[v]}` }));
const OPZ_CN = [...CN_ORDER.map(v => ({ valore: v, testo: `${v} · ${CN_LABELS[v]}` })), { valore: "na", testo: "Non ricordo" }];

/** Il prezzo: un numero, oppure "pagato ma dimenticato" ("na"); vuoto = non si sa. */
function CampoCosto({ f }: { f: AnyFieldApi }) {
  const v = f.state.value as number | "na" | undefined;
  return (
    <div className="mod-campo">
      <label className="mod-etichetta" htmlFor={`${f.name}-num`}>Prezzo (€)</label>
      <div className="mod-riga">
        <input
          id={`${f.name}-num`}
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={typeof v === "number" ? v : ""}
          disabled={v === "na"}
          onChange={e => f.handleChange(e.target.value === "" ? undefined : Number(e.target.value))}
          onBlur={f.handleBlur}
        />
        <label className="mod-spunta">
          <input type="checkbox" checked={v === "na"} onChange={e => f.handleChange(e.target.checked ? "na" : undefined)} />
          Pagato, prezzo dimenticato
        </label>
      </div>
      <span className="mod-hint">{descrizione(C.cost)}</span>
      <ErroriCampo f={f} />
    </div>
  );
}

/**
 * I compagni di un concerto: nomi già tra le persone (senza maiuscole e
 * accenti), oppure una persona nuova aggiunta da qui.
 */
function PersoneScelte({ f, persone }: { f: AnyFieldApi; persone: string[] }) {
  const convex = useConvex();
  const op = useOperazione();
  const [testo, setTesto] = useState("");
  const lista = useId();
  const valore = (f.state.value as string[]) ?? [];
  const nome = testo.trim();
  const trovato = persone.find(p => chiaveNome(p) === chiaveNome(nome));
  const scelti = new Set(valore.map(chiaveNome));
  // i nomi già noti che somigliano a quello scritto: meglio sceglierne uno che creare un doppione
  const simili = nome.length >= 2 ? persone.filter(p => !scelti.has(chiaveNome(p)) && chiaveNome(p).includes(chiaveNome(nome))).slice(0, 5) : [];

  const aggiungi = async () => {
    if (!nome) return;
    if (!trovato) {
      const r = await op.esegui(() => convex.mutation(api.people.add, { name: nome }));
      if (!r) return;
    }
    const n = trovato ?? nome;
    if (!scelti.has(chiaveNome(n))) f.handleChange([...valore, n]);
    setTesto("");
  };

  return (
    <div className="mod-campo">
      <span className="mod-etichetta">Con chi</span>
      {valore.length > 0 && (
        <ul className="mod-chips" aria-label="Compagni">
          {valore.map(n => (
            <li key={n} className="mod-chip">
              {n}
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
            <button key={p} type="button" className="mod-btn" onClick={() => { f.handleChange([...valore, p]); setTesto(""); }}>{p}</button>
          ))}
        </div>
      )}
      {nome && !trovato && <span className="mod-hint">«{nome}» non è ancora tra le tue persone: «Nuova persona» la aggiunge.</span>}
      <Soprannomi />
      <Errore errore={op.errore} />
      <ErroriCampo f={f} />
    </div>
  );
}

type Candidato = { ref: string; name: string; city: string; featureType: "poi" | "city"; label: string };

/** La venue: dal catalogo condiviso o nuova da OpenStreetMap. */
function VenueScelta({ venue, city, onScegli, errore }: {
  venue: string;
  city: string;
  onScegli: (venue: string, city: string) => void;
  errore?: ReactNode;
}) {
  const convex = useConvex();
  const catalogo = useDati(api.entries.venueCatalogo);
  const cerca = useOperazione();
  const crea = useOperazione();
  const [aperta, setAperta] = useState(!venue);
  const [testo, setTesto] = useState("");
  const [osm, setOsm] = useState<{ candidati: Candidato[]; attribuzione: string } | null>(null);
  const [scelto, setScelto] = useState<{ c: Candidato; nome: string } | null>(null);
  const [attesa, setAttesa] = useState<string | null>(null);

  const venues = catalogo.data?.venues ?? [];
  const parole = chiaveNome(testo).split(" ").filter(w => w.length > 1);
  const locali = parole.length
    ? venues.filter(v => parole.every(w => chiaveNome(`${v.name} ${v.city}`).includes(w))).slice(0, 8)
    : [];

  // una venue appena creata (o già nel catalogo con un altro nome): si sceglie quando arriva
  useEffect(() => {
    const v = attesa ? venues.find(x => x.id === attesa) : undefined;
    if (!v) return;
    onScegli(v.name, v.city);
    setAttesa(null);
    setAperta(false);
  }, [attesa, venues, onScegli]);

  const scegli = (name: string, c: string) => {
    onScegli(name, c);
    setAperta(false);
    setTesto("");
    setOsm(null);
  };

  const cercaOsm = async () => {
    setScelto(null);
    const r = await cerca.esegui(() => convex.action(api.geo.searchVenue, { query: testo }));
    if (r) setOsm({ candidati: r.candidati, attribuzione: r.attribuzione });
  };

  const aggiungi = async () => {
    if (!scelto) return;
    const nome = scelto.nome.trim();
    const r = await crea.esegui(() => convex.mutation(api.venues.createFromCandidate, { ref: scelto.c.ref, ...(nome && nome !== scelto.c.name ? { name: nome } : {}) }));
    if (r) setAttesa(r.id);
  };

  return (
    <div className="mod-campo mod-venue">
      <span className="mod-etichetta">Venue</span>
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
              placeholder="Nome del locale o della città"
              aria-label="Cerca una venue"
              maxLength={120}
              onChange={e => {
                setTesto(e.target.value);
                setOsm(null);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (testo.trim().length >= 2) void cercaOsm();
                }
              }}
            />
            {venue && <button type="button" className="mod-btn" onClick={() => setAperta(false)}>Tieni {venue}</button>}
          </div>
          {locali.length > 0 && (
            <ul className="mod-opzioni" aria-label="Venue del catalogo">
              {locali.map(v => (
                <li key={v.id}><button type="button" onClick={() => scegli(v.name, v.city)}>{v.name} <span>· {v.city}</span></button></li>
              ))}
            </ul>
          )}
          {testo.trim().length >= 2 && (
            <button type="button" className="mod-link" disabled={cerca.inCorso} onClick={() => void cercaOsm()}>
              {cerca.inCorso ? "Cerco…" : locali.length ? "Non è nessuna di queste: cerca su OpenStreetMap" : "Cerca su OpenStreetMap"}
            </button>
          )}
          <span className="mod-hint">Cerca il nome del locale, mai un indirizzo: il catalogo delle venue è condiviso tra tutte le pagine.</span>
          <Errore errore={cerca.errore} />
          {osm && (
            <div className="mod-osm">
              {osm.candidati.length === 0 ? (
                <p className="mod-hint">Nessun risultato: prova con un altro nome.</p>
              ) : (
                <ul className="mod-opzioni" aria-label="Risultati di OpenStreetMap">
                  {osm.candidati.map(c => (
                    <li key={c.ref}>
                      <button type="button" aria-pressed={scelto?.c.ref === c.ref} onClick={() => setScelto({ c, nome: c.name })}>
                        {c.name} <span>· {c.city}{c.featureType === "city" ? " (solo la città)" : ""}</span>
                        <small>{c.label}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {scelto && (
                <div className="mod-riga">
                  <input aria-label="Nome della venue" value={scelto.nome} maxLength={120} onChange={e => setScelto({ ...scelto, nome: e.target.value })} />
                  <button type="button" className="mod-btn mod-primario" disabled={crea.inCorso || !!attesa} onClick={() => void aggiungi()}>
                    {attesa ? "Aggiungo…" : "Aggiungi al catalogo"}
                  </button>
                </div>
              )}
              <Errore errore={crea.errore} />
              <p className="mod-attribuzione">{osm.attribuzione}</p>
            </div>
          )}
        </div>
      )}
      {errore}
    </div>
  );
}

/* ── il modale ────────────────────────────────────────────────── */

export function ConcertoModale({ evento, tipo, onChiudi, onSalvato }: {
  /** Assente = nuovo. */
  evento?: EventoUi;
  tipo: "concert" | "festival";
  onChiudi: () => void;
  onSalvato: (messaggio: string) => void;
}) {
  const festival = evento ? eFestival(evento) : tipo === "festival";
  const titolo = `${evento ? "Modifica" : "Nuovo"} ${festival ? "festival" : "concerto"}`;
  return (
    <Modale titolo={titolo} onChiudi={onChiudi} largo piedi={
      <>
        <button type="button" className="mod-btn" onClick={onChiudi}>Annulla</button>
        <button type="submit" form="mod-form-evento" className="mod-btn mod-primario">Salva</button>
      </>
    }>
      {festival ? (
        <FormFestival evento={evento && eFestival(evento) ? evento : undefined} onSalvato={onSalvato} />
      ) : (
        <FormConcerto evento={evento && !eFestival(evento) ? evento : undefined} onSalvato={onSalvato} />
      )}
    </Modale>
  );
}

/** Le liste di nomi che servono ai campi (persone, partenze, "regalato da"). */
function useNomi() {
  const persone = useDati(api.people.list);
  const partenze = useDati(api.departures.list);
  const regali = useDati(api.gifters.list);
  return {
    persone: useMemo(() => (persone.data?.people ?? []).map(p => p.name), [persone.data]),
    partenze: partenze.data?.departures ?? [],
    regali: regali.data?.gifters ?? [],
  };
}

type AnyForm = { Field: ComponentType<any>; Subscribe: ComponentType<any>; setFieldValue: (k: any, v: any) => void };

/** Biglietto, viaggio e commento: uguali per concerti e festival. */
function CampiEvento({ form, nomi, commento }: { form: AnyForm; nomi: ReturnType<typeof useNomi>; commento?: string }) {
  return (
    <>
      <fieldset className="mod-gruppo">
        <legend>Biglietto</legend>
        <form.Field name="cost">{(f: AnyFieldApi) => <CampoCosto f={f} />}</form.Field>
        <div className="mod-riga mod-riga-spunte">
          <form.Field name="gift">
            {(f: AnyFieldApi) => (
              <label className="mod-spunta">
                <input type="checkbox" checked={!!f.state.value} onChange={e => f.handleChange(e.target.checked)} />
                Regalato
              </label>
            )}
          </form.Field>
          <form.Field name="accredito">
            {(f: AnyFieldApi) => (
              <label className="mod-spunta" title={descrizione(C.accredito)}>
                <input type="checkbox" checked={!!f.state.value} onChange={e => f.handleChange(e.target.checked)} />
                Accredito o lista ospiti
              </label>
            )}
          </form.Field>
        </div>
        <form.Subscribe selector={(s: { values: { gift: boolean } }) => s.values.gift}>
          {(regalato: boolean) =>
            regalato && (
              <form.Field name="giftFrom">
                {(f: AnyFieldApi) => (
                  <label className="mod-campo">
                    <span className="mod-etichetta">Regalato da</span>
                    <select name={f.name} value={f.state.value as string} onChange={e => f.handleChange(e.target.value)}>
                      <option value="">Non lo dico</option>
                      {nomi.regali.map(g => <option key={g.id} value={g.label}>{g.label}</option>)}
                    </select>
                    <span className="mod-hint">Si aggiunge e si cambia in «Regalato da».</span>
                  </label>
                )}
              </form.Field>
            )
          }
        </form.Subscribe>
      </fieldset>
      <fieldset className="mod-gruppo">
        <legend>Viaggio</legend>
        <form.Field name="from">
          {(f: AnyFieldApi) => {
            const p = nomi.partenze.find(d => chiaveNome(d.name) === chiaveNome(String(f.state.value ?? "")));
            return (
              <label className="mod-campo">
                <span className="mod-etichetta">Partito da</span>
                <select name={f.name} value={f.state.value as string} onChange={e => f.handleChange(e.target.value)}>
                  <option value="">Non ancora</option>
                  {nomi.partenze.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <span className="mod-hint">
                  {p?.stato === "mancante"
                    ? "Questa partenza non ha ancora un indirizzo: i km restano in attesa finché non lo imposti in «Partenze»."
                    : "I km li calcola il server dalla partenza e dalla venue."}
                </span>
              </label>
            );
          }}
        </form.Field>
      </fieldset>
      <form.Field name="comments">
        {(f: AnyFieldApi) => (
          <label className="mod-campo">
            <span className="mod-etichetta">Commento</span>
            <textarea name={f.name} rows={3} maxLength={2000} value={f.state.value as string} onChange={e => f.handleChange(e.target.value)} onBlur={f.handleBlur} />
            <span className="mod-hint">{commento ?? descrizione(C.comments)}</span>
            <ErroriCampo f={f} />
          </label>
        )}
      </form.Field>
    </>
  );
}

/** La venue del form (due campi, venue e città, scelti insieme). */
function CampoVenue({ form }: { form: AnyForm }) {
  return (
    <form.Subscribe selector={(s: { values: { venue: string; city: string } }) => [s.values.venue, s.values.city]}>
      {([venue, city]: [string, string]) => (
        <VenueScelta
          venue={venue}
          city={city}
          onScegli={(v, c) => {
            form.setFieldValue("venue", v);
            form.setFieldValue("city", c);
          }}
          errore={<form.Field name="venue">{(f: AnyFieldApi) => <ErroriCampo f={f} />}</form.Field>}
        />
      )}
    </form.Subscribe>
  );
}

function FormConcerto({ evento, onSalvato }: { evento?: Exclude<EventoUi, { concerts: unknown }>; onSalvato: (m: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const nomi = useNomi();
  const form = useForm({
    defaultValues: valoriConcerto(evento),
    validators: { onChange: ({ value }: { value: ValoriConcerto }) => erroriSchema(concertoInput, inputConcerto(value)) },
    onSubmit: async ({ value }) => {
      const r = await op.esegui(() =>
        evento
          ? convex.mutation(api.entries.update, { id: evento.id, patch: patchConcerto(value) })
          : convex.mutation(api.entries.add, inputConcerto(value)),
      );
      if (!r) return;
      onSalvato(evento ? "Concerto modificato." : "avviso" in r && r.avviso ? "Concerto aggiunto: i km arrivano quando la partenza ha un indirizzo." : "Concerto aggiunto.");
    },
  });
  return (
    <form id="mod-form-evento" className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="mod-griglia">
        <form.Field name="artist">{f => <CampoTesto f={f} etichetta="Artista" aiuto={descrizione(C.artist)} maxLength={120} autoFocus={!evento} />}</form.Field>
        <form.Field name="date">{f => <CampoTesto f={f} etichetta="Data" tipo="date" />}</form.Field>
      </div>
      <CampoVenue form={form as unknown as AnyForm} />
      <form.Field name="with">{f => <PersoneScelte f={f} persone={nomi.persone} />}</form.Field>
      <div className="mod-griglia mod-griglia-3">
        <form.Field name="voto">{f => <CampoScelta f={f} etichetta="Voto" opzioni={OPZ_VOTO} />}</form.Field>
        <form.Field name="vicinanza">{f => <CampoScelta f={f} etichetta="Posizione" opzioni={OPZ_VIC} />}</form.Field>
        <form.Field name="canzoniNote">{f => <CampoScelta f={f} etichetta="Canzoni note" opzioni={OPZ_CN} />}</form.Field>
      </div>
      <CampiEvento form={form as unknown as AnyForm} nomi={nomi} />
      <Errore errore={op.errore} />
    </form>
  );
}

function FormFestival({ evento, onSalvato }: { evento?: Extract<EventoUi, { concerts: unknown }>; onSalvato: (m: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const nomi = useNomi();
  const form = useForm({
    defaultValues: valoriFestival(evento),
    validators: { onChange: ({ value }: { value: ValoriFestival }) => erroriSchema(festivalInput, inputFestival(value)) },
    onSubmit: async ({ value }) => {
      const r = await op.esegui(() =>
        evento
          ? convex.mutation(api.entries.update, { id: evento.id, patch: patchFestival(value) })
          : convex.mutation(api.entries.add, inputFestival(value)),
      );
      if (!r) return;
      onSalvato(evento ? "Festival modificato." : "avviso" in r && r.avviso ? "Festival aggiunto: i km arrivano quando la partenza ha un indirizzo." : "Festival aggiunto.");
    },
  });
  return (
    <form id="mod-form-evento" className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="mod-griglia">
        <form.Field name="name">{f => <CampoTesto f={f} etichetta="Nome del festival" aiuto={descrizione(F.name)} maxLength={120} autoFocus={!evento} />}</form.Field>
        <form.Field name="date">{f => <CampoTesto f={f} etichetta="Data" placeholder="gg/mm/aaaa o 30–31/05/2026" aiuto="Più giorni: «30–31/05/2026»." />}</form.Field>
      </div>
      <CampoVenue form={form as unknown as AnyForm} />
      <fieldset className="mod-gruppo">
        <legend>Concerti del festival</legend>
        <p className="mod-hint">{descrizione(F.concerts)}. Voti e compagni sono di ogni concerto; biglietto, viaggio e commento del festival.</p>
        <form.Field name="concerts" mode="array">
          {f => (
            <ol className="mod-lineup">
              {f.state.value.map((_, i) => (
                <li key={i} className="mod-set">
                  <div className="mod-set-testa">
                    <span className="mod-set-n">{i + 1}</span>
                    <button type="button" className="mod-icona" aria-label="Sposta su" disabled={i === 0} onClick={() => f.moveValue(i, i - 1)}>↑</button>
                    <button type="button" className="mod-icona" aria-label="Sposta giù" disabled={i === f.state.value.length - 1} onClick={() => f.moveValue(i, i + 1)}>↓</button>
                    <button type="button" className="mod-icona" aria-label="Togli questo concerto" disabled={f.state.value.length <= 2} onClick={() => void f.removeValue(i)}>×</button>
                  </div>
                  <div className="mod-griglia">
                    <form.Field name={`concerts[${i}].artist`}>{s => <CampoTesto f={s} etichetta="Artista" maxLength={120} />}</form.Field>
                    <form.Field name={`concerts[${i}].date`}>{s => <CampoTesto f={s} etichetta="Giorno (se diverso)" tipo="date" />}</form.Field>
                  </div>
                  <form.Field name={`concerts[${i}].with`}>{s => <PersoneScelte f={s} persone={nomi.persone} />}</form.Field>
                  <div className="mod-griglia mod-griglia-3">
                    <form.Field name={`concerts[${i}].voto`}>{s => <CampoScelta f={s} etichetta="Voto" opzioni={OPZ_VOTO} />}</form.Field>
                    <form.Field name={`concerts[${i}].vicinanza`}>{s => <CampoScelta f={s} etichetta="Posizione" opzioni={OPZ_VIC} />}</form.Field>
                    <form.Field name={`concerts[${i}].canzoniNote`}>{s => <CampoScelta f={s} etichetta="Canzoni note" opzioni={OPZ_CN} />}</form.Field>
                  </div>
                </li>
              ))}
              <li>
                <button type="button" className="mod-btn" onClick={() => f.pushValue(nuovoSet())}>Aggiungi un concerto</button>
                <ErroriCampo f={f} />
              </li>
            </ol>
          )}
        </form.Field>
      </fieldset>
      <CampiEvento form={form as unknown as AnyForm} nomi={nomi} commento="Ricordo libero di tutta la serata (del festival, non di un set)" />
      <Errore errore={op.errore} />
    </form>
  );
}
