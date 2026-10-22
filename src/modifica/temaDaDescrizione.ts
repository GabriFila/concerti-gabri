/* ──────────────────────────────────────────────────────────────
   "Tema da descrizione" di #stile (T5): server function di Start, solo con
   la sessione del proprietario.

   1. consuma il limite con `style.consumeThemeGeneration` (Convex, con il
      token della sessione: niente sessione o non proprietario → errore;
      10 al giorno per profilo, 50 in tutto);
   2. chiede a Gemini i token con output strutturato (`@google/genai`,
      `responseJsonSchema`);
   3. li valida (temaGenerato.ts) e li restituisce per l'anteprima: li
      salva poi la UI con profiles.setTheme.
   Con E2E=1 e ORACOLO_FAKE=1 (mai su Vercel) restituisce token fissi.
   Gli errori tornano come `{ok: false, code, messaggio}`, senza ripetere la
   descrizione; la descrizione non va nei log. I passi e il loro ordine
   stanno in `generaTema` (temaGenerato.ts, coi test); qui solo le
   dipendenze vere.
   Le dipendenze solo-server si caricano dentro l'handler, così non entrano
   nel bundle del browser.
   ────────────────────────────────────────────────────────────── */

import { createServerFn } from "@tanstack/react-start";
import { api } from "../../convex/_generated/api";
import { descrizioneTemaInput } from "../../shared/schema/dashboard.ts";
import { generaTema, SCHEMA_RISPOSTA, type EsitoTema } from "./temaGenerato.ts";

export type { EsitoTema };

/** Come src/server/oracolo/handler.ts (DEFAULT_MODEL), salvo GEMINI_MODEL. */
const MODELLO_PREDEFINITO = "gemini-3.1-flash-lite";

export const temaDaDescrizione = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    const r = descrizioneTemaInput.safeParse(d);
    if (!r.success) throw new Error("descrizione non valida: da 3 a 300 caratteri");
    return r.data;
  })
  .handler(async ({ data }): Promise<EsitoTema> => {
    const { fetchAuthMutation, getToken } = await import("../lib/auth-server.ts");
    return await generaTema(data.descrizione, {
      token: getToken,
      consuma: () => fetchAuthMutation(api.style.consumeThemeGeneration, {}),
      env: process.env,
      gemini: async prompt => {
        const { GoogleGenAI } = await import("@google/genai");
        const res = await new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }).models.generateContent({
          model: process.env.GEMINI_MODEL || MODELLO_PREDEFINITO,
          contents: prompt,
          config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA_RISPOSTA, temperature: 0.8, maxOutputTokens: 300 },
        });
        return res.text;
      },
    });
  });
