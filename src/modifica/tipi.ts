/* ──────────────────────────────────────────────────────────────
   Props comuni delle sezioni di /<handle>/modifica (contratto di ondata,
   docs/multiutente/CONTRATTI-ONDATA.md). Le sezioni leggono e scrivono
   solo con le funzioni owner di Convex: il proprietario lo ricava la
   sessione, mai un id passato da qui.
   ────────────────────────────────────────────────────────────── */

export interface SezioneProps {
  /** Handle della pagina che si sta modificando (è quello del proprietario). */
  handle: string;
}
