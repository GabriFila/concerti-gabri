/* ──────────────────────────────────────────────────────────────
   I token dello stile per #stile (T5): preset, font dei titoli, raggi,
   densità e il controllo dell'accento.

   La fonte è shared/theme.ts (corsia 4): preset, `risolviTema`,
   `problemaAccento`, lo stesso validatore di profiles.setTheme. Qui si
   riesporta, così Stile.tsx non cambia. Restano locali solo i valori
   dell'anteprima (RAGGI_CSS, DENSITA_CSS): stringhe CSS per un riquadro,
   mentre in theme.ts sono oggetti interni per le variabili della pagina.
   ────────────────────────────────────────────────────────────── */

import type { Densita, Raggi } from "../../../shared/theme.ts";

export {
  CONTRASTO_MINIMO, DENSITA, DENSITA_LABELS, FONT_CSS, FONT_LABELS, FONT_TITOLI, PRESET, PRESET_IDS, RAGGI, RAGGI_LABELS, SUPERFICI,
  accentoChiaro, contrasto, contrastoMinimo, isPreset, luminanza, problemaAccento, risolviTema,
} from "../../../shared/theme.ts";
export type { Densita, FontTitoli, PresetId, Problema, Raggi, TemaSalvato, TokenTema } from "../../../shared/theme.ts";

/** Per l'anteprima: raggio e padding di un pannello. */
export const RAGGI_CSS: Record<Raggi, string> = { morbidi: "14px", netti: "4px", tondi: "26px" };
export const DENSITA_CSS: Record<Densita, string> = { comoda: "22px", compatta: "14px", ariosa: "32px" };
