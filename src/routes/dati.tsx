import { createFileRoute, redirect } from "@tanstack/react-router";

/* `/dati` del sito di prima → `/gabrifila/dati`, permanente (308, SPEC §3).
   La query string resta; il frammento (`#sec-mappa`) lo conserva il browser
   da solo. `dati` è un handle riservato, quindi nessun profilo può
   chiamarsi così. */
export const Route = createFileRoute("/dati")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: "/gabrifila/dati" + location.searchStr, statusCode: 308 });
  },
});
