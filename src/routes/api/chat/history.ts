import { createFileRoute } from "@tanstack/react-router";
import { handleChatHistory } from "../../../server/oracolo/handler.ts";

/* Storico dell'Oracolo: 503 fino al traguardo 6 (le conversazioni passano a Convex).
   ANY: ogni metodo arriva all'handler, che risponde 405 a tutto ciò che non è GET
   (senza, un POST cadrebbe nel renderer delle pagine con un 200 vuoto). */
export const Route = createFileRoute("/api/chat/history")({
  server: {
    handlers: {
      ANY: ({ request }) => handleChatHistory(request),
    },
  },
});
