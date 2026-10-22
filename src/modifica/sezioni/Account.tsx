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
     recente, altrimenti si rientra e si torna qui (`#account?elimina=1`).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useState, type ReactNode } from "react";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { eliminaAccountInput } from "../../../shared/schema/dashboard.ts";
import { aggiornaProfiloInput } from "../../../shared/schema/profile.ts";
import { esci } from "../../lib/auth-client.ts";
import type { SezioneProps } from "../tipi.ts";
import { CampoTesto, Caricamento, CorniceSezione, Errore, Modale, erroreDi, frase, useAvviso, useConvex, useDati, useOperazione, type ErroreUi } from "./comuni.tsx";
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
  // qui e non nel form, che si rimonta appena arriva il profilo salvato
  const [avviso, setAvviso] = useAvviso();
  return (
    <CorniceSezione>
      <Caricamento q={p}>{profilo => <DatiPagina key={`${profilo.handle}|${profilo.displayName}|${profilo.forma}`} p={profilo} alias={d.data?.alias ?? []} avviso={avviso} onSalvato={setAvviso} />}</Caricamento>
      <div className="mod-gruppo">
        <h3>Accesso</h3>
        <p>
          {d.data?.email ? <>Sei entrato come <b>{d.data.email}</b>.</> : "Sei entrato."} L'email non compare mai sulla tua pagina.
        </p>
        <Esci />
      </div>
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

function DatiPagina({ p, alias, avviso, onSalvato }: { p: Profilo; alias: string[]; avviso: ReactNode; onSalvato: (m: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
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
      if (!(await op.esegui(() => convex.mutation(api.profiles.update, patch)))) return;
      // l'indirizzo di questa pagina è cambiato: si ricarica su quello nuovo
      if (patch.handle) window.location.assign(`/${patch.handle}/modifica#account`);
      else onSalvato("Salvato.");
    },
  });
  return (
    <form className="mod-form mod-gruppo" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <h3>La tua pagina</h3>
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
      <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Salva</button>
      {avviso}
      <Errore errore={op.errore} />
    </form>
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
    <div className="mod-gruppo">
      <h3>Esporta i tuoi dati</h3>
      <p className="mod-hint">
        Un file JSON con tutto: i concerti (nel campo «concerti», nello stesso formato dell'import JSON), persone, partenze con il
        testo degli indirizzi, «regalato da», wishlist, stile e conversazioni con l'Oracolo. Contiene i tuoi indirizzi: tienilo al sicuro.
      </p>
      <button type="button" className="mod-btn" disabled={op.inCorso} onClick={() => void scarica()}>{op.inCorso ? "Preparo…" : "Scarica i miei dati"}</button>
      <Errore errore={op.errore} />
    </div>
  );
}

/** Si torna qui dopo il login "fresco" chiesto per eliminare (#account?elimina=1). */
const chiedeEliminazione = () => typeof window !== "undefined" && /^#account\?(.*&)?elimina=1\b/.test(window.location.hash);

function Elimina({ handle }: { handle: string }) {
  const [aperto, setAperto] = useState(false);
  useEffect(() => {
    if (chiedeEliminazione()) setAperto(true);
  }, []);
  return (
    <div className="mod-gruppo mod-zona-pericolo">
      <h3>Elimina l'account</h3>
      <p className="mod-hint">Cancella la tua pagina e tutti i suoi dati, per sempre. Le venue che hai aggiunto restano nel catalogo comune.</p>
      <button type="button" className="mod-btn mod-pericolo" onClick={() => setAperto(true)}>Elimina l'account…</button>
      {aperto && <EliminaModale handle={handle} onChiudi={() => setAperto(false)} />}
    </div>
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
          wishlist, il registro e le conversazioni con l'Oracolo. Non si può annullare: se vuoi una copia, prima esporta i tuoi dati.
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
