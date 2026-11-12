import { createFileRoute, notFound } from "@tanstack/react-router";
import { HANDLE_RE } from "../../shared/handles.ts";
import adminCss from "../admin/admin.css?url";
import { caricaAdmin, queryProfilo, testaAdmin } from "../admin/comuni.ts";
import { Dettaglio } from "../admin/Dettaglio.tsx";

/* /admin/<handle> (DECISIONI «Vista admin»): il dettaglio di un profilo,
   in sola lettura. Come /admin: per chi non è admin, e per un handle che
   non c'è, il 404 di una pagina inesistente. */
export const Route = createFileRoute("/admin_/$handle")({
  loader: async ({ context, params }) => {
    if (!HANDLE_RE.test(params.handle)) throw notFound();
    await caricaAdmin(context, queryProfilo(params.handle));
    return { handle: params.handle };
  },
  head: ({ loaderData }) => (loaderData ? testaAdmin(`${loaderData.handle} · Admin · Concerti`, adminCss) : {}),
  component: DettaglioRoute,
});

function DettaglioRoute() {
  const { handle } = Route.useParams();
  return <Dettaglio handle={handle} />;
}
