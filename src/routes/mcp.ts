import { createFileRoute } from "@tanstack/react-router";
import { handleMcp } from "../server/mcp/handler.ts";

/* Il server MCP degli agenti (PIANO traguardo 7): la logica sta in
   src/server/mcp/. ANY: ogni metodo arriva all'handler, che risponde solo a
   POST e dà 405 al resto (GET e DELETE compresi: il server è stateless);
   senza, un metodo non registrato cadrebbe nel renderer delle pagine. */
export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      ANY: ({ request }) => handleMcp(request),
    },
  },
});
