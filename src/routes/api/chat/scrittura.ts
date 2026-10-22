import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { handleChatScrittura } from "../../../server/oracolo/scrittura.ts";

/* L'Oracolo in scrittura del proprietario (PIANO §1.27): POST
   /api/chat/scrittura, risposta in SSE. Sessione, Origin obbligatorio e
   strumenti del catalogo stanno in src/server/oracolo/scrittura.ts.
   ANY: ogni altro metodo prende 405 dall'handler, invece di cadere nel
   renderer delle pagine. */
export const Route = createFileRoute("/api/chat/scrittura")({
  server: {
    handlers: {
      ANY: ({ request }) => handleChatScrittura(request, { ip: getRequestIP({ xForwardedFor: true }) ?? "unknown" }),
    },
  },
});
