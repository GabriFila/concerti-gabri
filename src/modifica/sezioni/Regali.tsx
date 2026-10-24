/* ──────────────────────────────────────────────────────────────
   #regali (T5, spec ux-modifica §6.7): chi ti regala i biglietti
   ("regalato da"). Nome, sito (https) e logo facoltativi; se è una
   persona vale la regola dei soprannomi (§1.42).

   - In cima l'aggiunta rapida; la sua notifica offre «Carica il logo», che
     apre il pannello del nuovo arrivato.
   - Le schede hanno «Modifica» e «Cancella» sempre in vista (sono pochi).
     «Modifica» apre il pannello (`?apri=<gifterId>`): nome, sito, il logo
     (caricarlo, cambiarlo, toglierlo) e in quanti concerti è usato.
   - Logo dal browser: `generateLogoUploadUrl` → POST del file → `setLogo`
     (una action), che accetta png, jpeg o webp fino a 256 KB, col tipo
     dichiarato uguale a quello dei primi byte, e cancella i file rifiutati
     e il logo di prima (il controllo vero è sul server; qui si avvisa prima
     di caricare). Un file rifiutato torna come `{ok: false, messaggio}`,
     non come errore. Venti loghi al giorno (`logoUpload`). Un cambio di
     logo non si annulla: il file di prima non c'è più (la sua notifica non
     ha «Annulla»; aggiungere, modificare e cancellare sì).
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { LOGO_MAX_BYTES, LOGO_TIPI } from "../../../shared/schema/dashboard.ts";
import { aggiungiRegaloInput } from "../../../shared/schema/gifter.ts";
import { soloHttps } from "../../../shared/lib/url.ts";
import { convexUrl } from "../../lib/convexUrl.ts";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { Vuoto } from "../ui/campi.tsx";
import { Pannello } from "../ui/Pannello.tsx";
import { useScrittura, useToast } from "../ui/Toast.tsx";
import { useVista } from "../useVista.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, Soprannomi, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { erroriSchema } from "./forme.ts";

type Regalo = FunctionReturnType<typeof api.gifters.dettagli>["gifters"][number];
type Azione = { tipo: "cancella" | "togliLogo"; g: Regalo } | null;
type Valori = { label: string; url: string };
/** Il pannello aperto da «Carica il logo»: il focus va lì (`n` cambia a ogni richiesta). */
type FuocoLogo = { id: string; n: number } | null;

const inputRegalo = (v: Valori) => ({ label: v.label, ...(v.url.trim() ? { url: v.url.trim() } : {}) });
const quantiConcerti = (n: number) => (n === 1 ? "1 concerto" : `${n} concerti`);
const FORM = "mod-form-regalo";

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

/** Il nome del sito di un "regalato da" (solo https), o null. */
function sitoDi(url: string | undefined): { href: string; nome: string } | null {
  const href = soloHttps(url);
  if (!href) return null;
  try {
    return { href, nome: new URL(href).hostname };
  } catch {
    return null;
  }
}

