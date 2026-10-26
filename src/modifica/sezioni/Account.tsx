/* ──────────────────────────────────────────────────────────────
   #account (T5; PIANO §1.20, §1.31, §1.39, §5.9).

   - Profilo: handle (il vecchio resta come alias, con redirect 301),
     nome visualizzato e forma grammaticale (`profiles.update`).
   - Email della sessione e i vecchi handle (`account.dettagli`).
   - «Esci» (src/lib/auth-client.ts, corsia 3).
   - Esporta: un JSON con i concerti nel formato di import, persone,
     partenze col testo dell'indirizzo, "regalato da", wishlist, profilo e
     conversazioni (`account.esporta`, solo dashboard). Mai coordinate.
   - Elimina: si conferma riscrivendo l'handle; serve una sessione
     recente, altrimenti si rientra e si torna qui (`#account?elimina=1`,
     letto da useVista; chiudendo la finestra l'hash torna #account).

   Schede una sotto l'altra (spec ux-modifica §6.11). «La tua pagina» si
   salva dalla sua barra in fondo (SalvaBarra, attiva solo con modifiche);
   con modifiche non salvate lasciare /modifica chiede conferma, cambiare
   vista no. Un handle nuovo ricarica la pagina sul nuovo indirizzo: prima
   la guardia si toglie, o il browser chiederebbe se uscire.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { eliminaAccountInput } from "../../../shared/schema/dashboard.ts";
import { aggiornaProfiloInput } from "../../../shared/schema/profile.ts";
import { esci } from "../../lib/auth-client.ts";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { SalvaBarra, TestaImpostazione, useGuardiaImpostazioni } from "../ui/campi.tsx";
import { useScrittura } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { CampoTesto, Caricamento, CorniceSezione, Errore, Modale, erroreDi, frase, useConvex, useDati, useOperazione, type ErroreUi } from "./comuni.tsx";
import { erroriSchema } from "./forme.ts";

type Profilo = FunctionReturnType<typeof api.profiles.get>;
type Forma = "f" | "m" | "n";

const FORME: { valore: Forma; nome: string; esempio: string }[] = [
  { valore: "f", nome: "Femminile", esempio: "«Dove sono andata»" },
  { valore: "m", nome: "Maschile", esempio: "«Dove sono andato»" },
  { valore: "n", nome: "Neutra", esempio: "«Dove ho visto concerti»" },
];

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export function SezioneAccount({ handle }: SezioneProps) {
  const p = useDati(api.profiles.get);
  const d = useDati(api.account.dettagli);
  return (
    <CorniceSezione>
      <IntestazioneVista id="account" titolo="Account" descrizione="L'indirizzo e il nome della tua pagina, l'accesso, i tuoi dati." />
      {/* la notifica del salvataggio vive fuori dal form, che si rimonta appena arriva il profilo salvato */}
      <Caricamento q={p}>{profilo => <DatiPagina key={`${profilo.handle}|${profilo.displayName}|${profilo.forma}`} p={profilo} alias={d.data?.alias ?? []} />}</Caricamento>
      <section className="mod-gruppo mf-impostazione" aria-labelledby="account-accesso">
        <TestaImpostazione id="account-accesso" titolo="Accesso" />
        <p>
          {d.data?.email ? <>Sei entrato come <b>{d.data.email}</b>.</> : "Sei entrato."} L'email non compare mai sulla tua pagina.
        </p>
        <Esci />
      </section>
      <Esporta handle={handle} />
      <Elimina handle={handle} />
    </CorniceSezione>
  );
}

/** Il valore dopo `ms` senza cambi (per non interrogare a ogni tasto). */
function useCalmo<T>(valore: T, ms = 400): T {
  const [v, setV] = useState(valore);
  useEffect(() => {
    const t = setTimeout(() => setV(valore), ms);
    return () => clearTimeout(t);
  }, [valore, ms]);
  return v;
}

/** «disponibile» o il motivo per cui un handle nuovo non si può usare (profiles.handleAvailable). */
function DisponibilitaHandle({ handle, attuale }: { handle: string; attuale: string }) {
  const calmo = useCalmo(handle);
  const daChiedere = calmo !== attuale && HANDLE_RE.test(calmo);
  const q = useQuery({ ...convexQuery(api.profiles.handleAvailable, { handle: calmo }), enabled: daChiedere });
  if (!daChiedere || calmo !== handle || !q.data) return null;
  return q.data.disponibile ? (
    <span className="mod-hint mod-ok-testo">/{calmo} è libero.</span>
  ) : (
    <span className="mod-campo-errore">{frase(q.data.motivo ?? "non disponibile")}</span>
  );
}

