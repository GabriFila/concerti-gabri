import { createFileRoute } from "@tanstack/react-router";
import { handler } from "../../../lib/auth-server.ts";

/* /api/auth/* → il sito Convex (Better Auth, convex/http.ts), stesso
   percorso (PIANO §6). Il browser parla solo con la nostra origine, quindi
   il cookie di sessione resta qui; Origin e cookie passano com'erano e
   Better Auth li controlla (trusted origins, convex/auth.ts). */
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
    },
  },
});
