/* ──────────────────────────────────────────────────────────────
   #stile (T5; SPEC "Stile", PIANO §1.34, §1.35, §1.40): come appare la
   pagina pubblica. Niente CSS libero: solo un preset e quattro token
   (accento, font dei titoli, raggi, densità), con l'anteprima in scuro e
   in chiaro e il contrasto dell'accento; poi il layout de "I dati"
   (ordine, sezioni nascoste, titoli) e, solo per gabrifila, il credito e
   il link del piè di pagina.

   "Tema da descrizione": la server function di Start
   (src/modifica/temaDaDescrizione.ts) consuma i limiti, chiede i token a
   Gemini e li valida; qui si vede l'anteprima e solo dopo si salva con
   profiles.setTheme, come ogni altro cambio di tema.
   ────────────────────────────────────────────────────────────── */

import { useState, type CSSProperties, type ReactNode } from "react";
import { useForm } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { descrizioneTemaInput } from "../../../shared/schema/dashboard.ts";
import { extra as extraSchema, tema as temaSchema } from "../../../shared/schema/profile.ts";
import { SECTIONS } from "../../../shared/sections.ts";
import { temaDaDescrizione } from "../temaDaDescrizione.ts";
import type { SezioneProps } from "../tipi.ts";
import { CampoTesto, Caricamento, CorniceSezione, Errore, ErroriCampo, useAvviso, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { erroriSchema, layoutDa, righeLayout, type RigaLayout } from "./forme.ts";
import {
  CONTRASTO_MINIMO, DENSITA, DENSITA_CSS, DENSITA_LABELS, FONT_CSS, FONT_LABELS, FONT_TITOLI, PRESET, PRESET_IDS, RAGGI, RAGGI_CSS,
  RAGGI_LABELS, SUPERFICI, accentoChiaro, contrastoMinimo, problemaAccento, risolviTema, type TemaSalvato, type TokenTema,
} from "./stileToken.ts";

type Profilo = FunctionReturnType<typeof api.profiles.get>;

/** Il colore della lampada di sempre, quando il preset non ha un accento. */
const LAMPADA = "#d9a441";

/** Il tema da salvare: il preset più i soli token scelti (vuoti = quelli del preset). */
const temaPulito = (t: TemaSalvato): TemaSalvato =>
  Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined && v !== "")) as unknown as TemaSalvato;

/** Il messaggio di un problema dell'accento, senza il prefisso per gli agenti. */
const testoProblema = (m: string) => m.replace(/^accent: /, "");

/** Un avviso che sopravvive al rimontaggio del form (la chiave cambia appena il salvataggio arriva). */
type Avviso = { avviso: ReactNode; onSalvato: (m: string) => void };

/** Credito e link del piè di pagina: solo la pagina di gabrifila li ha (DECISIONI, risposta 1; il server lo controlla). */
const HA_PIEDE = "gabrifila";

export function SezioneStile({ handle }: SezioneProps) {
  const q = useDati(api.profiles.get);
  const [avvisoTema, setAvvisoTema] = useAvviso();
  const [avvisoLayout, setAvvisoLayout] = useAvviso();
  const [avvisoPiede, setAvvisoPiede] = useAvviso();
  return (
    <CorniceSezione>
      <Caricamento q={q}>
        {p => (
          <>
            {/* la chiave rimette i campi a posto quando il tema cambia da fuori (tema da descrizione, un agente, Annulla) */}
            <Tema key={JSON.stringify(p.theme)} tema={p.theme} avviso={avvisoTema} onSalvato={setAvvisoTema} />
            <TemaDaDescrizione tema={p.theme} />
            <Layout key={JSON.stringify(p.layout)} layout={p.layout} avviso={avvisoLayout} onSalvato={setAvvisoLayout} />
            {(handle === HA_PIEDE || p.extra?.creditoFooter || p.extra?.linkTappi) && (
              <PieDiPagina key={JSON.stringify(p.extra)} extra={p.extra} avviso={avvisoPiede} onSalvato={setAvvisoPiede} />
            )}
          </>
        )}
      </Caricamento>
    </CorniceSezione>
  );
}

/* ── anteprima ────────────────────────────────────────────────── */

