import { createFileRoute } from "@tanstack/react-router";
import { handleMetadatiRisorsa } from "../../../server/mcp/metadati.ts";
import { envDelProcesso } from "../../../server/mcp/origine.ts";

/* Metadati della risorsa protetta /mcp (RFC 9728), con il suffisso del path:
   è l'URL che /mcp indica nel WWW-Authenticate dei 401. */
export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
  server: {
    handlers: {
      ANY: ({ request }) => handleMetadatiRisorsa(request, envDelProcesso()),
    },
  },
});
