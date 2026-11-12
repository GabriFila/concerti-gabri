/* ──────────────────────────────────────────────────────────────
   Il blocco «Foto» del pannello di un concerto o festival (#concerti,
   DECISIONI «Foto dei concerti»). Fuori dal form: ogni foto si salva
   subito, come il logo di un "regalato da", e non passa da «Salva».

   - «Aggiungi foto» apre la scelta dei file (anche più d'uno, anche dalla
     fotocamera del telefono). Ogni foto si prepara nel browser
     (elabora.ts: ridimensionata, ricodificata, senza metadati), poi
     urlCaricamento → i due POST → aggiungi, una alla volta, con
     «Carico 2 di 5…». Le foto rifiutate si elencano sotto, le altre vanno.
   - Ogni miniatura ha il suo ⋯: «Sposta prima», «Sposta dopo», «Togli…»
     (con conferma: i file si cancellano e non si annulla).
   - Dal link di link_foto_concerto (`&foto=1`): il blocco scorre in vista,
     «Aggiungi foto» diventa il pulsante principale e prende il fuoco.
   - Un concerto nuovo non ha ancora un id: prima si salva.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { FOTO_PER_EVENTO } from "../../../shared/schema/foto.ts";
import { Conferma, Errore, erroreDi, useConvex, useDati, type ErroreUi } from "../sezioni/comuni.tsx";
import { Menu } from "../ui/Menu.tsx";
import { useScrittura, useToast } from "../ui/Toast.tsx";
import { FotoIllegibile, preparaFoto } from "./elabora.ts";

interface Foto {
  id: string;
  url: string;
  miniatura: string;
  larghezza: number;
  altezza: number;
}

const ID_TITOLO = "mf-foto-titolo";

export function FotoEvento({ entryId, titolo, inEvidenza = false }: { entryId?: string; titolo: string; inEvidenza?: boolean }) {
  if (!entryId) {
    return (
      <section className="mf-blocco mf-foto" aria-labelledby={ID_TITOLO}>
        <h3 id={ID_TITOLO}>Foto</h3>
        <p className="mod-hint">Salva il concerto, poi riaprilo per aggiungere le foto della serata.</p>
      </section>
    );
  }
  return <FotoSalvate entryId={entryId} titolo={titolo} inEvidenza={inEvidenza} />;
}

function FotoSalvate({ entryId, titolo, inEvidenza }: { entryId: string; titolo: string; inEvidenza: boolean }) {
  const q = useDati(api.foto.dellEvento, { entryId });
  const foto: Foto[] = q.data?.foto ?? [];
  const max = q.data?.max ?? FOTO_PER_EVENTO;
  const convex = useConvex();
  const { mostra } = useToast();
  const sposta = useScrittura();
  const input = useRef<HTMLInputElement>(null);
  const blocco = useRef<HTMLElement>(null);
  const aggiungi = useRef<HTMLButtonElement>(null);
  // dal link di un agente (`&foto=1`): appena ci sono i dati, il blocco in vista e il fuoco su «Aggiungi foto»
  // (la scelta dei file no: il browser la apre solo dopo un tocco)
  const pronto = !!q.data;
  const portato = useRef(false);
  useEffect(() => {
    if (!inEvidenza || !pronto || portato.current) return;
    portato.current = true;
    const t = setTimeout(() => {
      blocco.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      aggiungi.current?.focus({ preventScroll: true });
    }, 150);
    return () => clearTimeout(t);
  }, [inEvidenza, pronto]);
  const [avanzamento, setAvanzamento] = useState<{ fatte: number; totale: number } | null>(null);
  const [rifiutate, setRifiutate] = useState<{ nome: string; errore: ErroreUi }[]>([]);
  const [togli, setTogli] = useState<Foto | null>(null);
  const posto = Math.max(0, max - foto.length);

  const carica = async (scelti: File[]) => {
    const file = scelti.slice(0, posto);
    const oltre = scelti.length - file.length;
    const errori: { nome: string; errore: ErroreUi }[] = [];
    let fatte = 0;
    setRifiutate([]);
    setAvanzamento({ fatte: 0, totale: file.length });
    for (const [i, f] of file.entries()) {
      setAvanzamento({ fatte: i, totale: file.length });
      try {
        const pronta = await preparaFoto(f);
        const url = await convex.mutation(api.foto.urlCaricamento, { entryId });
        const invia = async (u: string, b: Blob) => {
          const r = await fetch(u, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: b });
          if (!r.ok) throw new Error("upload");
          return ((await r.json()) as { storageId: string }).storageId;
        };
        const [storFoto, storMini] = [await invia(url.file, pronta.foto), await invia(url.miniatura, pronta.miniatura)];
        const esito = await convex.action(api.foto.aggiungi, { entryId, file: storFoto, miniatura: storMini });
        if (esito.ok) fatte++;
        else errori.push({ nome: f.name, errore: { code: esito.code, messaggio: esito.messaggio } });
      } catch (e) {
        const errore = e instanceof FotoIllegibile ? { code: "input_non_valido", messaggio: e.message } : erroreDi(e);
        errori.push({ nome: f.name, errore });
        // il limite (per evento o del giorno) vale anche per le foto dopo: inutile continuare
        if (errore.code === "limite_superato") break;
      }
    }
    setAvanzamento(null);
    if (oltre > 0) errori.push({ nome: oltre === 1 ? "1 foto" : `${oltre} foto`, errore: { code: "limite_superato", messaggio: `al massimo ${max} foto per serata: queste non le ho caricate` } });
    setRifiutate(errori);
    if (fatte) mostra({ testo: fatte === 1 ? "Foto aggiunta." : `${fatte} foto aggiunte.` });
  };

  const occupato = !!avanzamento;
  return (
    <section ref={blocco} className="mf-blocco mf-foto" aria-labelledby={ID_TITOLO} aria-busy={occupato || undefined} data-evidenza={inEvidenza || undefined}>
      <h3 id={ID_TITOLO}>
        Foto <span className="mf-foto-conta">{foto.length} di {max}</span>
      </h3>
      {foto.length > 0 && (
        <ul className="mf-foto-griglia">
          {foto.map((f, i) => (
            <li className="mf-foto-voce" key={f.id}>
              <a className="mf-foto-anteprima" href={f.url} target="_blank" rel="noreferrer" aria-label={`Apri la foto ${i + 1} di ${titolo} in una scheda nuova`}>
                <img src={f.miniatura} alt="" loading="lazy" decoding="async" width={f.larghezza} height={f.altezza} />
                {i === 0 && <span className="mf-foto-prima">copertina</span>}
              </a>
              <Menu
                className="mf-foto-menu"
                etichetta={`Altre azioni per la foto ${i + 1}`}
                voci={[
                  { etichetta: "Sposta prima", icona: "chevron", disabilitata: i === 0 || sposta.inCorso, onClick: () => void sposta.esegui(() => convex.mutation(api.foto.sposta, { id: f.id, verso: "prima" }), { successo: "Foto spostata." }) },
                  { etichetta: "Sposta dopo", icona: "chevron", disabilitata: i === foto.length - 1 || sposta.inCorso, onClick: () => void sposta.esegui(() => convex.mutation(api.foto.sposta, { id: f.id, verso: "dopo" }), { successo: "Foto spostata." }) },
                  { etichetta: "Togli…", icona: "trash", pericolo: true, onClick: () => setTogli(f) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mf-foto-azioni">
        <button
          ref={aggiungi}
          type="button"
          className={`mod-btn${inEvidenza && posto > 0 ? " mod-primario" : ""}`}
          disabled={occupato || posto === 0 || !q.data}
          onClick={() => input.current?.click()}
        >
          {avanzamento ? `Carico ${Math.min(avanzamento.fatte + 1, avanzamento.totale)} di ${avanzamento.totale}…` : foto.length ? "Aggiungi altre foto" : "Aggiungi foto"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label={`Foto di ${titolo}`}
          onChange={e => {
            const scelti = [...(e.target.files ?? [])];
            e.target.value = "";
            if (scelti.length) void carica(scelti);
          }}
        />
      </div>
      <p className="mod-hint">
        {posto === 0
          ? `Hai già ${max} foto per questa serata: togline una per aggiungerne un'altra.`
          : "Le foto si rimpiccioliscono e perdono posizione, data e modello del telefono prima di partire. Compaiono in «Le mie foto» sulla tua pagina."}
      </p>
      {q.error && <Errore errore={erroreDi(q.error)} />}
      <Errore errore={sposta.errore} />
      {rifiutate.length > 0 && (
        <div className="mod-errore" role="alert">
          <p>{rifiutate.length === 1 ? "Una foto non è andata:" : `${rifiutate.length} foto non sono andate:`}</p>
          <ul className="mod-elenco-breve">
            {rifiutate.map((r, i) => <li key={i}><b>{r.nome}</b>: {r.errore.messaggio}</li>)}
          </ul>
        </div>
      )}
      {togli && <TogliFoto foto={togli} titolo={titolo} onChiudi={() => setTogli(null)} />}
    </section>
  );
}

function TogliFoto({ foto, titolo, onChiudi }: { foto: Foto; titolo: string; onChiudi: () => void }) {
  const convex = useConvex();
  const op = useScrittura();
  return (
    <Conferma
      titolo="Togliere questa foto?"
      etichetta="Togli la foto"
      onChiudi={onChiudi}
      inCorso={op.inCorso}
      errore={op.errore}
      onConferma={async () => {
        const r = await op.esegui(() => convex.mutation(api.foto.togli, { id: foto.id, confirm: true }), { successo: "Foto tolta." });
        if (r) onChiudi();
      }}
    >
      <img className="mf-foto-conferma" src={foto.miniatura} alt={`La foto di ${titolo} da togliere`} />
      <p>Sparisce dalla tua pagina e il file si cancella: non si recupera da «Attività».</p>
    </Conferma>
  );
}

/** #concerti: quante foto ha ogni evento (una sola sottoscrizione per tutte le righe). */
export function useFotoPerEvento(): Record<string, number> {
  return useDati(api.foto.conteggi, {}).data?.perEvento ?? {};
}
