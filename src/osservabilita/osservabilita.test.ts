/* La configurazione di Sentry e PostHog (traguardo 8): dataCollection tutto
   spento, nei test solo un sink locale, solo errori (niente replay,
   feedback, tracing), PostHog senza cookie e via /ingest. */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DATA_COLLECTION, dsnSentry } from "./sentry.ts";

const SRC = join(import.meta.dirname, "..");

function sorgenti(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return sorgenti(p);
    return /\.(tsx?|mjs)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("Sentry", () => {
  it("dataCollection: niente utente, cookie, header, corpi, query, variabili, AI, DB", () => {
    expect(DATA_COLLECTION).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    });
  });

  it("nei test e2e solo un DSN locale; fuori dai test quello del build", () => {
    expect(dsnSentry("http://public@127.0.0.1:3197/1", true)).toBe("http://public@127.0.0.1:3197/1");
    expect(dsnSentry("https://abc@o1.ingest.de.sentry.io/2", true)).toBeUndefined();
    expect(dsnSentry("non un url", true)).toBeUndefined();
    expect(dsnSentry(undefined, false)).toBeUndefined();
    expect(dsnSentry("https://abc@o1.ingest.de.sentry.io/2", false)).toBe("https://abc@o1.ingest.de.sentry.io/2");
  });

  it("solo errori: in src/ niente replay, feedback, tracing né sendDefaultPii", () => {
    for (const f of sorgenti(SRC)) {
      const testo = readFileSync(f, "utf8");
      expect(testo, f).not.toMatch(/\b(?:replayIntegration|feedbackIntegration|browserTracingIntegration|tanstackRouterBrowserTracingIntegration)\(/);
      expect(testo, f).not.toMatch(/\b(?:tracesSampleRate|tracesSampler|sendDefaultPii)\s*:/);
    }
  });

  it("beforeSend e beforeBreadcrumb passano da shared/scrub.ts, su client e server", () => {
    for (const file of ["instrument.client.ts", "instrument.server.ts"]) {
      const testo = readFileSync(join(SRC, file), "utf8");
      expect(testo, file).toMatch(/beforeSend:[\s\S]{0,300}?scrubSentryEvent\(event/);
      expect(testo, file).toMatch(/beforeBreadcrumb:[^\n]*scrubBreadcrumb/);
      expect(testo, file).toMatch(/dataCollection: DATA_COLLECTION/);
    }
  });
});

describe("PostHog", () => {
  const testo = readFileSync(join(SRC, "osservabilita", "posthog.ts"), "utf8");

  it("senza cookie, via /ingest, un pageview per navigazione, scrubbing in before_send", () => {
    for (const riga of [
      'api_host: "/ingest"',
      'cookieless_mode: "always"',
      'persistence: "memory"',
      'capture_pageview: "history_change"',
      'person_profiles: "identified_only"',
      "autocapture: false",
      "disable_session_recording: true",
      "disable_surveys: true",
      "capture_heatmaps: false",
      "capture_exceptions: false",
      "disable_external_dependency_loading: true",
      "before_send: event => scrubPosthogEvent(event)",
      "disable_compression: E2E",
    ]) expect(testo).toContain(riga);
  });

  it("identify con il solo id del profilo", () => {
    expect(testo).toMatch(/posthog\.identify\(profileId\);/);
  });

  it("reset al logout: esci() riporta PostHog anonimo prima di ricaricare", () => {
    expect(testo).toMatch(/posthog\.reset\(\);/);
    const esci = readFileSync(join(SRC, "lib", "auth-client.ts"), "utf8").match(/export async function esci[\s\S]*?\n}/)?.[0] ?? "";
    expect(esci).toMatch(/signOut\(\);[\s\S]*identificaProprietario\(null\)[\s\S]*reload\(\)/);
  });
});
