/* ──────────────────────────────────────────────────────────────
   POST /mcp (PIANO traguardo 7, SDK @modelcontextprotocol/server 2.3.1).

   1. solo POST: GET e DELETE (sessioni del 2025) → 405, come ogni altro metodo;
   2. Origin: se c'è, deve essere un'origine ammessa nell'ambiente (§1.8);
   3. `x-api-key: cgk_…` → `Authorization: Bearer cgk_…`;
   4. requireBearerAuth con `agents:introspect` (API key o token OAuth,
      scope `concerti`); senza token valido 401 con `WWW-Authenticate` e il
      link ai metadati della risorsa, così il client scopre il login OAuth;
   5. handler stateless (`legacy: 'stateless'` serve anche i client 2025):
      un server MCP nuovo per richiesta, con gli strumenti del catalogo che
      chiamano Convex col token dell'agente. Convex riverifica il token a
      ogni chiamata.
   Ogni errore fuori dal JSON-RPC è `{code, messaggio}` (§1.25); un client
   Convex per richiesta, mai di modulo (§1.7).
   ────────────────────────────────────────────────────────────── */

import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import {
  createMcpHandler, McpServer, OAuthError, OAuthErrorCode, requireBearerAuth, type AuthInfo,
} from "@modelcontextprotocol/server";
import { SCOPE_CONCERTI } from "../../../shared/agent/mcp.ts";
import { convexUrl } from "../../lib/convexUrl.ts";
import { originOk } from "../oracolo/origins.ts";
import { rispostaErrore } from "./errori.ts";
import { NON_ANCORA_DISPONIBILI, tipoFunzione } from "./funzioni.ts";
import { envDelProcesso, origineCanonica, urlMetadatiRisorsa, type McpEnv } from "./origine.ts";
import { ISTRUZIONI_MCP, registraStrumenti, type Chiamata } from "./strumenti.ts";

/** Il corpo più grande accettato (l'import arriva fino a 500 KB di contenuto). */
export const MAX_CORPO = 1_000_000;

/** Quel che serve di un client Convex (ConvexHttpClient, o un finto nei test). */
export interface ClientConvex {
  query(ref: FunctionReference<"query">, args: Record<string, unknown>): Promise<unknown>;
  mutation(ref: FunctionReference<"mutation">, args: Record<string, unknown>): Promise<unknown>;
  action(ref: FunctionReference<"action">, args: Record<string, unknown>): Promise<unknown>;
}

export interface DipendenzeMcp {
  env: McpEnv;
  /** Un client Convex nuovo per questa richiesta. */
  client: () => ClientConvex;
}

const predefinite = (): DipendenzeMcp => ({
  env: envDelProcesso(),
  client: () => new ConvexHttpClient(convexUrl(), { logger: false }) as unknown as ClientConvex,
});

interface Introspezione {
  via: "apikey" | "mcp";
  clientId?: string;
  scopes: string[];
  expiresAt?: number;
}

/** Il verificatore dei token per requireBearerAuth: chiede a Convex, non ripete mai il token. */
export function verificatore(client: ClientConvex) {
  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      const r = (await client.query(makeFunctionReference<"query">("agents:introspect"), { agentToken: token })) as Introspezione | null;
      if (!r) throw new OAuthError(OAuthErrorCode.InvalidToken, "token non valido, revocato o scaduto");
      // l'SDK vuole una scadenza (in secondi): una API key senza scadenza vale per questa richiesta
      const scade = r.expiresAt ?? Date.now() + 3600_000;
      return { token, clientId: r.clientId ?? r.via, scopes: r.scopes, expiresAt: Math.floor(scade / 1000), extra: { via: r.via } };
    },
  };
}

/** Le chiamate degli strumenti: la funzione del catalogo, col token dell'agente. */
export function chiamataConvex(client: ClientConvex, token: string): Chiamata {
  return async (op, input) => {
    if (NON_ANCORA_DISPONIBILI.has(op.name)) {
      throw new ConvexError({ code: "non_disponibile", messaggio: "operazione non ancora disponibile su questo server" });
    }
    const args = { agentToken: token, input: input ?? {} };
    switch (tipoFunzione(op)) {
      case "query":
        return await client.query(makeFunctionReference<"query">(op.funzione), args);
      case "mutation":
        return await client.mutation(makeFunctionReference<"mutation">(op.funzione), args);
      case "action":
        return await client.action(makeFunctionReference<"action">(op.funzione), args);
    }
  };
}

/** Un server MCP per una richiesta, con gli strumenti del catalogo. */
export function creaServer(chiama: Chiamata, origine: string): McpServer {
  const server = new McpServer({ name: "concerti", version: "1.0.0" }, { instructions: ISTRUZIONI_MCP, capabilities: { tools: {} } });
  registraStrumenti(server, chiama, origine);
  return server;
}

/** La risposta di requireBearerAuth (OAuth JSON) con il corpo `{code, messaggio}` e lo stesso challenge. */
function rifiuto(res: Response): Response {
  const challenge = res.headers.get("www-authenticate");
  const headers: Record<string, string> = challenge ? { "WWW-Authenticate": challenge, "Access-Control-Expose-Headers": "WWW-Authenticate" } : {};
  if (res.status === 401) return rispostaErrore(401, "unauthorized", "serve un token: collega l'agente con OAuth oppure usa una API key (x-api-key o Authorization: Bearer)", headers);
  if (res.status === 403) return rispostaErrore(403, "unauthorized", `il token non ha lo scope "${SCOPE_CONCERTI}": ricollega l'agente`, headers);
  if (res.status >= 500) return rispostaErrore(503, "non_disponibile", "verifica del token non riuscita: riprova");
  return rispostaErrore(400, "input_non_valido", "intestazione Authorization non valida", headers);
}

export async function handleMcp(request: Request, dip: DipendenzeMcp = predefinite()): Promise<Response> {
  if (request.method !== "POST") {
    return rispostaErrore(405, "non_disponibile", "metodo non ammesso: /mcp risponde solo a POST (server stateless)", { Allow: "POST" });
  }
  if (!originOk(request.headers.get("origin"), dip.env)) {
    return rispostaErrore(403, "unauthorized", "origine non ammessa");
  }
  const lunghezza = Number(request.headers.get("content-length") ?? "0");
  if (lunghezza > MAX_CORPO) return rispostaErrore(413, "input_non_valido", "richiesta troppo grande");
  const corpo = await request.text();
  if (corpo.length > MAX_CORPO) return rispostaErrore(413, "input_non_valido", "richiesta troppo grande");

  // x-api-key → Bearer (gli script e i client con un header fisso)
  const headers = new Headers(request.headers);
  const chiave = headers.get("x-api-key");
  if (chiave && !headers.get("authorization")) headers.set("authorization", `Bearer ${chiave.trim()}`);
  headers.delete("x-api-key");
  const req = new Request(request.url, { method: "POST", headers, body: corpo });

  const origine = origineCanonica(dip.env);
  const client = dip.client();
  const gate = requireBearerAuth({ verifier: verificatore(client), requiredScopes: [SCOPE_CONCERTI], resourceMetadataUrl: urlMetadatiRisorsa(origine) });
  const auth = await gate(req);
  if (auth instanceof Response) return rifiuto(auth);

  // un handler per richiesta: niente stato condiviso tra agenti diversi
  const mcp = createMcpHandler(() => creaServer(chiamataConvex(client, auth.token), origine), { legacy: "stateless", responseMode: "json" });
  const res = await mcp.fetch(req, { authInfo: auth });
  const out = new Headers(res.headers);
  out.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers: out });
}
