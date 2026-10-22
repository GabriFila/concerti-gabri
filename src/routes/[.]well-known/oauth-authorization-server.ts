import { createFileRoute } from "@tanstack/react-router";
import { handleMetadatiAs } from "../../server/mcp/metadati.ts";

/* Metadati del server di autorizzazione (RFC 8414) per i client MCP: quelli
   di Better Auth sul sito Convex, corretti in src/server/mcp/metadati.ts. */
export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
  server: {
    handlers: {
      ANY: ({ request }) => handleMetadatiAs(request, import.meta.env.VITE_CONVEX_SITE_URL),
    },
  },
});
