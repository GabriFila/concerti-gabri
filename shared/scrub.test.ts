/* Lo scrubbing di Sentry e PostHog (shared/scrub.ts, traguardo 8): oggetti
   annidati, eccezioni, breadcrumb, URL con query, `cgk_…`, bearer, segreti
   del server e il canarino del controllo fughe. */

import { describe, expect, it } from "vitest";
import { CANARINO, formeCanarino } from "../e2e/helpers/canarino.ts";
import {
  COORDINATE,
  FILTRATO,
  INDIRIZZO,
  scrubBreadcrumb,
  scrubPosthogEvent,
  scrubSentryEvent,
  scrubString,
  scrubValue,
  togliQuerySensibili,
} from "./scrub.ts";

const CGK = "cgk_Ab3dEf6hIj9kLm2nOp5qRs8tUv1w";
const OPACO = "Zq8sK2mN4pR6tV9xB1dF3hJ5lA7cE0gI"; // 32 caratteri a-zA-Z0-9, come un token di sessione
const PROFILE_ID = "kn75x1501dehset091e3w1yr318gp8fh"; // un id Convex: resta

/** Nessuna forma del canarino nel testo. */
function senzaCanarino(v: unknown) {
  const text = JSON.stringify(v);
  for (const forma of formeCanarino()) expect(text, forma).not.toContain(forma);
}

describe("stringhe", () => {
  it("coordinate: coppie con punto, virgola, spazi e la notazione [lng,lat]", () => {
    expect(scrubString("partenza 44.4123456, 8.9345678 ok")).toBe(`partenza ${COORDINATE} ok`);
    expect(scrubString("[8.93456,44.41234]")).toBe(`[${COORDINATE}]`);
    expect(scrubString("44,4123456 8,9345678")).toBe(COORDINATE);
    expect(scrubString("lat: 44.4123 e lng=8,9345")).toBe(`${COORDINATE} e ${COORDINATE}`);
    expect(scrubString("44,4123456, 8,9345678")).toBe(`${COORDINATE}, ${COORDINATE}`);
  });

  it("coordinate sole, con 4 o più decimali, anche in un JSON con chiavi qualunque", () => {
    expect(scrubString("valore 44.4123456 fuori intervallo")).toBe(`valore ${COORDINATE} fuori intervallo`);
    expect(scrubString("Value: 8.9345678")).toBe(`Value: ${COORDINATE}`);
    expect(scrubString("-0.1275, poi 8,9346")).toBe(`${COORDINATE}, poi ${COORDINATE}`);
    expect(scrubString('{"homeLat":44.4123456,"homeLng":8.9345678}')).toBe(`{"homeLat":${COORDINATE},"homeLng":${COORDINATE}}`);
    // ogni forma del canarino, da sola
    for (const forma of formeCanarino().filter(f => /^\d+[.,]\d+$/.test(f))) expect(scrubString(`x ${forma} y`), forma).toBe(`x ${COORDINATE} y`);
  });

  it("numeri qualunque restano: prezzi, km, versioni, orari", () => {
    const restano = [
      "€ 45.50", "km 127", "v1.438.13", "alle 21.30", "3.375 euro", "80 concerti, 11 in programma",
      "Chrome/130.0.6723.58", "alle 21:30:00.123456", "1234.5678 ms", "200.12345", "km 1,234, 2,345",
    ];
    for (const s of restano) expect(scrubString(s)).toBe(s);
  });

  it("indirizzi con civico, nei due ordini", () => {
    expect(scrubString(`geocoding fallito per ${CANARINO.indirizzo}`)).toBe(`geocoding fallito per ${INDIRIZZO}, Genova`);
    expect(scrubString("Corso Buenos Aires 12/b, Milano")).toBe(`${INDIRIZZO}, Milano`);
    expect(scrubString(CANARINO.displayName)).not.toContain("Canarini");
    // senza civico non è un indirizzo
    expect(scrubString("scritto via Oracolo")).toBe("scritto via Oracolo");
  });

  it("cgk_, bearer e token opachi; gli id Convex e gli uuid restano", () => {
    expect(scrubString(`chiave ${CGK} rifiutata`)).toBe(`chiave ${FILTRATO} rifiutata`);
    expect(scrubString(`Authorization: Bearer ${OPACO}`)).toBe(`Authorization: Bearer ${FILTRATO}`);
    expect(scrubString(`sessione ${OPACO}`)).toBe(`sessione ${FILTRATO}`);
    expect(scrubString(`profilo ${PROFILE_ID}`)).toBe(`profilo ${PROFILE_ID}`);
    const uuid = "0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b";
    expect(scrubString(uuid)).toBe(uuid);
    expect(scrubString("useSuspenseQueryWithConvexHttpClient")).toBe("useSuspenseQueryWithConvexHttpClient");
  });

  it("i segreti del server, anche URL-encoded", () => {
    const segreto = "s3gr3to+server/ABC==";
    const out = scrubString(`x=${segreto}&y=${encodeURIComponent(segreto)}`, { segreti: [segreto, "corto"] });
    expect(out).not.toContain(segreto);
    expect(out).not.toContain(encodeURIComponent(segreto));
    expect(out).toContain(FILTRATO);
  });

  it("query string e frammento tolti solo sui percorsi sensibili", () => {
    expect(togliQuerySensibili("https://concerti.gabrifila.me/autorizza?consent_code=abc&client_id=x")).toBe("https://concerti.gabrifila.me/autorizza");
    expect(togliQuerySensibili("/accedi?next=/gabrifila/modifica#partenze")).toBe("/accedi");
    expect(togliQuerySensibili("vai a /api/auth/callback/google?code=4/0Ab&state=xyz ora")).toBe("vai a /api/auth/callback/google ora");
    expect(togliQuerySensibili("/gabrifila?chat=abc123")).toBe("/gabrifila?chat=abc123");
    expect(togliQuerySensibili("/accedibile?x=1")).toBe("/accedibile?x=1");
  });
});

