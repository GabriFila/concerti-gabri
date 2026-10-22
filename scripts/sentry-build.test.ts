/* Il plugin Sentry del build (instrument.build.ts, traguardo 8): fuori da
   Vercel o senza SENTRY_AUTH_TOKEN niente source map, release o
   set-commits, anche con il token nell'ambiente (le opzioni come le vede
   davvero @sentry/bundler-plugins, dopo i suoi ripieghi su process.env);
   nel build di Vercel con il token source map caricate e poi cancellate da
   ogni cartella di output. Telemetria e strumentazione al build sempre
   spente; il plugin è l'ultimo di Vite. */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAPPE_DA_CANCELLARE, opzioniSentryBuild, SENTRY_ORG, SENTRY_PROJECT } from "../instrument.build.ts";

/**
 * Le opzioni normalizzate di @sentry/bundler-plugins per il build con `process.env` così com'è:
 * sentryTanstackStart vero (build CJS), di cui si intercetta solo la chiamata a sentryVitePlugin,
 * poi la normalizzazione vera del plugin manager. Nessuna rete: la release partirebbe solo nel writeBundle.
 */
function opzioniViste() {
  const percorso = createRequire(import.meta.url).resolve("@sentry/tanstackstart-react/vite");
  const req = createRequire(percorso);
  const vite = req("@sentry/bundler-plugins/vite");
  const originale = vite.sentryVitePlugin;
  let passate: unknown;
  vite.sentryVitePlugin = (o: unknown) => ((passate = o), []);
  try {
    req(percorso).sentryTanstackStart(opzioniSentryBuild());
  } finally {
    vite.sentryVitePlugin = originale;
  }
  return req("@sentry/bundler-plugins/core").createSentryBuildPluginManager(passate, { loggerPrefix: "[test]", buildTool: "vite" }).normalizedOptions;
}

describe("plugin Sentry del build", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("senza token, o con il token fuori da Vercel: nessuna source map, nessun upload, nessuna release", () => {
    for (const env of [{}, { VERCEL: "1" }, { SENTRY_AUTH_TOKEN: "sntrys_finto" }]) {
      const o = opzioniSentryBuild(env);
      expect(o.authToken).toBe("");
      expect(o.sourcemaps).toEqual({ disable: true, filesToDeleteAfterUpload: MAPPE_DA_CANCELLARE });
      expect(o.release).toEqual({ create: false, finalize: false, setCommits: false });
    }
  });

  it("il token dell'ambiente fuori da Vercel non arriva a Sentry: niente token, release né set-commits", () => {
    vi.stubEnv("SENTRY_AUTH_TOKEN", "sntrys_finto");
    vi.stubEnv("VERCEL", undefined);
    vi.stubEnv("SENTRY_PIPELINE", undefined); // il plugin manager la scrive
    const o = opzioniViste();
    expect(o.authToken).toBe("");
    expect(o.release).toMatchObject({ create: false, finalize: false, setCommits: false });
    expect(o.sourcemaps).toMatchObject({ disable: true });
    expect(o.telemetry).toBe(false);
  });

  it("nel build di Vercel con il token: upload e poi cancellazione delle mappe in ogni output", () => {
    const o = opzioniSentryBuild({ VERCEL: "1", SENTRY_AUTH_TOKEN: "sntrys_finto" });
    expect(o.authToken).toBe("sntrys_finto");
    expect(o.sourcemaps?.disable).toBe(false);
    expect(o.sourcemaps?.filesToDeleteAfterUpload).toEqual(MAPPE_DA_CANCELLARE);
    for (const dir of [".output", ".vercel/output"]) expect(MAPPE_DA_CANCELLARE).toContain(`${dir}/**/*.map`);
    // mai node_modules per intero (il glob di default "./**/*.map" lo toccherebbe)
    expect(MAPPE_DA_CANCELLARE.some(g => g.startsWith("./**") || g.startsWith("**"))).toBe(false);
    expect(o.release).toEqual({ create: true, finalize: true });

    vi.stubEnv("SENTRY_AUTH_TOKEN", "sntrys_finto");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("SENTRY_PIPELINE", undefined);
    expect(opzioniViste()).toMatchObject({ authToken: "sntrys_finto", release: { create: true, finalize: true } });
  });

  it("sempre: org e progetto nel codice, telemetria e strumentazione al build spente", () => {
    for (const env of [{}, { VERCEL: "1", SENTRY_AUTH_TOKEN: "sntrys_finto" }]) {
      const o = opzioniSentryBuild(env);
      expect([o.org, o.project]).toEqual([SENTRY_ORG, SENTRY_PROJECT]);
      expect(o.telemetry).toBe(false);
      expect(o.autoInstrumentMiddleware).toBe(false);
      expect(o.buildTimeInstrumentation).toBe(false);
    }
  });

  it("in vite.config.ts è l'ultimo plugin", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "vite.config.ts"), "utf8");
    const plugins = src.slice(src.indexOf("plugins: ["));
    const ultimo = plugins.slice(0, plugins.indexOf("\n  ],")).trim().split("\n").filter(l => !l.trim().startsWith("//")).pop();
    expect(ultimo?.trim()).toBe("sentryBuild(),");
  });
});
