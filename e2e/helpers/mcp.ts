/* Chiamate JSON-RPC a /mcp dai test (traguardo 7), col fetch di Node
   (helpers/http.ts): una richiesta stateless per chiamata, come un client
   2025 (`initialize` non serve: il server è stateless). La risposta può
   essere JSON o SSE: qui si legge il primo messaggio. */

import { http, type HttpResponse } from "./http.ts";

export interface RispostaMcp {
  res: HttpResponse;
  /** Il messaggio JSON-RPC (o il corpo JSON per gli errori HTTP). */
  corpo: any;
  testo: string;
}

let id = 1;

/** POST /mcp con un metodo JSON-RPC. */
export async function rpcMcp(baseURL: string | undefined, method: string, params: Record<string, unknown>, headers: Record<string, string> = {}): Promise<RispostaMcp> {
  const res = await http(new URL("/mcp", baseURL).href, {
    method: "POST",
    headers: { accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...headers },
    data: { jsonrpc: "2.0", id: id++, method, params },
  });
  const testo = await res.text();
  const dati = testo.trimStart().startsWith("{") ? testo : (testo.split("\n").find(l => l.startsWith("data:"))?.slice(5).trim() ?? "null");
  return { res, corpo: JSON.parse(dati), testo };
}

/** tools/call con una API key: il risultato dello strumento già letto dal JSON del blocco di testo. */
export async function strumento(baseURL: string | undefined, chiave: string, name: string, args: Record<string, unknown> = {}) {
  const r = await rpcMcp(baseURL, "tools/call", { name, arguments: args }, { "x-api-key": chiave });
  const result = r.corpo?.result;
  return { ...r, isError: !!result?.isError, dati: result ? JSON.parse(result.content[0].text) : undefined };
}
