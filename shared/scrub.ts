/* ──────────────────────────────────────────────────────────────
   Scrubbing di Sentry e PostHog (PIANO §1.12, §1.25, traguardo 8).

   Indirizzi, coordinate, token e segreti non devono arrivare a nessuno dei
   due. Questo modulo è puro e isomorfo: lo usano `beforeSend` e
   `beforeBreadcrumb` di Sentry (client e server) e `before_send` di
   PostHog. Il server passa in più i VALORI dei propri segreti (`segreti`),
   letti dal suo ambiente: qui non si legge mai un ambiente.

   Cosa fa, a qualunque profondità:
   - chiavi di luogo (address, indirizzo, lat, lng, lon, coords, geo…,
     anche come parola del nome: homeLat, latLng, indirizzoCasa) e di
     credenziali (token, secret, authorization, cookie, x-api-key…) →
     "[Filtered]", qualunque cosa contengano;
   - nelle stringhe: coppie che sembrano coordinate e numeri singoli con 4
     o più decimali entro ±180 → "[coords]"; vie con
     numero civico ("Via dei Canarini 7") → "[indirizzo]"; `cgk_…`, `Bearer
     …` e i token opachi (24+ caratteri con maiuscole, minuscole e cifre) →
     "[Filtered]"; i valori dei segreti del server → "[Filtered]";
   - query string e frammento degli URL di /autorizza, /accedi e /api/auth
     (consent_code, code, state, next) tolti;
   - coppie di numeri con più di tre decimali ([lng, lat]) → "[coords]".
   Sentry: niente `user` (nemmeno l'IP), niente cookie, header, corpo o
   query della richiesta (l'URL resta senza query né frammento, su ogni
   percorso), niente variabili dei frame; breadcrumb `console`
   e `ui.input` eliminati, valori degli attributi nei selettori dei click
   tolti. PostHog: tutto come sopra, tranne `properties.token` (la chiave
   pubblica del progetto, senza la quale l'evento non arriva).

   Meglio togliere troppo che troppo poco: un falso positivo costa un pezzo
   di messaggio, un falso negativo un indirizzo in un servizio esterno.
   ────────────────────────────────────────────────────────────── */

export const FILTRATO = "[Filtered]";
export const COORDINATE = "[coords]";
export const INDIRIZZO = "[indirizzo]";

export interface OpzioniScrub {
  /** Valori da oscurare ovunque compaiano (solo lato server: i suoi segreti). */
  segreti?: readonly string[];
}

/* ── chiavi ─────────────────────────────────────────────────────── */

/** Luoghi: il valore sparisce tutto, qualunque sia la forma. */
const CHIAVE_LUOGO =
  /^(?:address(?:es)?|indirizz[oi]|street|lat|lng|lon|long|latitude|longitude|latitudine|longitudine|coords?|coordinates?|coordinate|geo\w*|candidates?|candidati|etichetta|display_name)$/i;
/** Luoghi anche come parola del nome (homeLat, latLng, indirizzoCasa, home_address); non "long" (longTask…). */
const PAROLA_LUOGO = /^(?:address(?:es)?|indirizz[oi]|street|lat|lng|lon|latitude|longitude|latitudine|longitudine|coords?|coordinates?|coordinate|geo|geocod\w*)$/i;
/** Le parole di un nome: separatori qualunque e camelCase. */
const paroleDellaChiave = (k: string) => k.split(/[^\p{L}\d]+|(?<=[\p{Ll}\d])(?=\p{Lu})/u);
/** Credenziali: anche come parte del nome (agentToken, x-api-key, set-cookie…). */
const CHIAVE_SEGRETA = /token|secret|passw|authoriz|cookie|api[-_]?key|credential|signature/i;

const chiaveFiltrata = (k: string) =>
  CHIAVE_LUOGO.test(k) || CHIAVE_SEGRETA.test(k) || paroleDellaChiave(k).some(p => PAROLA_LUOGO.test(p));

/* ── stringhe ───────────────────────────────────────────────────── */

