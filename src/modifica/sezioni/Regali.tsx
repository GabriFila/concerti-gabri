/* ──────────────────────────────────────────────────────────────
   #regali (T5): chi ti regala i biglietti ("regalato da"). Nome, sito
   (https) e logo facoltativi; se è una persona vale la regola dei
   soprannomi (§1.42).

   Logo dal browser: `generateLogoUploadUrl` → POST del file → `setLogo`
   (una action), che accetta png, jpeg o webp fino a 256 KB, col tipo
   dichiarato uguale a quello dei primi byte, e cancella i file rifiutati e
   il logo di prima (il controllo vero è sul server; qui si avvisa prima di
   caricare). Un file rifiutato torna come `{ok: false, messaggio}`, non
   come errore. Venti loghi al giorno (`logoUpload`). Un cambio di logo
   non si annulla: il file di prima non c'è più.
   ────────────────────────────────────────────────────────────── */

import { useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { LOGO_MAX_BYTES, LOGO_TIPI } from "../../../shared/schema/dashboard.ts";
import { aggiungiRegaloInput } from "../../../shared/schema/gifter.ts";
import { soloHttps } from "../../../shared/lib/url.ts";
import { convexUrl } from "../../lib/convexUrl.ts";
import type { SezioneProps } from "../tipi.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, Modale, Soprannomi, useAvviso, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { erroriSchema } from "./forme.ts";

type Regalo = FunctionReturnType<typeof api.gifters.dettagli>["gifters"][number];
type Azione = { tipo: "modifica" | "cancella" | "togliLogo"; g: Regalo } | null;
type Valori = { label: string; url: string };

const inputRegalo = (v: Valori) => ({ label: v.label, ...(v.url.trim() ? { url: v.url.trim() } : {}) });

const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

/**
 * Il logo nella dashboard: https. L'unica eccezione è http per i file del
 * Convex locale (sviluppo ed e2e), e solo se anche questo build punta a un
 * Convex locale: in produzione VITE_CONVEX_URL è https e non vale mai.
 */
function srcLogo(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (soloHttps(url)) return url;
  try {
    const u = new URL(url);
    const locale = new URL(convexUrl());
    return u.protocol === "http:" && locale.protocol === "http:" && LOOPBACK.has(locale.hostname) && u.hostname === locale.hostname ? url : undefined;
  } catch {
    return undefined;
  }
}

export function SezioneRegali(_props: SezioneProps) {
  const q = useDati(api.gifters.dettagli);
  const [azione, setAzione] = useState<Azione>(null);
  const [avviso, setAvviso] = useAvviso();
  const chiudi = (m?: string) => {
    setAzione(null);
    if (m) setAvviso(m);
  };
  return (
    <CorniceSezione>
      <p className="mod-hint">Chi ti regala i biglietti: un amico, un'azienda, una radio. Il logo compare accanto ai concerti regalati.</p>
      <NuovoRegalo />
      {avviso}
      <Caricamento q={q}>
        {({ gifters }) =>
          gifters.length === 0 ? (
            <p className="mod-vuoto">Nessuno, per ora.</p>
          ) : (
            <ul className="mod-lista mod-lista-semplice" aria-label="Regalato da">
              {gifters.map(g => <RigaRegalo key={g.id} g={g} onAzione={tipo => setAzione({ tipo, g })} onAvviso={setAvviso} />)}
            </ul>
          )
        }
      </Caricamento>
      {azione?.tipo === "modifica" && <Modifica g={azione.g} onChiudi={chiudi} />}
      {azione?.tipo === "cancella" && <Cancella g={azione.g} onChiudi={chiudi} />}
      {azione?.tipo === "togliLogo" && <TogliLogo g={azione.g} onChiudi={chiudi} />}
    </CorniceSezione>
  );
}

function Logo({ g }: { g: Regalo }) {
  const src = srcLogo(g.logoUrl);
  const [rotto, setRotto] = useState(false);
  if (!src || rotto) return <span className="mod-logo mod-logo-vuoto" aria-hidden="true" />;
  return <img className="mod-logo" src={src} alt={`Logo di ${g.label}`} width={32} height={32} referrerPolicy="no-referrer" onError={() => setRotto(true)} />;
}

function CampiRegalo({ form }: { form: ReturnType<typeof useFormRegalo> }) {
  return (
    <>
      <form.Field name="label">{f => <CampoTesto f={f} etichetta="Nome" aiuto={<Soprannomi />} maxLength={60} autoComplete="off" />}</form.Field>
      <form.Field name="url">{f => <CampoTesto f={f} etichetta="Sito (facoltativo)" tipo="url" placeholder="https://" aiuto="Solo indirizzi https." maxLength={500} />}</form.Field>
    </>
  );
}

function useFormRegalo(iniziali: Valori, salva: (v: Valori) => Promise<boolean>) {
  return useForm({
    defaultValues: iniziali,
    validators: { onChange: ({ value }: { value: Valori }) => erroriSchema(aggiungiRegaloInput, inputRegalo(value)) },
    onSubmit: async ({ value, formApi }) => {
      if (await salva(value)) formApi.reset();
    },
  });
}

function NuovoRegalo() {
  const convex = useConvex();
  const op = useOperazione();
  const form = useFormRegalo({ label: "", url: "" }, async v => !!(await op.esegui(() => convex.mutation(api.gifters.add, inputRegalo(v)))));
  return (
    <form className="mod-form mod-gruppo" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="mod-griglia">
        <CampiRegalo form={form} />
      </div>
      <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>
      <Errore errore={op.errore} />
    </form>
  );
}

function Modifica({ g, onChiudi }: { g: Regalo; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  const form = useFormRegalo({ label: g.label, url: g.url ?? "" }, async v => {
    const r = await op.esegui(() => convex.mutation(api.gifters.update, { id: g.id, label: v.label, url: v.url.trim() || null }));
    if (r) onChiudi("Modificato.");
    return !!r;
  });
  return (
    <Modale titolo={`Modifica ${g.label}`} onChiudi={() => onChiudi()} piedi={
      <>
        <button type="button" className="mod-btn" onClick={() => onChiudi()}>Annulla</button>
        <button type="submit" form="mod-form-regalo" className="mod-btn mod-primario" disabled={op.inCorso}>Salva</button>
      </>
    }>
      <form id="mod-form-regalo" className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <CampiRegalo form={form} />
        <Errore errore={op.errore} />
      </form>
    </Modale>
  );
}

function RigaRegalo({ g, onAzione, onAvviso }: { g: Regalo; onAzione: (tipo: NonNullable<Azione>["tipo"]) => void; onAvviso: (m: string) => void }) {
  const logo = useOperazione();
  const carica = useCaricaLogo(g, logo, onAvviso);
  const file = useRef<HTMLInputElement>(null);
  return (
    <li className="mod-regalo">
      <Logo g={g} />
      <span className="mod-nome">
        {g.label}
        {soloHttps(g.url) && <a className="mod-link-sito" href={soloHttps(g.url)} target="_blank" rel="noreferrer">{new URL(g.url!).hostname}</a>}
      </span>
      <span className="mod-conta">{g.concerti === 1 ? "1 concerto" : `${g.concerti} concerti`}</span>
      <span className="mod-evento-azioni">
        <button type="button" className="mod-btn" disabled={logo.inCorso} aria-label={`Carica il logo di ${g.label}`} onClick={() => file.current?.click()}>
          {logo.inCorso ? "Carico…" : g.logoUrl ? "Cambia logo" : "Carica logo"}
        </button>
        <input
          ref={file}
          type="file"
          accept={LOGO_TIPI.join(",")}
          hidden
          aria-label={`File del logo di ${g.label}`}
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void carica(f);
          }}
        />
        {g.logoUrl && <button type="button" className="mod-btn" aria-label={`Togli il logo di ${g.label}`} onClick={() => onAzione("togliLogo")}>Togli logo</button>}
        <button type="button" className="mod-btn" aria-label={`Modifica ${g.label}`} onClick={() => onAzione("modifica")}>Modifica</button>
        <button type="button" className="mod-btn mod-pericolo-lieve" aria-label={`Cancella ${g.label}`} onClick={() => onAzione("cancella")}>Cancella</button>
      </span>
      <Errore errore={logo.errore} />
    </li>
  );
}

