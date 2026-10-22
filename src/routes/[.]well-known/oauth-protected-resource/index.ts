import { createFileRoute } from "@tanstack/react-router";
import { handleMetadatiRisorsa } from "../../../server/mcp/metadati.ts";
import { envDelProcesso } from "../../../server/mcp/origine.ts";

/* Metadati della risorsa protetta /mcp (RFC 9728), anche senza suffisso. */
export const Route = createFileRoute("/.well-known/oauth-protected-resource/")({
  server: {
    handlers: {
      ANY: ({ request }) => handleMetadatiRisorsa(request, envDelProcesso()),
    },
  },
});
