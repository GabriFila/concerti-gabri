import { createFileRoute, redirect } from "@tanstack/react-router";
import { profiloDiChiGuarda } from "../lib/viewer.ts";
import { Scheletro } from "../modifica/Scheletro.tsx";

/* /<handle>/modifica (PIANO §6): solo il proprietario. Il guard è UX (i
   controlli veri sono in ogni funzione Convex, requireOwner): un visitatore
   anonimo, un altro utente o un profilo non ancora `active` tornano a
   /<handle>. Gira prima del loader di $handle, quindi niente dati della
   pagina per chi viene rimandato indietro. */
export const Route = createFileRoute("/$handle/modifica")({
  beforeLoad: async ({ context, params }) => {
    const p = await profiloDiChiGuarda(context);
    if (!p || p.status !== "active" || p.handle !== params.handle) {
      throw redirect({ to: "/$handle", params: { handle: params.handle }, statusCode: 307 });
    }
  },
  head: () => ({ meta: [{ title: "Modifica · Concerti" }, { name: "robots", content: "noindex" }] }),
  component: Modifica,
});

function Modifica() {
  const { handle } = Route.useParams();
  return <Scheletro handle={handle} />;
}
