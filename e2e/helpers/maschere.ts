/* Le zone escluse dal confronto dei pixel:
   - `.mapwrap`: la mappa Mapbox. Il token pk. è limitato per URL e la porta
     della build di main (4173) non è tra quelle ammesse, quindi lì le tile
     rispondono 403; la mappa viva si verifica a parte (mappa.spec.ts);
   - `.trendcanvas`: il grafico ECharts dell'andamento, disegnato su canvas
     (antialiasing e tempi di animazione non deterministici).
   Le maschere coprono solo il contenuto: dimensioni e posizione restano nel
   confronto, perché l'altezza della pagina deve coincidere. */

import type { Locator, Page } from "@playwright/test";

export const MASK_SELECTORS = [".mapwrap", ".trendcanvas"] as const;
/** Un colore che nessuno dei due temi usa, così una maschera spostata si vede nel diff. */
export const MASK_COLOR = "#ff00ff";

export const masks = (page: Page): Locator[] => MASK_SELECTORS.map(s => page.locator(s));
