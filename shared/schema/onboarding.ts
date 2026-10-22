/* Input di /benvenuto (PIANO §1.19): il passo 1 (completeOnboarding) e la
   navigazione tra i passi 2–5 (setOnboardingStep). Li usano Convex e il
   form (TanStack Form), quindi le regole sono le stesse nei due posti. */

import { z } from "zod";
import { forma, handle, nomeVisualizzato } from "./campi.ts";
import { PASSI_ONBOARDING } from "./profile.ts";

export const completaOnboardingInput = z
  .object({
    handle,
    forma,
    displayName: nomeVisualizzato,
  })
  .describe("Passo 1 di /benvenuto: indirizzo della pagina, forma grammaticale e nome visualizzato");

export const passoOnboardingInput = z
  .object({
    passo: z.enum(PASSI_ONBOARDING).describe("Il passo di /benvenuto in cui portare il profilo (fatto = onboarding finito)"),
  })
  .describe("Il passo di /benvenuto raggiunto");