function DatiPagina({ p, alias }: { p: Profilo; alias: string[] }) {
  const convex = useConvex();
  const op = useScrittura();
  const attuale = p.handle ?? "";
  const form = useForm({
    defaultValues: { handle: attuale, displayName: p.displayName ?? "", forma: (p.forma ?? "n") as Forma },
    validators: { onChange: ({ value }) => erroriSchema(aggiornaProfiloInput, value) },
    onSubmit: async ({ value }) => {
      const patch = {
        ...(value.handle !== attuale ? { handle: value.handle } : {}),
        ...(value.displayName.trim() !== (p.displayName ?? "") ? { displayName: value.displayName } : {}),
        ...(value.forma !== p.forma ? { forma: value.forma } : {}),
      };
      if (!Object.keys(patch).length) return;
      // l'handle cambia l'indirizzo di questa pagina: si ricarica su quello nuovo, senza notifica (e senza «Annulla»)
      const r = await op.esegui(() => convex.mutation(api.profiles.update, patch), patch.handle ? {} : { successo: "Salvato.", annullabile: true, tabelle: ["profiles"] });
      if (r && patch.handle) {
        lascia();
        window.location.assign(`/${patch.handle}/modifica#account`);
      }
    },
  });
  const sporco = useStore(form.store, s => !s.isDefaultValue);
  const [conferma, lascia] = useGuardiaImpostazioni(sporco, "Account");
  return (
    <>
      <form className="mod-form mod-gruppo mf-impostazione" aria-labelledby="account-pagina" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <TestaImpostazione id="account-pagina" titolo="La tua pagina" />
        <div className="mod-griglia">
          <form.Field name="handle">
            {f => (
              <CampoTesto
                f={f}
                etichetta="Indirizzo"
                autoComplete="off"
                maxLength={30}
                aiuto={
                  <>
                    {window.location.host}/<b>{f.state.value || "…"}</b> · minuscole, numeri e «-». Il vecchio indirizzo continua a portare qui.{" "}
                    <DisponibilitaHandle handle={f.state.value} attuale={attuale} />
                  </>
                }
              />
            )}
          </form.Field>
          <form.Field name="displayName">{f => <CampoTesto f={f} etichetta="Nome sulla pagina" maxLength={40} autoComplete="nickname" />}</form.Field>
        </div>
        {alias.length > 0 && <p className="mod-hint">Indirizzi di prima, che portano qui: {alias.map(a => `/${a}`).join(", ")}.</p>}
        <form.Field name="forma">
          {f => (
            <fieldset className="mod-campo mod-forme">
              <legend className="mod-etichetta">Come parla di te la pagina</legend>
              {FORME.map(x => (
                <label key={x.valore} className="mod-spunta">
                  <input type="radio" name="forma" value={x.valore} checked={f.state.value === x.valore} onChange={() => f.handleChange(x.valore)} />
                  {x.nome} <span className="mod-hint">{x.esempio}</span>
                </label>
              ))}
            </fieldset>
          )}
        </form.Field>
        <Errore errore={op.errore} />
        <SalvaBarra sporco={sporco} inCorso={op.inCorso} onAnnulla={() => form.reset()} />
      </form>
      {conferma}
    </>
  );
}

function Esci() {
  const op = useOperazione();
  return (
    <>
      <button type="button" className="mod-btn" disabled={op.inCorso} onClick={() => void op.esegui(() => esci())}>Esci</button>
      <Errore errore={op.errore} />
    </>
  );
}

