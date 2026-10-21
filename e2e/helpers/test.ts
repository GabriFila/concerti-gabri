/* Il `test` di tutte le spec: quello di Playwright, con il cookie di bypass
   di Vercel nel contesto quando il progetto punta alla preview (nessun
   effetto in locale, nessun contesto creato per i test che non usano il
   browser). Le richieste senza browser passano da helpers/http.ts. */

import { test as base } from "@playwright/test";
import { installBypass } from "./bypass.ts";

export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    await installBypass(context, baseURL);
    await use(context);
  },
});

export { expect } from "@playwright/test";

/** true sul progetto `preview` (l'URL del branch su Vercel). */
export const onPreview = (projectName: string) => projectName === "preview";