/** Un pannello finto in scuro e uno in chiaro, con i token dati. */
export function Anteprima({ t }: { t: TokenTema }) {
  const stile = (chiaro: boolean): CSSProperties => ({
    "--ant-lamp": t.accent ? (chiaro ? accentoChiaro(t.accent) : t.accent) : undefined,
    "--ant-font": FONT_CSS[t.fontTitoli],
    "--ant-r": RAGGI_CSS[t.raggi],
    "--ant-pad": DENSITA_CSS[t.densita],
  });
  return (
    <div className="mod-anteprima" aria-label="Anteprima">
      {(["scuro", "chiaro"] as const).map(modo => (
        <div key={modo} className="mod-anteprima-pannello" data-tema={modo} style={stile(modo === "chiaro")}>
          <span className="mod-anteprima-modo">{modo === "scuro" ? "Scuro" : "Chiaro"}</span>
          <span className="mod-anteprima-titolo">Chi ho visto di più</span>
          <span className="mod-anteprima-num">80</span>
          <span className="mod-anteprima-chip">concerti visti</span>
        </div>
      ))}
    </div>
  );
}

/** Il contrasto dell'accento sulle superfici dei due temi. */
function Contrasto({ accent }: { accent?: string }) {
  if (!accent) return <p className="mod-hint">Accento: la lampada ambra di sempre.</p>;
  if (!/^#[0-9a-fA-F]{6}$/.test(accent)) return null;
  const problema = problemaAccento(accent);
  const fmt = (n: number) => n.toFixed(1).replace(".", ",");
  return (
    <p className={problema ? "mod-campo-errore" : "mod-hint"}>
      Contrasto dell'accento: {fmt(contrastoMinimo(accent, SUPERFICI.scuro))}:1 sul tema scuro,{" "}
      {fmt(contrastoMinimo(accentoChiaro(accent), SUPERFICI.chiaro))}:1 sul chiaro (minimo {CONTRASTO_MINIMO}:1).
    </p>
  );
}

/* ── preset e token ───────────────────────────────────────────── */

function Tema({ tema, avviso, onSalvato }: { tema: TemaSalvato } & Avviso) {
  const convex = useConvex();
  const op = useOperazione();
  const form = useForm({
    defaultValues: { preset: tema.preset, accent: tema.accent, fontTitoli: tema.fontTitoli, raggi: tema.raggi, densita: tema.densita } as TemaSalvato,
    validators: {
      onChange: ({ value }: { value: TemaSalvato }) => {
        const p = value.accent ? problemaAccento(value.accent) : null;
        return erroriSchema(temaSchema, temaPulito(value)) ?? (p ? { fields: { accent: testoProblema(p.messaggio) } } : undefined);
      },
    },
    onSubmit: async ({ value }) => {
      if (await op.esegui(() => convex.mutation(api.profiles.setTheme, { theme: temaPulito(value) as never }))) onSalvato("Stile salvato: la tua pagina è già aggiornata.");
    },
  });
  return (
    <form className="mod-form mod-gruppo" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <h3>Tema</h3>
      <form.Field name="preset">
        {f => (
          <div className="mod-preset" role="radiogroup" aria-label="Preset">
            {PRESET_IDS.map(id => (
              <label key={id} className={`mod-preset-scelta${f.state.value === id ? " on" : ""}`}>
                <input
                  type="radio"
                  name="preset"
                  value={id}
                  checked={f.state.value === id}
                  onChange={() => {
                    // un preset nuovo riparte dai suoi token
                    f.handleChange(id);
                    for (const k of ["accent", "fontTitoli", "raggi", "densita"] as const) form.setFieldValue(k, undefined);
                  }}
                />
                <b>{PRESET[id].nome}</b>
                <span>{PRESET[id].descrizione}</span>
              </label>
            ))}
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={s => s.values}>
        {valori => {
          const t = risolviTema(valori);
          return (
            <>
              <div className="mod-griglia mod-griglia-4">
                <form.Field name="accent">
                  {f => (
                    <div className="mod-campo">
                      <label className="mod-etichetta" htmlFor="mod-accento">Accento</label>
                      <div className="mod-riga">
                        <input id="mod-accento" type="color" value={t.accent ?? LAMPADA} onChange={e => f.handleChange(e.target.value)} />
                        <input
                          aria-label="Accento esadecimale"
                          className="mod-hex"
                          value={f.state.value ?? ""}
                          placeholder={t.accent ?? LAMPADA}
                          maxLength={7}
                          onChange={e => f.handleChange(e.target.value || undefined)}
                        />
                      </div>
                      <ErroriCampo f={f} />
                    </div>
                  )}
                </form.Field>
                <form.Field name="fontTitoli">
                  {f => (
                    <label className="mod-campo">
                      <span className="mod-etichetta">Font dei titoli</span>
                      <select value={t.fontTitoli} onChange={e => f.handleChange(e.target.value)} style={{ fontFamily: FONT_CSS[t.fontTitoli] }}>
                        {FONT_TITOLI.map(x => <option key={x} value={x} style={{ fontFamily: FONT_CSS[x] }}>{FONT_LABELS[x]}</option>)}
                      </select>
                    </label>
                  )}
                </form.Field>
                <form.Field name="raggi">
                  {f => (
                    <label className="mod-campo">
                      <span className="mod-etichetta">Angoli</span>
                      <select value={t.raggi} onChange={e => f.handleChange(e.target.value)}>
                        {RAGGI.map(x => <option key={x} value={x}>{RAGGI_LABELS[x]}</option>)}
                      </select>
                    </label>
                  )}
                </form.Field>
                <form.Field name="densita">
                  {f => (
                    <label className="mod-campo">
                      <span className="mod-etichetta">Densità</span>
                      <select value={t.densita} onChange={e => f.handleChange(e.target.value)}>
                        {DENSITA.map(x => <option key={x} value={x}>{DENSITA_LABELS[x]}</option>)}
                      </select>
                    </label>
                  )}
                </form.Field>
              </div>
              <Contrasto accent={t.accent} />
              <Anteprima t={t} />
            </>
          );
        }}
      </form.Subscribe>
      <div className="mod-barra">
        <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Salva lo stile</button>
        <button type="button" className="mod-btn" onClick={() => form.reset()}>Annulla le modifiche</button>
      </div>
      {avviso}
      <Errore errore={op.errore} />
    </form>
  );
}

/* ── tema da descrizione ──────────────────────────────────────── */

function TemaDaDescrizione({ tema }: { tema: TemaSalvato }) {
  const convex = useConvex();
  const genera = useOperazione();
  const salva = useOperazione();
  const [avviso, setAvviso] = useAvviso();
  const [proposta, setProposta] = useState<Pick<TokenTema, "fontTitoli"> & { accent: string } | null>(null);
  const form = useForm({
    defaultValues: { descrizione: "" },
    validators: { onChange: ({ value }) => erroriSchema(descrizioneTemaInput, value) },
    onSubmit: async ({ value }) => {
      setProposta(null);
      const r = await genera.esegui(() => temaDaDescrizione({ data: { descrizione: value.descrizione } }));
      if (!r) return;
      if (r.ok) setProposta(r.tema);
      else genera.setErrore({ code: r.code, messaggio: r.messaggio });
    },
  });
  const applica = async () => {
    if (!proposta) return;
    const nuovo = temaPulito({ ...tema, accent: proposta.accent, fontTitoli: proposta.fontTitoli });
    if (await salva.esegui(() => convex.mutation(api.profiles.setTheme, { theme: nuovo as never }))) {
      setProposta(null);
      setAvviso("Tema salvato: la tua pagina è già aggiornata.");
    }
  };
  return (
    <section className="mod-gruppo" aria-label="Tema da descrizione">
      <h3>Tema da descrizione</h3>
      <form className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <form.Field name="descrizione">
          {f => (
            <label className="mod-campo">
              <span className="mod-etichetta">Com'è il tema che vuoi, a parole</span>
              <textarea
                name={f.name}
                rows={2}
                maxLength={300}
                placeholder="notte d'estate al mare"
                value={f.state.value}
                onChange={e => f.handleChange(e.target.value)}
                onBlur={f.handleBlur}
              />
              <span className="mod-hint">Propone un accento e un font per i titoli: li vedi in anteprima e decidi tu se salvarli. Dieci al giorno.</span>
              <ErroriCampo f={f} />
            </label>
          )}
        </form.Field>
        <button type="submit" className="mod-btn" disabled={genera.inCorso}>{genera.inCorso ? "Genero…" : "Genera"}</button>
      </form>
      <Errore errore={genera.errore} />
      {proposta && (
        <div className="mod-proposta">
          <p className="mod-hint">
            Proposta: accento <code>{proposta.accent}</code>, titoli in {FONT_LABELS[proposta.fontTitoli]}.
          </p>
          <Anteprima t={risolviTema({ ...tema, ...proposta })} />
          <div className="mod-barra">
            <button type="button" className="mod-btn mod-primario" disabled={salva.inCorso} onClick={() => void applica()}>Applica e salva</button>
            <button type="button" className="mod-btn" onClick={() => setProposta(null)}>Scarta</button>
          </div>
          <Errore errore={salva.errore} />
        </div>
      )}
      {avviso}
    </section>
  );
}

/* ── layout de "I dati" ───────────────────────────────────────── */

function Layout({ layout, avviso, onSalvato }: { layout: Profilo["layout"] } & Avviso) {
  const convex = useConvex();
  const op = useOperazione();
  const [righe, setRighe] = useState<RigaLayout[]>(() => righeLayout(layout));
  const cambia = (i: number, r: Partial<RigaLayout>) => setRighe(rs => rs.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const sposta = (i: number, j: number) =>
    setRighe(rs => {
      const l = [...rs];
      [l[i], l[j]] = [l[j], l[i]];
      return l;
    });
  const salva = async (daSalvare: RigaLayout[]) => {
    if (await op.esegui(() => convex.mutation(api.profiles.setTheme, { layout: layoutDa(daSalvare) }))) onSalvato("Layout salvato.");
  };
  const etichetta = (id: string) => SECTIONS.find(s => s.id === id)?.label ?? id;
  return (
    <section className="mod-gruppo" aria-label="Sezioni de I dati">
      <h3>Sezioni de «I dati»</h3>
      <p className="mod-hint">Ordine, sezioni nascoste e titoli. «Sul palco» resta com'è; l'indice mostra solo le sezioni visibili.</p>
      <ol className="mod-lista mod-lista-semplice mod-layout">
        {righe.map((r, i) => (
          <li key={r.id}>
            <span className="mod-evento-azioni">
              <button type="button" className="mod-icona" aria-label={`Sposta su ${etichetta(r.id)}`} disabled={i === 0} onClick={() => sposta(i, i - 1)}>↑</button>
              <button type="button" className="mod-icona" aria-label={`Sposta giù ${etichetta(r.id)}`} disabled={i === righe.length - 1} onClick={() => sposta(i, i + 1)}>↓</button>
            </span>
            <label className="mod-spunta">
              <input type="checkbox" checked={r.visibile} onChange={e => cambia(i, { visibile: e.target.checked })} aria-label={`Mostra ${etichetta(r.id)}`} />
              <span className={r.visibile ? undefined : "mod-nascosta"}>{etichetta(r.id)}</span>
            </label>
            <input
              className="mod-titolo-sezione"
              aria-label={`Titolo di ${etichetta(r.id)}`}
              placeholder={etichetta(r.id)}
              maxLength={60}
              value={r.titolo}
              onChange={e => cambia(i, { titolo: e.target.value })}
            />
          </li>
        ))}
      </ol>
      <div className="mod-barra">
        <button type="button" className="mod-btn mod-primario" disabled={op.inCorso} onClick={() => void salva(righe)}>Salva il layout</button>
        <button
          type="button"
          className="mod-btn"
          disabled={op.inCorso}
          onClick={() => {
            const base = righeLayout({ ordine: [], nascoste: [], titoli: {} });
            setRighe(base);
            void salva(base);
          }}
        >
          Torna all'ordine di base
        </button>
      </div>
      {avviso}
      <Errore errore={op.errore} />
    </section>
  );
}

/* ── piè di pagina (§1.34) ────────────────────────────────────── */

function PieDiPagina({ extra, avviso, onSalvato }: { extra: Profilo["extra"] } & Avviso) {
  const convex = useConvex();
  const op = useOperazione();
  const form = useForm({
    defaultValues: { creditoFooter: extra?.creditoFooter ?? "", linkTappi: extra?.linkTappi ?? "" },
    validators: {
      onChange: ({ value }) => erroriSchema(extraSchema, { creditoFooter: value.creditoFooter.trim() || undefined, linkTappi: value.linkTappi.trim() || undefined }),
    },
    onSubmit: async ({ value }) => {
      const r = await op.esegui(() =>
        convex.mutation(api.style.setExtra, { creditoFooter: value.creditoFooter.trim() || null, linkTappi: value.linkTappi.trim() || null }),
      );
      if (r) onSalvato("Piè di pagina salvato.");
    },
  });
  return (
    <form className="mod-form mod-gruppo" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <h3>Piè di pagina</h3>
      <div className="mod-griglia">
        <form.Field name="creditoFooter">{f => <CampoTesto f={f} etichetta="Ringraziamento" maxLength={200} />}</form.Field>
        <form.Field name="linkTappi">{f => <CampoTesto f={f} etichetta="Link" tipo="url" placeholder="https://" aiuto="Solo indirizzi https." maxLength={500} />}</form.Field>
      </div>
      <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Salva</button>
      {avviso}
      <Errore errore={op.errore} />
    </form>
  );
}
