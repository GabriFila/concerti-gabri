/* L'istante congelato dei test: lo stesso dei test Vitest dei KPI (PIANO §7,
   traguardo 1). Le due build lo vedono in modi diversi:
   - Start: il server lo legge da E2E_NOW (solo con E2E=1 e fuori da Vercel) e
     lo passa al client con l'idratazione. Niente `page.clock` qui: il client
     non legge l'orologio per decidere passato/in programma, e un orologio
     finto nel browser nasconderebbe proprio quel difetto.
   - main: è una SPA che legge `Date.now()` nel browser, quindi l'orologio si
     ferma con `clock.setFixedTime` (i timer continuano a girare). */

import type { BrowserContext } from "@playwright/test";

export const E2E_NOW = "2026-10-21T12:00:00+02:00";

/** Ferma Date/new Date() del contesto all'istante dei test (solo per main). */
export async function freezeClock(context: BrowserContext): Promise<void> {
  await context.clock.setFixedTime(new Date(E2E_NOW));
}