describe("oggetti annidati", () => {
  it("chiavi di luogo e di credenziali a qualunque profondità", () => {
    const out = scrubValue({
      ok: "Fabrique",
      partenza: { name: "Casa Genova", address: CANARINO.indirizzo, lat: CANARINO.lat, lng: CANARINO.lng },
      candidati: [{ label: CANARINO.displayName, lng: CANARINO.lng, lat: CANARINO.lat }],
      geocode: { display_name: CANARINO.displayName },
      headers: { Authorization: `Bearer ${OPACO}`, "x-api-key": CGK, Cookie: "better-auth.session_token=abc" },
      args: { agentToken: CGK, input: { indirizzo: CANARINO.indirizzo } },
      centro: [CANARINO.lng, CANARINO.lat],
      prezzi: [45, 50],
    });
    expect(out.ok).toBe("Fabrique");
    expect(out.partenza).toEqual({ name: "Casa Genova", address: FILTRATO, lat: FILTRATO, lng: FILTRATO });
    expect(out.candidati).toBe(FILTRATO);
    expect(out.geocode).toBe(FILTRATO);
    expect(out.headers).toEqual({ Authorization: FILTRATO, "x-api-key": FILTRATO, Cookie: FILTRATO });
    expect(out.args).toEqual({ agentToken: FILTRATO, input: { indirizzo: FILTRATO } });
    expect(out.centro).toBe(COORDINATE);
    expect(out.prezzi).toEqual([45, 50]);
    senzaCanarino(out);
    expect(JSON.stringify(out)).not.toContain("cgk_");
  });

  it("chiavi di luogo anche come parola del nome (camelCase, _ e -)", () => {
    const out = scrubValue({
      homeLat: CANARINO.lat,
      latLng: { a: 1 },
      indirizzoCasa: "Casa",
      home_address: "x",
      "geo-point": "y",
      // restano: parole diverse, "long" solo come chiave intera, geoip di PostHog
      longTask: 3,
      platform: "web",
      latency: 12,
      $geoip_disable: true,
    });
    expect(out).toEqual({
      homeLat: FILTRATO, latLng: FILTRATO, indirizzoCasa: FILTRATO, home_address: FILTRATO, "geo-point": FILTRATO,
      longTask: 3, platform: "web", latency: 12, $geoip_disable: true,
    });
  });

  it("non modifica l'originale e sopporta i cicli", () => {
    const a: Record<string, unknown> = { address: "x" };
    a.self = a;
    const out = scrubValue(a);
    expect(a.address).toBe("x");
    expect(out.address).toBe(FILTRATO);
    expect(out.self).toBe(FILTRATO);
  });
});

