import { createFileRoute, redirect } from "@tanstack/react-router";
import { Benvenuto } from "../benvenuto/Benvenuto.tsx";
import { profiloDiChiGuarda } from "../lib/viewer.ts";

/* /benvenuto (PIANO §6 guard, solo UX: i controlli veri sono in Convex):
   - anonimo → /accedi?next=/benvenuto;
   - onboarding finito → 307 a /<handle>/modifica;
   - altrimenti il passo del profilo (src/benvenuto/Benvenuto.tsx). */
export const Route = createFileRoute("/benvenuto")({
  beforeLoad: async ({ context }) => {
    if (!context.auth?.autenticato) throw redirect({ href: "/accedi?next=%2Fbenvenuto", statusCode: 307 });
    const p = await profiloDiChiGuarda(context);
    if (p?.status === "active" && p.handle && p.onboardingStep === "fatto") {
      throw redirect({ to: "/$handle/modifica", params: { handle: p.handle }, statusCode: 307 });
    }
  },
  head: () => ({ meta: [{ title: "Primi passi · Concerti" }, { name: "robots", content: "noindex" }] }),
  component: Benvenuto,
});
