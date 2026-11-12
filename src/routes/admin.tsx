import { createFileRoute } from "@tanstack/react-router";
import adminCss from "../admin/admin.css?url";
import { caricaAdmin, queryProfili, testaAdmin } from "../admin/comuni.ts";
import { Elenco } from "../admin/Elenco.tsx";

/* /admin (DECISIONI «Vista admin», 2026-11-12): l'elenco dei profili in
   sola lettura, solo per la sessione di un utente in ADMIN_USER_IDS. Per
   tutti gli altri (anonimi compresi) è il 404 di una pagina che non c'è:
   stesso componente, stesso stato, niente titolo né CSS propri. Nessun
   link dal resto del sito. Il dettaglio è admin_.$handle.tsx (non
   annidato: ha la sua pagina). */
export const Route = createFileRoute("/admin")({
  loader: async ({ context }) => {
    await caricaAdmin(context, queryProfili());
    return { admin: true as const };
  },
  head: ({ loaderData }) => (loaderData ? testaAdmin("Profili · Admin · Concerti", adminCss) : {}),
  component: Elenco,
});