function Esporta({ handle }: { handle: string }) {
  const convex = useConvex();
  const op = useOperazione();
  const scarica = async () => {
    const dati = await op.esegui(() => convex.query(api.account.esporta, {}));
    if (!dati) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(dati, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `concerti-${handle}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };
  return (
    <section className="mod-gruppo mf-impostazione" aria-labelledby="account-esporta">
      <TestaImpostazione id="account-esporta" titolo="Esporta i tuoi dati" />
      <p className="mod-hint">
        Un file JSON con tutto: i concerti (nel campo «concerti», nello stesso formato dell'import JSON), persone, partenze con il
        testo degli indirizzi, «regalato da», wishlist, stile e conversazioni con l'Oracolo e con il Tour manager. Contiene i tuoi indirizzi: tienilo al sicuro.
      </p>
      <button type="button" className="mod-btn" disabled={op.inCorso} onClick={() => void scarica()}>{op.inCorso ? "Preparo…" : "Scarica i miei dati"}</button>
      <Errore errore={op.errore} />
    </section>
  );
}

/** Si torna qui dopo il login "fresco" chiesto per eliminare (#account?elimina=1). */
const chiedeEliminazione = () => typeof window !== "undefined" && /^#account\?(.*&)?elimina=1\b/.test(window.location.hash);

function Elimina({ handle }: { handle: string }) {
  const [aperto, setAperto] = useState(false);
  // anche quando l'hash cambia a sezione già montata (la vista resta viva)
  const { parametri, vai } = useVista();
  const daHash = parametri.elimina === "1" || chiedeEliminazione();
  useEffect(() => {
    if (daHash) setAperto(true);
  }, [daHash]);
  const chiudi = () => {
    setAperto(false);
    // la finestra aperta dall'hash: chiusa, l'hash torna #account (un ricaricamento non la riapre)
    if (daHash) void vai("account", {}, { sostituisci: true });
  };
  return (
    <section className="mod-gruppo mf-impostazione mod-zona-pericolo" aria-labelledby="account-elimina">
      <TestaImpostazione id="account-elimina" titolo="Elimina l'account" />
      <p className="mod-hint">Cancella la tua pagina e tutti i suoi dati, per sempre. Le venue che hai aggiunto restano nel catalogo comune.</p>
      <button type="button" className="mod-btn mod-pericolo" onClick={() => setAperto(true)}>Elimina l'account…</button>
      {aperto && <EliminaModale handle={handle} onChiudi={chiudi} />}
    </section>
  );
}

function EliminaModale({ handle, onChiudi }: { handle: string; onChiudi: () => void }) {
  const convex = useConvex();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<ErroreUi | null>(null);
  const form = useForm({
    defaultValues: { conferma: "" },
    validators: {
      onChange: ({ value }) =>
        erroriSchema(eliminaAccountInput, value) ?? (value.conferma !== handle ? { fields: { conferma: "scrivi esattamente l'handle della tua pagina" } } : undefined),
    },
    onSubmit: async ({ value }) => {
      setInCorso(true);
      setErrore(null);
      try {
        await convex.mutation(api.account.elimina, { conferma: value.conferma });
        window.location.assign("/");
      } catch (e) {
        setErrore(erroreDi(e));
        setInCorso(false);
      }
    },
  });
  const rientra = errore?.sessioneRecente === false && errore.fix;
  return (
    <Modale titolo="Eliminare l'account?" onChiudi={onChiudi} piedi={
      <>
        <button type="button" className="mod-btn" onClick={onChiudi}>Annulla</button>
        {rientra ? (
          <a className="mod-btn mod-primario" href={errore.fix}>Entra di nuovo</a>
        ) : (
          <button type="submit" form="mod-form-elimina" className="mod-btn mod-pericolo" disabled={inCorso}>{inCorso ? "Elimino…" : "Elimina per sempre"}</button>
        )}
      </>
    }>
      <form id="mod-form-elimina" className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <p>
          Spariscono la pagina <b>/{handle}</b>, i concerti, le persone, le partenze con i loro indirizzi, i «regalato da» con i loghi, la
          wishlist, il registro e le conversazioni con l'Oracolo e con il Tour manager. Non si può annullare: se vuoi una copia, prima esporta i tuoi dati.
        </p>
        <form.Field name="conferma">
          {f => <CampoTesto f={f} etichetta="Conferma" aiuto={<>Scrivi <b>{handle}</b>, l'handle della tua pagina.</>} autoComplete="off" maxLength={30} />}
        </form.Field>
        {rientra ? (
          <p className="mod-attenzione" role="alert">{frase(errore.messaggio)} Dopo l'accesso torni qui.</p>
        ) : (
          <Errore errore={errore} />
        )}
      </form>
    </Modale>
  );
}
