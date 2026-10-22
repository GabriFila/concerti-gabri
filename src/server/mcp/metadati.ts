/* ──────────────────────────────────────────────────────────────
   I metadati OAuth per i client MCP (PIANO traguardo 7), dall'origine per
   ambiente (origine.ts), mai dall'header Host:

   - /.well-known/oauth-protected-resource[/mcp] (RFC 9728): `resource` è
     <origine>/mcp, esattamente l'URL che si incolla nel client, e
     `authorization_servers` è l'issuer di Better Auth (= SITE_URL = origine).
   - /.well-known/oauth-authorization-server (RFC 8414): quello di Better
     Auth (sul sito Convex), corretto: mcp() 1.6 pubblica jwks_uri e
     userinfo che non esistono e scope che qui non servono.
   ────────────────────────────────────────────────────────────── */

import { SCOPE_AMMESSI, SCOPE_CONCERTI } from "../../../shared/agent/mcp.ts";
import { rispostaErrore } from "./errori.ts";
import { urlMcp, type McpEnv, origineCanonica } from "./origine.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown) =>
  Response.json(body, { headers: { ...CORS, "Cache-Control": "public, max-age=300" } });

/** Le richieste ammesse sui metadati: GET (e il preflight). */
function metodo(request: Request): Response | null {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" && request.method !== "HEAD") return rispostaErrore(405, "non_disponibile", "metodo non ammesso: usa GET", { ...CORS, Allow: "GET" });
  return null;
}

/** Il documento PRM della risorsa /mcp. */
export function documentoRisorsa(origine: string) {
  return {
    resource: urlMcp(origine),
    authorization_servers: [origine],
    scopes_supported: [SCOPE_CONCERTI],
    bearer_methods_supported: ["header"],
    resource_name: "Concerti",
  };
}

export function handleMetadatiRisorsa(request: Request, env: McpEnv): Response {
  return metodo(request) ?? json(documentoRisorsa(origineCanonica(env)));
}

/** Le voci dei metadati di mcp() 1.6 che non valgono qui (endpoint inesistenti, id_token non verificabile). */
const DA_TOGLIERE = [
  "jwks_uri", "userinfo_endpoint", "id_token_signing_alg_values_supported", "claims_supported",
  "subject_types_supported", "acr_values_supported",
];

/** I metadati di Better Auth, corretti per i client MCP. */
export function correggiMetadatiAs(m: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...m };
  for (const k of DA_TOGLIERE) delete out[k];
  out.scopes_supported = [...SCOPE_AMMESSI];
  out.code_challenge_methods_supported = ["S256"];
  out.response_types_supported = ["code"];
  out.grant_types_supported = ["authorization_code", "refresh_token"];
  return out;
}

export async function handleMetadatiAs(request: Request, convexSiteUrl: string | undefined, fetchFn: typeof fetch = fetch): Promise<Response> {
  const no = metodo(request);
  if (no) return no;
  if (!convexSiteUrl) return rispostaErrore(503, "non_disponibile", "server di autorizzazione non configurato", CORS);
  let m: unknown;
  try {
    const r = await fetchFn(`${convexSiteUrl.replace(/\/+$/, "")}/api/auth/.well-known/oauth-authorization-server`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    m = r.ok ? await r.json() : null;
  } catch {
    m = null;
  }
  if (!m || typeof m !== "object" || typeof (m as { issuer?: unknown }).issuer !== "string") {
    return rispostaErrore(503, "non_disponibile", "server di autorizzazione non raggiungibile: riprova", CORS);
  }
  return json(correggiMetadatiAs(m as Record<string, unknown>));
}