// due numeri decimali con almeno 3 cifre dopo il punto, separati da virgola,
// punto e virgola o spazi ("44.4123456, 8.9345678", "[8.93456,44.41234]")
const COPPIA_PUNTO = /-?\d{1,3}\.\d{3,}\s*[,;\s]\s*-?\d{1,3}\.\d{3,}/g;
// la stessa coppia con la virgola decimale ("44,4123456 8,9345678")
const COPPIA_VIRGOLA = /-?\d{1,3},\d{3,}\s*[;\s]\s*-?\d{1,3},\d{3,}/g;
// una coordinata sola, ma dichiarata ("lat: 44.41234", "lng=8,93")
const COORD_DICHIARATA = /\b(?:lat|lng|lon|latitud\w*|longitud\w*)\b["']?\s*[:=]?\s*-?\d{1,3}[.,]\d+/gi;
// una coordinata sola qualunque: 4 o più decimali (11 m), con punto o virgola,
// non dentro una versione, un orario o un identificativo ("8.9346", "44,4123456",
// '{"homeLat":44.4123456}'); il limite ±180 lo controlla `coordinataSola`
const COORD_SOLA = /(?<![\w.]|\d:)-?\d{1,3}[.,]\d{4,}(?!\w|\.\d)/g;
const coordinataSola = (m: string) => (Math.abs(Number(m.replace(",", "."))) <= 180 ? COORDINATE : m);

const ODONIMI =
  "via|viale|vicolo|vico|piazza|piazzale|piazzetta|corso|largo|strada|salita|discesa|lungomare|lungotevere|località|borgo|contrada|calata|traversa|rampa|frazione|street|avenue|road";
const PAROLA = "[\\p{L}'’.-]+";
// "Via dei Canarini 7", "corso Buenos Aires 12/b": odonimo, fino a 5 parole, civico
const VIA_CIVICO = new RegExp(`(?<!\\p{L})(?:${ODONIMI})\\s+(?:${PAROLA}\\s+){0,5}\\d+[a-z]?(?:\\/[a-z0-9]+)?(?!\\p{L})`, "giu");
// "7, Vico dei Canarini" (l'ordine del display_name di Nominatim)
const CIVICO_VIA = new RegExp(`\\d+[a-z]?,\\s*(?:${ODONIMI})\\s+${PAROLA}(?:\\s+${PAROLA}){0,4}`, "giu");

const CGK = /cgk_[A-Za-z0-9_-]+/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi;
// candidati token opachi: base64url di almeno 24 caratteri (il controllo vero è sotto)
const OPACO = /[A-Za-z0-9_-]{24,}/g;
const sembraToken = (s: string) => /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);