/** Carica un logo dal browser: prima il controllo veloce, poi upload e `setLogo` (che può rifiutare il file). */
function useCaricaLogo(g: Regalo, op: ReturnType<typeof useOperazione>, onFatto: (m: string) => void) {
  const convex = useConvex();
  return async (f: File) => {
    if (!(LOGO_TIPI as readonly string[]).includes(f.type) || f.size > LOGO_MAX_BYTES) {
      op.setErrore({ code: "input_non_valido", messaggio: "il logo deve essere un'immagine png, jpeg o webp fino a 256 KB" });
      return;
    }
    const esito = await op.esegui(async () => {
      const { url } = await convex.mutation(api.gifters.generateLogoUploadUrl, { id: g.id });
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": f.type }, body: f });
      if (!res.ok) throw new Error("upload");
      const { storageId } = (await res.json()) as { storageId: string };
      return await convex.action(api.gifters.setLogo, { id: g.id, storageId });
    });
    if (!esito) return;
    if (esito.ok) onFatto(`Logo di ${g.label} aggiornato.`);
    else op.setErrore({ code: esito.code, messaggio: esito.messaggio });
  };
}

function TogliLogo({ g, onChiudi }: { g: Regalo; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  return (
    <Conferma
      titolo={`Togliere il logo di ${g.label}?`}
      etichetta="Togli il logo"
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        if (await op.esegui(() => convex.action(api.gifters.setLogo, { id: g.id, storageId: null }))) onChiudi("Logo tolto.");
      }}
    >
      <p>{g.logoCaricato ? "Il file caricato si cancella e non si può recuperare da «Attività»: per rimetterlo andrà caricato di nuovo." : "Il logo sparisce dalla tua pagina."}</p>
    </Conferma>
  );
}

function Cancella({ g, onChiudi }: { g: Regalo; onChiudi: (m?: string) => void }) {
  const convex = useConvex();
  const op = useOperazione();
  return (
    <Conferma
      titolo={`Cancellare ${g.label}?`}
      bloccato={g.concerti > 0}
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        if (await op.esegui(() => convex.mutation(api.gifters.remove, { id: g.id, confirm: true }))) onChiudi("Cancellato. Puoi ripristinarlo da «Attività» (senza il logo caricato).");
      }}
    >
      {g.concerti > 0 ? (
        <p><b>{g.label}</b> è nel biglietto di {g.concerti === 1 ? "un concerto" : `${g.concerti} concerti`}: toglilo lì prima di cancellarlo.</p>
      ) : (
        <p><b>{g.label}</b> sparisce{g.logoCaricato ? ", con il logo caricato" : ""}.</p>
      )}
    </Conferma>
  );
}
