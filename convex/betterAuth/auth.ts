/* Solo per la CLI dello schema (`pnpm dlx auth@1.6.33 generate` da questa
   cartella): un'istanza statica, mai usata a runtime. */
import { createAuth } from "../auth";

export const auth = createAuth({} as any);