// /autorizza, /accedi, /api/auth (anche assoluti e con sottopercorsi): via
// tutto quello che viene dopo ? o #
const URL_SENSIBILE = /((?:[a-z][a-z0-9+.-]*:\/\/[^\s/?#"'<>]+)?\/(?:autorizza|accedi|api\/auth)(?:\/[^\s?#"'<>]*)?)[?#][^\s"'<>]*/gi;

/** Toglie query string e frammento dagli URL di /autorizza, /accedi e /api/auth. */
export function togliQuerySensibili(s: string): string {
  return s.replace(URL_SENSIBILE, "$1");
}

/** Una stringa ripulita da segreti, token, coordinate, indirizzi e query sensibili. */
export function scrubString(s: string, opts: OpzioniScrub = {}): string {
  let out = s;
  for (const segreto of opts.segreti ?? []) {
    if (segreto.length < 8) continue;
    for (const forma of new Set([segreto, encodeURIComponent(segreto)])) out = out.split(forma).join(FILTRATO);
  }
  out = togliQuerySensibili(out)
    .replace(CGK, FILTRATO)
    .replace(BEARER, `$1 ${FILTRATO}`)
    .replace(OPACO, m => (sembraToken(m) ? FILTRATO : m))
    .replace(COPPIA_PUNTO, COORDINATE)
    .replace(COPPIA_VIRGOLA, COORDINATE)
    .replace(COORD_DICHIARATA, COORDINATE)
    .replace(COORD_SOLA, coordinataSola)
    .replace(CIVICO_VIA, INDIRIZZO)
    .replace(VIA_CIVICO, INDIRIZZO);
  return out;
}

/* ── valori annidati ────────────────────────────────────────────── */

const decimaliOltre3 = (n: number) => Number.isFinite(n) && Math.abs(n) <= 180 && Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6;

const isPlain = (v: object) => {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

// metadati interni dell'SDK di Sentry (scope, richieste): non partono mai e
// contengono istanze di classi che non vanno ricopiate
const NON_TOCCARE = new Set(["sdkProcessingMetadata"]);

function walk(v: unknown, opts: OpzioniScrub, depth: number, seen: WeakSet<object>): unknown {
  if (typeof v === "string") return scrubString(v, opts);
  if (v === null || typeof v !== "object") return v;
  if (depth > 24 || seen.has(v)) return FILTRATO;
  if (Array.isArray(v)) {
    if (v.length === 2 && v.every(n => typeof n === "number") && v.some(n => decimaliOltre3(n as number))) return COORDINATE;
    seen.add(v);
    return v.map(x => walk(x, opts, depth + 1, seen));
  }
  if (!isPlain(v)) return v;
  seen.add(v);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (NON_TOCCARE.has(k)) out[k] = x;
    else if (chiaveFiltrata(k)) out[k] = x === undefined ? x : FILTRATO;
    else out[k] = walk(x, opts, depth + 1, seen);
  }
  return out;
}

/** Copia ripulita di un valore qualunque (oggetti semplici e array; il resto resta com'è). */
export function scrubValue<T>(v: T, opts: OpzioniScrub = {}): T {
  return walk(v, opts, 0, new WeakSet()) as T;
}

/* ── Sentry ─────────────────────────────────────────────────────── */

type Bag = Record<string, unknown>;

/** I breadcrumb che non partono mai: console (log con dati qualunque) e ui.input (tasti premuti). */
const BREADCRUMB_VIETATI = new Set(["console", "ui.input"]);

/** `beforeBreadcrumb`: null per quelli da eliminare, altrimenti la copia ripulita. */
export function scrubBreadcrumb<B extends object>(crumb: B, opts: OpzioniScrub = {}): B | null {
  const category = (crumb as Bag).category;
  if (typeof category === "string" && BREADCRUMB_VIETATI.has(category)) return null;
  const out = scrubValue(crumb, opts) as Bag;
  // il selettore di un click porta i valori degli attributi (title, aria-label,
  // alt, name…): restano solo i nomi
  if (typeof category === "string" && category.startsWith("ui.") && typeof out.message === "string") {
    out.message = out.message.replace(/\[([\w:-]+)=(?:"[^"]*"|'[^']*'|[^\]]*)\]/g, "[$1]");
  }
  return out as B;
}

/** `beforeSend` di Sentry: l'evento ripulito, senza utente né dati della richiesta. */
export function scrubSentryEvent<E extends object>(event: E, opts: OpzioniScrub = {}): E {
  const out = scrubValue(event, opts) as Bag;
  delete out.user;
  const request = out.request as Bag | undefined;
  if (request && typeof request === "object") {
    for (const k of ["cookies", "headers", "data", "query_string", "env"]) delete request[k];
    // l'URL della pagina o della richiesta: senza query né frammento, su ogni percorso
    if (typeof request.url === "string") request.url = request.url.replace(/[?#][\s\S]*$/, "");
  }
  // le variabili locali dei frame (stackFrameVariables è già spento: doppia cintura)
  const exceptions = (out.exception as Bag | undefined)?.values;
  if (Array.isArray(exceptions)) {
    for (const ex of exceptions as Bag[]) {
      const frames = (ex?.stacktrace as Bag | undefined)?.frames;
      if (Array.isArray(frames)) for (const f of frames as Bag[]) if (f && typeof f === "object") delete f.vars;
    }
  }
  const crumbs = out.breadcrumbs;
  if (Array.isArray(crumbs)) {
    // già ripuliti dal walk: qui si tolgono solo i vietati (beforeBreadcrumb li ha già scartati
    // all'origine, ma un breadcrumb aggiunto a mano allo scope passa solo di qui)
    out.breadcrumbs = crumbs.filter(c => !(c && typeof c === "object" && BREADCRUMB_VIETATI.has(String((c as Bag).category))));
  }
  return out as E;
}

/* ── PostHog ────────────────────────────────────────────────────── */

/** `before_send` di PostHog: l'evento ripulito; `properties.token` (chiave pubblica del progetto) resta. */
export function scrubPosthogEvent<E extends object>(event: E | null): E | null {
  if (!event) return event;
  const props = (event as Bag).properties as Bag | undefined;
  if (!props || typeof props !== "object") return scrubValue(event);
  const { token, ...resto } = props;
  const out = scrubValue({ ...event, properties: resto }) as Bag;
  if (token !== undefined) (out.properties as Bag).token = token;
  return out as E;
}
