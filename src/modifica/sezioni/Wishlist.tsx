/* ──────────────────────────────────────────────────────────────
   #wishlist (T5, spec ux-modifica §6.4): gli artisti che si vogliono
   vedere, in ordine.

   - In cima l'aggiunta rapida (l'azione principale della vista): un nome
     già nella lista si segnala mentre si scrive; dopo l'aggiunta il campo
     si svuota e tiene il focus, per scriverne un altro.
   - Ogni riga: ↑ ↓ e il menu ⋯ («Sposta in cima», «Sposta in fondo»,
     «L'ho visto: aggiungi il concerto», «Togli…»). Dopo uno spostamento il
     focus resta sulla riga spostata.
   - «L'ho visto» apre il form di un concerto nuovo con l'artista (il ponte
     dell'editor, origine "wishlist"); salvato, la sua notifica offre
     «Togli {artista} dalla wishlist».
   - Ogni cambio salva tutta la lista con `wishlist.set` (una voce nel
     registro: la notifica ha «Annulla»); togliere un artista chiede
     conferma. Sulla pagina pubblica l'atto della wishlist sparisce da solo
     se la lista è vuota.
   ────────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { artista } from "../../../shared/schema/campi.ts";
import { Icon } from "../../ui/Icon.tsx";
import { useEditorConcerti } from "../editor.tsx";
import { IntestazioneVista } from "../shell/IntestazioneVista.tsx";
import type { SezioneProps } from "../tipi.ts";
import { Vuoto } from "../ui/campi.tsx";
import { Menu } from "../ui/Menu.tsx";
import { useScrittura } from "../ui/Toast.tsx";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, useConvex, useDati } from "./comuni.tsx";
import { erroriSchema, nomeGiaUsato, spostata } from "./forme.ts";

const nuovoArtista = z.object({ artist: artista });

export function SezioneWishlist(_props: SezioneProps) {
  const q = useDati(api.wishlist.list);
  const n = q.data?.artists.length;
  return (
    <CorniceSezione>
      <IntestazioneVista
        id="wishlist"
        titolo="Wishlist"
        meta={n !== undefined && (n === 1 ? "1 artista" : `${n} artisti`)}
        descrizione="Gli artisti che vuoi vedere dal vivo, nell'ordine della tua pagina. Non entrano nelle statistiche."
      />
      <Caricamento q={q} righe>{({ artists }) => <Lista artisti={artists} />}</Caricamento>
    </CorniceSezione>
  );
}

const WISHLIST = { annullabile: true, tabelle: ["wishlist"] };

function Lista({ artisti }: { artisti: string[] }) {
  const convex = useConvex();
  const editor = useEditorConcerti();
  const sposta = useScrittura();
  const togli = useScrittura();
  const [daTogliere, setDaTogliere] = useState<string | null>(null);
  const elenco = useRef<HTMLOListElement>(null);
  // il pulsante da rimettere a fuoco quando la lista spostata arriva (spostare una riga nel DOM le toglie il focus)
  const fuoco = useRef<string[] | null>(null);

  useEffect(() => {
    const nomi = fuoco.current;
    if (!nomi || !elenco.current) return;
    fuoco.current = null;
    const pulsanti = [...elenco.current.querySelectorAll<HTMLButtonElement>("button")];
    const b = nomi.map(n => pulsanti.find(x => x.getAttribute("aria-label") === n && !x.disabled)).find(Boolean);
    b?.focus();
  }, [artisti]);

  const salva = (lista: string[], successo: string) => sposta.esegui(() => convex.mutation(api.wishlist.set, { artists: lista }), { successo, ...WISHLIST });
  /** Sposta `a` da `i` a `j`; poi il focus torna su `pulsanti` (il primo che si può ancora premere). */
  const muovi = (i: number, j: number, pulsanti: string[]) => {
    // niente pulsanti spenti mentre salva (un pulsante spento perde il focus): un clic in più si ignora
    if (sposta.inCorso || i === j) return;
    fuoco.current = pulsanti;
    void salva(spostata(artisti, i, j), "Ordine aggiornato.");
  };

  return (
    <>
      <AggiuntaArtista artisti={artisti} />
      {artisti.length === 0 ? (
        <Vuoto icona="heart" titolo="La lista è vuota." testo="Sulla tua pagina la wishlist non compare finché non ci aggiungi un artista." />
      ) : (
        <ol ref={elenco} className="mf-elenco mf-wishlist" aria-label="Wishlist">
          {artisti.map((a, i) => {
            const ultimo = i === artisti.length - 1;
            return (
              <li key={a} className="mf-voce">
                <span className="mod-set-n">{i + 1}</span>
                <span className="mf-voce-nome">{a}</span>
                <span className="mf-voce-azioni">
                  <button
                    type="button"
                    className="mod-icona"
                    aria-label={`Sposta su ${a}`}
                    title="Sposta su"
                    disabled={i === 0}
                    onClick={() => muovi(i, i - 1, [`Sposta su ${a}`, `Sposta giù ${a}`])}
                  >
                    <Icon name="arrowUp" size={15} stroke={2} />
                  </button>
                  <button
                    type="button"
                    className="mod-icona"
                    aria-label={`Sposta giù ${a}`}
                    title="Sposta giù"
                    disabled={ultimo}
                    onClick={() => muovi(i, i + 1, [`Sposta giù ${a}`, `Sposta su ${a}`])}
                  >
                    <Icon name="arrowDown" size={15} stroke={2} />
                  </button>
                  <Menu
                    etichetta={`Altre azioni per ${a}`}
                    voci={[
                      { etichetta: "Sposta in cima", icona: "arrowUp", disabilitata: i === 0, onClick: () => muovi(i, 0, [`Altre azioni per ${a}`]) },
                      { etichetta: "Sposta in fondo", icona: "arrowDown", disabilitata: ultimo, onClick: () => muovi(i, artisti.length, [`Altre azioni per ${a}`]) },
                      { etichetta: "L'ho visto: aggiungi il concerto", icona: "ticket", onClick: () => void editor.apri({ tipo: "concert", bozza: { artist: a }, origine: "wishlist" }) },
                      { etichetta: "Togli…", icona: "trash", pericolo: true, onClick: () => setDaTogliere(a) },
                    ]}
                  />
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <Errore errore={sposta.errore} />
      {daTogliere && (
        <Conferma
          titolo="Togliere dalla wishlist?"
          etichetta="Togli"
          onChiudi={() => setDaTogliere(null)}
          inCorso={togli.inCorso}
          errore={togli.errore}
          onConferma={async () => {
            const lista = artisti.filter(a => a !== daTogliere);
            const r = await togli.esegui(() => convex.mutation(api.wishlist.set, { artists: lista }), { successo: `${daTogliere} tolto dalla wishlist.`, ...WISHLIST });
            if (r) setDaTogliere(null);
          }}
        >
          <p><b>{daTogliere}</b> esce dalla lista dei desideri.</p>
        </Conferma>
      )}
    </>
  );
}

/** L'aggiunta rapida in cima: un artista già in lista si segnala mentre si scrive. */
function AggiuntaArtista({ artisti }: { artisti: string[] }) {
  const convex = useConvex();
  const op = useScrittura();
  const modulo = useRef<HTMLFormElement>(null);
  // il validatore legge sempre la lista di adesso
  const lista = useRef(artisti);
  lista.current = artisti;
  const form = useForm({
    defaultValues: { artist: "" },
    validators: {
      onChange: ({ value }) =>
        erroriSchema(nuovoArtista, value) ?? (nomeGiaUsato(lista.current, value.artist) ? { fields: { artist: "è già nella lista" } } : undefined),
    },
    onSubmit: async ({ value, formApi }) => {
      const nome = value.artist.trim();
      const r = await op.esegui(() => convex.mutation(api.wishlist.set, { artists: [...lista.current, nome] }), { successo: `${nome} è nella wishlist.`, ...WISHLIST });
      if (!r) return;
      formApi.reset();
      modulo.current?.querySelector("input")?.focus();
    },
  });
  return (
    <form ref={modulo} className="mod-form mf-aggiungi" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
      <form.Field name="artist">
        {f => (
          <CampoTesto
            f={f}
            etichetta="Aggiungi un artista"
            maxLength={120}
            autoComplete="off"
            azione={<button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>}
          />
        )}
      </form.Field>
      <Errore errore={op.errore} />
    </form>
  );
}