export function SezioneRegali(_props: SezioneProps) {
  const q = useDati(api.gifters.dettagli);
  const { vista, parametri, apriPannello, chiudiPannello } = useVista();
  const [azione, setAzione] = useState<Azione>(null);
  const [fuoco, setFuoco] = useState<FuocoLogo>(null);
  const aperto = vista === "regali" ? (parametri.apri ?? null) : null;
  const apri = (id: string, logo = false) => {
    setFuoco(logo ? { id, n: Date.now() } : null);
    void apriPannello({ apri: id }, "regali");
  };
  // cancellato col suo pannello aperto: il pannello si chiude (senza guardia: la scrittura è fatta)
  const cancellato = (g: Regalo) => {
    setAzione(null);
    if (aperto === g.id) chiudiPannello({ dopoSalvataggio: true });
  };
  return (
    <CorniceSezione>
      <IntestazioneVista
        id="regali"
        titolo="Regalato da"
        meta={q.data && (q.data.gifters.length === 1 ? "1 nome" : `${q.data.gifters.length} nomi`)}
        descrizione="Chi ti regala i biglietti: un amico, un'azienda, una radio. Il logo compare accanto ai concerti regalati."
      />
      <NuovoRegalo onCaricaLogo={id => apri(id, true)} />
      <Caricamento q={q} righe>
        {({ gifters }) =>
          gifters.length === 0 ? (
            <Vuoto icona="gift" titolo="Nessuno, per ora." testo="Quando qualcuno ti regala un biglietto, aggiungilo qui e sceglilo nel concerto." />
          ) : (
            <ul className="mf-carte" aria-label="Regalato da">
              {gifters.map(g => {
                const sito = sitoDi(g.url);
                return (
                  <li key={g.id} className="mf-carta mf-carta-regalo mod-regalo" aria-current={g.id === aperto ? "true" : undefined}>
                    <Logo g={g} />
                    <div className="mf-carta-testi">
                      <span className="mf-carta-nome">{g.label}</span>
                      <span className="mod-conta">
                        {sito && (
                          <>
                            <a className="mod-link-sito" href={sito.href} target="_blank" rel="noreferrer">{sito.nome}</a>
                            {" · "}
                          </>
                        )}
                        {quantiConcerti(g.concerti)}
                      </span>
                    </div>
                    <div className="mf-carta-azioni">
                      <button type="button" className="mod-btn" aria-label={`Modifica ${g.label}`} onClick={() => apri(g.id)}>Modifica</button>
                      <button type="button" className="mod-btn mf-btn-fantasma mod-pericolo-lieve" aria-label={`Cancella ${g.label}`} onClick={() => setAzione({ tipo: "cancella", g })}>
                        Cancella
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        }
      </Caricamento>
      {aperto && q.data && (
        <PannelloRegalo key={aperto} id={aperto} regali={q.data.gifters} fuoco={fuoco} onAzione={setAzione} />
      )}
      {azione?.tipo === "cancella" && <Cancella g={azione.g} onChiudi={() => setAzione(null)} onFatto={() => cancellato(azione.g)} />}
      {azione?.tipo === "togliLogo" && <TogliLogo g={azione.g} onChiudi={() => setAzione(null)} />}
    </CorniceSezione>
  );
}

function Logo({ g, grande }: { g: Regalo; grande?: boolean }) {
  const src = srcLogo(g.logoUrl);
  const [rotto, setRotto] = useState(false);
  const misura = grande ? 64 : 32;
  const classe = `mod-logo${grande ? " mf-logo-grande" : ""}`;
  if (!src || rotto) return <span className={`${classe} mod-logo-vuoto`} aria-hidden="true" />;
  return <img className={classe} src={src} alt={`Logo di ${g.label}`} width={misura} height={misura} referrerPolicy="no-referrer" onError={() => setRotto(true)} />;
}

function CampiRegalo({ form }: { form: ReturnType<typeof useFormRegalo> }) {
  return (
    <>
      <form.Field name="label">{f => <CampoTesto f={f} etichetta="Nome" aiuto={<Soprannomi />} maxLength={60} autoComplete="off" />}</form.Field>
      <form.Field name="url">{f => <CampoTesto f={f} etichetta="Sito (facoltativo)" tipo="url" placeholder="https://" aiuto="Solo indirizzi https." maxLength={500} />}</form.Field>
    </>
  );
}

/** `salva` riceve anche se i valori sono ancora quelli di partenza (il pannello allora non scrive niente). */
function useFormRegalo(iniziali: Valori, salva: (v: Valori, intatto: boolean) => Promise<boolean>) {
  return useForm({
    defaultValues: iniziali,
    validators: { onChange: ({ value }: { value: Valori }) => erroriSchema(aggiungiRegaloInput, inputRegalo(value)) },
    onSubmit: async ({ value, formApi }) => {
      if (await salva(value, formApi.state.isDefaultValue)) formApi.reset();
    },
  });
}

function NuovoRegalo({ onCaricaLogo }: { onCaricaLogo: (id: string) => void }) {
  const convex = useConvex();
  const op = useScrittura();
  const modulo = useRef<HTMLFormElement>(null);
  const form = useFormRegalo({ label: "", url: "" }, async v => {
    const r = await op.esegui(() => convex.mutation(api.gifters.add, inputRegalo(v)), {
      successo: "Aggiunto: ora puoi caricare il logo.",
      annullabile: true,
      tabelle: ["gifters"],
      azioni: r => [{ etichetta: "Carica il logo", onClick: () => onCaricaLogo(r.id) }],
    });
    if (r) modulo.current?.querySelector("input")?.focus();
    return !!r;
  });
  return (
    <form ref={modulo} className="mod-form mf-aggiungi mf-aggiungi-regalo" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <div className="mod-griglia">
        <CampiRegalo form={form} />
      </div>
      <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>
      <Errore errore={op.errore} />
    </form>
  );
}

/* ── il pannello di un "regalato da" ──────────────────────────── */

/** `?apri=<gifterId>`: il pannello, o «non c'è più» (cancellato, o un link vecchio). */
function PannelloRegalo({ id, regali, fuoco, onAzione }: { id: string; regali: Regalo[]; fuoco: FuocoLogo; onAzione: (a: Azione) => void }) {
  const { chiudiPannello } = useVista();
  // l'ultima versione vista: se sparisce mentre è aperto, il pannello resta con l'avviso
  const visto = useRef<Regalo | null>(null);
  const g = regali.find(x => x.id === id);
  if (g) visto.current = g;
  const ultimo = g ?? visto.current ?? undefined;
  if (!ultimo) {
    return (
      <Pannello titolo="Regalato da" larghezza="media" sporco={false} onChiudi={() => chiudiPannello()} piedi={null}>
        <p className="mod-vuoto">Questo "regalato da" non c'è più: forse è stato cancellato.</p>
      </Pannello>
    );
  }
  return <ModuloRegalo g={ultimo} sparito={!g} fuoco={fuoco} onAzione={onAzione} />;
}

function ModuloRegalo({ g, sparito, fuoco, onAzione }: { g: Regalo; sparito: boolean; fuoco: FuocoLogo; onAzione: (a: Azione) => void }) {
  const convex = useConvex();
  const op = useScrittura();
  const { chiudiPannello } = useVista();
  const inVolo = useRef(false);
  const form = useFormRegalo({ label: g.label, url: g.url ?? "" }, async (v, intatto) => {
    // niente da salvare o salva già: nessuna voce vuota nel registro
    if (sparito || inVolo.current || intatto) return false;
    inVolo.current = true;
    const r = await op.esegui(() => convex.mutation(api.gifters.update, { id: g.id, label: v.label, url: v.url.trim() || null }), {
      successo: "Modificato.",
      annullabile: true,
      tabelle: ["gifters"],
    });
    if (r) chiudiPannello({ dopoSalvataggio: true });
    else inVolo.current = false;
    return !!r;
  });
  const sporco = useStore(form.store, s => !s.isDefaultValue);
  return (
    <Pannello
      titolo={`Modifica ${g.label}`}
      sottotitolo={`Usato in ${quantiConcerti(g.concerti)}`}
      larghezza="media"
      sporco={sporco}
      onChiudi={() => chiudiPannello()}
      modulo={FORM}
      azioni={sparito ? undefined : [{ etichetta: "Cancella…", icona: "trash", pericolo: true, onClick: () => onAzione({ tipo: "cancella", g }) }]}
      testa={sparito ? <p className="mod-attenzione" role="note">Questo "regalato da" non c'è più: forse è stato cancellato da un'altra parte.</p> : undefined}
      piedi={
        <>
          <button type="button" className="mod-btn" onClick={() => chiudiPannello()}>Annulla</button>
          <button type="submit" form={FORM} className="mod-btn mod-primario" disabled={!sporco || op.inCorso || sparito}>
            {op.inCorso ? "Salvo…" : "Salva"}
          </button>
        </>
      }
    >
      <form id={FORM} className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <CampiRegalo form={form} />
        <Errore errore={op.errore} />
      </form>
      {!sparito && <BloccoLogo g={g} fuoco={fuoco?.id === g.id ? fuoco.n : null} onTogli={() => onAzione({ tipo: "togliLogo", g })} />}
    </Pannello>
  );
}

/** Il logo nel pannello: anteprima, «Carica/Cambia il logo», «Togli il logo». Si salva subito e non si annulla. */
function BloccoLogo({ g, fuoco, onTogli }: { g: Regalo; fuoco: number | null; onTogli: () => void }) {
  const logo = useOperazione();
  const { mostra } = useToast();
  // un cambio di logo non si annulla: la notifica non ha «Annulla»
  const carica = useCaricaLogo(g, logo, testo => mostra({ testo }));
  const file = useRef<HTMLInputElement>(null);
  const pulsante = useRef<HTMLButtonElement>(null);
  // arrivati da «Carica il logo» (anche col pannello già aperto): il focus va al pulsante
  useEffect(() => {
    if (fuoco !== null) pulsante.current?.focus();
  }, [fuoco]);
  return (
    <section className="mf-blocco" aria-labelledby={`${FORM}-logo`}>
      <h3 id={`${FORM}-logo`}>Logo</h3>
      <div className="mf-logo-riga">
        <Logo g={g} grande />
        <div className="mf-logo-azioni">
          <button
            ref={pulsante}
            type="button"
            className="mod-btn"
            disabled={logo.inCorso}
            aria-label={`Carica il logo di ${g.label}`}
            data-autofocus={fuoco !== null || undefined}
            onClick={() => file.current?.click()}
          >
            {logo.inCorso ? "Carico…" : g.logoUrl ? "Cambia il logo" : "Carica il logo"}
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
          {g.logoUrl && (
            <button type="button" className="mod-btn mf-btn-fantasma" aria-label={`Togli il logo di ${g.label}`} onClick={onTogli}>Togli il logo</button>
          )}
        </div>
      </div>
      <p className="mod-hint">png, jpeg o webp fino a 256 KB. Un cambio di logo non si annulla.</p>
      <Errore errore={logo.errore} />
    </section>
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

function TogliLogo({ g, onChiudi }: { g: Regalo; onChiudi: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
  return (
    <Conferma
      titolo={`Togliere il logo di ${g.label}?`}
      etichetta="Togli il logo"
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        const r = await op.esegui(() => convex.action(api.gifters.setLogo, { id: g.id, storageId: null }), { successo: "Logo tolto." });
        if (r) onChiudi();
      }}
    >
      <p>{g.logoCaricato ? "Il file caricato si cancella e non si può recuperare da «Attività»: per rimetterlo andrà caricato di nuovo." : "Il logo sparisce dalla tua pagina."}</p>
    </Conferma>
  );
}

function Cancella({ g, onChiudi, onFatto }: { g: Regalo; onChiudi: () => void; onFatto: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
  return (
    <Conferma
      titolo={`Cancellare ${g.label}?`}
      bloccato={g.concerti > 0}
      onChiudi={() => onChiudi()}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        const r = await op.esegui(() => convex.mutation(api.gifters.remove, { id: g.id, confirm: true }), {
          successo: g.logoCaricato ? `${g.label} cancellato: annullando torna senza il logo caricato.` : `${g.label} cancellato.`,
          annullabile: true,
          tabelle: ["gifters"],
        });
        if (r) onFatto();
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
