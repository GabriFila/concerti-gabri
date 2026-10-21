import { createFileRoute } from "@tanstack/react-router";
import { getRequestIP } from "@tanstack/react-start/server";
import { handleChat } from "../../../server/oracolo/handler.ts";

/* L'Oracolo: POST /api/chat, risposta in SSE. La logica sta in
   src/server/oracolo/; qui solo l'IP del visitatore (su Vercel l'header
   X-Forwarded-For lo scrive la piattaforma, quindi è affidabile).
   ANY e non POST: un metodo non registrato cadrebbe nel renderer delle
   pagine (200 con una pagina vuota); così ogni metodo arriva a handleChat,
   che risponde 405 a tutto ciò che non è POST, come faceva Netlify. */
export const Route = createFileRoute("/api/chat/")({
  server: {
    handlers: {
      ANY: ({ request }) => handleChat(request, { ip: getRequestIP({ xForwardedFor: true }) ?? "unknown" }),
    },
  },
});
