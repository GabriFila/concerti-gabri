/* ──────────────────────────────────────────────────────────────
   Indirizzo di una partenza (contratto di ondata). Campo → candidati
   (`geo.geocodeDeparture`) → scelta → `departures.confirmAddress`.
   Solo client, montato dopo l'idratazione: l'indirizzo non entra mai
   nello stato SSR né nei log. Lo implementa la corsia 3 (passo 2 di
   /benvenuto); la corsia 5 lo usa in #partenze.
   ────────────────────────────────────────────────────────────── */

export interface AddressPickerProps {
  /** La partenza (già creata) di cui confermare l'indirizzo. */
  departureId: string;
  /** La partenza ha già un indirizzo: confermarne un altro è una correzione (una al giorno). */
  correzione?: boolean;
  /** Dopo una conferma riuscita, con l'esito di `departures.confirmAddress`. */
  onConfermato?: (esito: { correzione: boolean; stessoPunto: boolean }) => void;
  onAnnulla?: () => void;
}

export function AddressPicker(_props: AddressPickerProps) {
  return <p className="modifica-segnaposto">Indirizzo: in arrivo.</p>;
}
