/* Le richieste HTTP dei test senza browser (http, tema, oracolo-sse).

   Usano il fetch di Node e non il `request` di Playwright: Playwright scrive
   ogni header della richiesta (e i Set-Cookie della risposta) nel "Call log"
   dei suoi errori, e sulla preview tra quegli header c'è il bypass di Vercel
   (helpers/bypass.ts). Il fetch di Node negli errori non mette gli header, e
   qui ogni errore esce comunque col segreto oscurato.

   - I redirect non si seguono mai (redirect: "manual"): i test li guardano
     da sé, e il bypass non viaggia su un redirect.
   - La risposta imita quella di Playwright (status(), headers(), text(),
     json()), con il corpo già letto. */

import { bypassHeaders, describeError } from "./bypass.ts";

export interface HttpResponse {
  status(): number;
  /** Header con i nomi in minuscolo. */
  headers(): Record<string, string>;
  text(): Promise<string>;
  json(): Promise<any>;
}

export interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Corpo JSON (imposta content-type se manca). */
  data?: unknown;
  /** Millisecondi, corpo compreso (predefinito 30 s). */
  timeout?: number;
}

/** Una richiesta verso `url` (locale o preview), senza seguire redirect. */
export async function http(url: string, opts: HttpOptions = {}): Promise<HttpResponse> {
  const headers: Record<string, string> = { ...opts.headers, ...bypassHeaders(url) };
  let body: string | undefined;
  if (opts.data !== undefined) {
    body = JSON.stringify(opts.data);
    if (!Object.keys(headers).some(h => h.toLowerCase() === "content-type")) headers["content-type"] = "application/json";
  }
  const method = opts.method ?? (body === undefined ? "GET" : "POST");
  let res!: Response;
  let text!: string;
  for (let tentativo = 1; ; tentativo++) {
    try {
      res = await fetch(url, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(opts.timeout ?? 30_000) });
      text = await res.text();
      break;
    } catch (err) {
      // una connessione keep-alive che il server ha chiuso mentre il test era
      // fermo in un execFileSync (convexRun): un GET si ripete una volta
      const codice = (err as { cause?: { code?: string } }).cause?.code;
      const socketChiuso = codice === "UND_ERR_SOCKET" || codice === "ECONNRESET";
      if (tentativo === 1 && socketChiuso && (method === "GET" || method === "HEAD")) continue;
      throw new Error(`${method} ${url}: ${describeError(err)}`);
    }
  }
  const hdrs = Object.fromEntries(res.headers);
  return {
    status: () => res.status,
    headers: () => hdrs,
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}
