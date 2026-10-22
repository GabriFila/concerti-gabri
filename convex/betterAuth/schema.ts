/* Schema del componente: le tabelle generate (generatedSchema.ts, da non
   toccare a mano) più i nostri indici. Si rigenera con
   `cd convex/betterAuth && pnpm dlx auth@1.6.33 generate --output generatedSchema.ts`
   (con un ambiente pulito: la CLI carica convex/auth.ts). */
import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  // le API key si cercano per hash della chiave e per utente (corsia 7)
  apikey: tables.apikey.index("key", ["key"]).index("referenceId", ["referenceId"]).index("configId_referenceId", ["configId", "referenceId"]),
});

export default schema;