describe("Sentry", () => {
  const evento = () => ({
    event_id: "4a3c9f0e1b2d4c6a8e0f1a2b3c4d5e6f",
    message: `fallito ${CANARINO.lat}, ${CANARINO.lng}`,
    exception: {
      values: [{
        type: "ConvexError",
        value: `indirizzo ${CANARINO.indirizzo} non valido; token ${CGK}`,
        stacktrace: { frames: [{ filename: "/assets/index-BvX3k9aQ.js", function: "conferma", lineno: 1, vars: { address: CANARINO.indirizzo, k: OPACO } }] },
      }],
    },
    request: {
      url: "https://concerti.gabrifila.me/accedi?next=/x&code=abc",
      query_string: "next=/x",
      headers: { "User-Agent": "x", Authorization: `Bearer ${OPACO}` },
      cookies: { tema: "dark" },
      data: { address: CANARINO.indirizzo },
      env: { REMOTE_ADDR: "203.0.113.7" },
    },
    user: { id: PROFILE_ID, ip_address: "203.0.113.7" },
    extra: { candidates: [{ lat: CANARINO.lat, lng: CANARINO.lng }] },
    contexts: { trace: { trace_id: "a".repeat(32) } },
    tags: { route: "/gabrifila/modifica" },
    breadcrumbs: [
      { category: "console", message: CANARINO.indirizzo },
      { category: "navigation", data: { from: "/gabrifila", to: "/autorizza?consent_code=xyz&state=abc" } },
      { category: "fetch", data: { url: "/api/auth/get-session?token=abc", method: "GET" } },
    ],
  });

  it("evento: niente utente, richiesta senza cookie/header/corpo/query, frame senza variabili", () => {
    const out = scrubSentryEvent(evento()) as any;
    expect(out.user).toBeUndefined();
    expect(out.request).toEqual({ url: "https://concerti.gabrifila.me/accedi" });
    expect(out.exception.values[0].stacktrace.frames[0]).toEqual({ filename: "/assets/index-BvX3k9aQ.js", function: "conferma", lineno: 1 });
    expect(out.exception.values[0].value).toBe(`indirizzo ${INDIRIZZO}, Genova non valido; token ${FILTRATO}`);
    expect(out.message).toBe(`fallito ${COORDINATE}`);
    expect(out.extra.candidates).toBe(FILTRATO);
    expect(out.event_id).toBe("4a3c9f0e1b2d4c6a8e0f1a2b3c4d5e6f");
    expect(out.contexts.trace.trace_id).toBe("a".repeat(32));
    expect(out.breadcrumbs.map((b: any) => b.category)).toEqual(["navigation", "fetch"]);
    expect(out.breadcrumbs[0].data.to).toBe("/autorizza");
    expect(out.breadcrumbs[1].data.url).toBe("/api/auth/get-session");
    senzaCanarino(out);
    const text = JSON.stringify(out);
    for (const no of ["203.0.113.7", "cgk_", OPACO, "consent_code", "code=abc", '"vars"']) expect(text, no).not.toContain(no);
  });

  it("l'URL della richiesta perde query e frammento anche fuori dai percorsi sensibili", () => {
    const out = scrubSentryEvent({ request: { url: "https://concerti.gabrifila.me/gabrifila?token=abc#sec-mappa" } }) as any;
    expect(out.request).toEqual({ url: "https://concerti.gabrifila.me/gabrifila" });
  });

  it("un'eccezione con un segreto del server nel messaggio", () => {
    const segreto = "chat-server-secret-di-prova-0123456789";
    const out = scrubSentryEvent({ exception: { values: [{ value: `401 con ${segreto}` }] } }, { segreti: [segreto] }) as any;
    expect(out.exception.values[0].value).toBe(`401 con ${FILTRATO}`);
  });

  it("breadcrumb: console e ui.input eliminati, i click senza valori degli attributi", () => {
    expect(scrubBreadcrumb({ category: "console", message: "x" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "input[name=\"indirizzo\"]" })).toBeNull();
    const click = scrubBreadcrumb({ category: "ui.click", message: `main > button.chip[title="${CANARINO.indirizzo}"][aria-label='Correggi']` });
    expect(click?.message).toBe("main > button.chip[title][aria-label]");
    const nav = scrubBreadcrumb({ category: "navigation", data: { from: "/x", to: "/accedi?next=/y" } });
    expect(nav?.data).toEqual({ from: "/x", to: "/accedi" });
  });

  it("metadati interni dell'SDK lasciati com'erano (istanze di classi comprese)", () => {
    class Scope { tag = "address"; }
    const scope = new Scope();
    const out = scrubSentryEvent({ sdkProcessingMetadata: { capturedSpanScope: scope } }) as any;
    expect(out.sdkProcessingMetadata.capturedSpanScope).toBe(scope);
  });
});

describe("PostHog", () => {
  it("pageview: query sensibili tolte, token del progetto e id restano", () => {
    const ev = {
      uuid: "0192f3c4-5d6e-7f80-9a1b-2c3d4e5f6a7b",
      event: "$pageview",
      properties: {
        token: "phc_AbCdEf0123456789GhIjKlMnOpQrStUvWx",
        distinct_id: PROFILE_ID,
        $current_url: "https://concerti.gabrifila.me/accedi?next=/gabrifila/modifica",
        $referrer: "https://concerti.gabrifila.me/autorizza?consent_code=abc",
        $pathname: "/accedi",
        $host: "concerti.gabrifila.me",
        titolo: `Partenza ${CANARINO.indirizzo}`,
      },
      $set: { address: CANARINO.indirizzo },
    };
    const out = scrubPosthogEvent(ev) as any;
    expect(out.properties.token).toBe(ev.properties.token);
    expect(out.properties.distinct_id).toBe(PROFILE_ID);
    expect(out.properties.$current_url).toBe("https://concerti.gabrifila.me/accedi");
    expect(out.properties.$referrer).toBe("https://concerti.gabrifila.me/autorizza");
    expect(out.uuid).toBe(ev.uuid);
    expect(out.$set.address).toBe(FILTRATO);
    senzaCanarino(out);
    // l'originale non cambia
    expect(ev.properties.$current_url).toContain("?next=");
  });

  it("null resta null (evento scartato da un before_send precedente)", () => {
    expect(scrubPosthogEvent(null)).toBeNull();
  });
});
