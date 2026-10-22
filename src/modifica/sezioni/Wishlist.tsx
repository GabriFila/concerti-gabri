/* ──────────────────────────────────────────────────────────────
   #wishlist (T5): gli artisti che si vogliono vedere, in ordine. Ogni
   cambio salva tutta la lista con `wishlist.set` (una voce nel registro,
   annullabile); togliere un artista chiede conferma. Sulla pagina
   pubblica l'atto della wishlist sparisce da solo se la lista è vuota.
   ────────────────────────────────────────────────────────────── */

import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import { artista } from "../../../shared/schema/campi.ts";
import type { SezioneProps } from "../tipi.ts";
import { CampoTesto, Caricamento, Conferma, CorniceSezione, Errore, useConvex, useDati, useOperazione } from "./comuni.tsx";
import { chiaveNome, erroriSchema } from "./forme.ts";

const nuovoArtista = z.object({ artist: artista });

export function SezioneWishlist(_props: SezioneProps) {
  const q = useDati(api.wishlist.list);
  return (
    <CorniceSezione>
      <p className="mod-hint">Gli artisti che vuoi vedere dal vivo, nell'ordine in cui compaiono sulla tua pagina. Non entrano nelle statistiche.</p>
      <Caricamento q={q}>{({ artists }) => <Lista artisti={artists} />}</Caricamento>
    </CorniceSezione>
  );
}

function Lista({ artisti }: { artisti: string[] }) {
  const convex = useConvex();
  const op = useOperazione();
  const togli = useOperazione();
  const [daTogliere, setDaTogliere] = useState<string | null>(null);
  const salva = (lista: string[]) => op.esegui(() => convex.mutation(api.wishlist.set, { artists: lista }));
  const sposta = (i: number, j: number) => {
    const l = [...artisti];
    [l[i], l[j]] = [l[j], l[i]];
    void salva(l);
  };
  const form = useForm({
    defaultValues: { artist: "" },
    validators: { onChange: ({ value }) => erroriSchema(nuovoArtista, value) },
    onSubmit: async ({ value, formApi }) => {
      const nome = value.artist.trim();
      if (artisti.some(a => chiaveNome(a) === chiaveNome(nome))) {
        op.setErrore({ code: "conflitto", messaggio: "è già nella lista" });
        return;
      }
      if (await salva([...artisti, nome])) formApi.reset();
    },
  });

  return (
    <>
      {artisti.length === 0 ? (
        <p className="mod-vuoto">La lista è vuota: sulla tua pagina la wishlist non compare.</p>
      ) : (
        <ol className="mod-lista mod-lista-semplice" aria-label="Wishlist">
          {artisti.map((a, i) => (
            <li key={a}>
              <span className="mod-set-n">{i + 1}</span>
              <span className="mod-nome">{a}</span>
              <span className="mod-evento-azioni">
                <button type="button" className="mod-icona" aria-label={`Sposta su ${a}`} disabled={i === 0 || op.inCorso} onClick={() => sposta(i, i - 1)}>↑</button>
                <button type="button" className="mod-icona" aria-label={`Sposta giù ${a}`} disabled={i === artisti.length - 1 || op.inCorso} onClick={() => sposta(i, i + 1)}>↓</button>
                <button type="button" className="mod-btn mod-pericolo-lieve" aria-label={`Togli ${a}`} onClick={() => setDaTogliere(a)}>Togli</button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <form className="mod-form" noValidate onSubmit={e => { e.preventDefault(); void form.handleSubmit(); }}>
        <div className="mod-riga mod-riga-fondo">
          <form.Field name="artist">{f => <CampoTesto f={f} etichetta="Aggiungi un artista" maxLength={120} autoComplete="off" />}</form.Field>
          <button type="submit" className="mod-btn mod-primario" disabled={op.inCorso}>Aggiungi</button>
        </div>
      </form>
      <Errore errore={op.errore} />
      {daTogliere && (
        <Conferma
          titolo="Togliere dalla wishlist?"
          etichetta="Togli"
          onChiudi={() => setDaTogliere(null)}
          inCorso={togli.inCorso}
          errore={togli.errore}
          onConferma={async () => {
            const lista = artisti.filter(a => a !== daTogliere);
            if (await togli.esegui(() => convex.mutation(api.wishlist.set, { artists: lista }))) setDaTogliere(null);
          }}
        >
          <p><b>{daTogliere}</b> esce dalla lista dei desideri.</p>
        </Conferma>
      )}
    </>
  );
}
