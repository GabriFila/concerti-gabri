import { describe, expect, it } from "vitest";
import { GEMINI, senzaSegreti } from "./child-env.mjs";

// valori finti: contano solo i nomi
const ENV = {
  PATH: "/usr/bin",
  HOME: "/home/x",
  NODE_OPTIONS: "--max-old-space-size=3072",
  E2E: "1",
  E2E_NOW: "2026-10-21T12:00:00+02:00",
  PORT: "3100",
  CONVEX_URL: "https://example.convex.cloud",
  VITE_CONVEX_URL: "https://example.convex.cloud",
  GEMINI_API_KEY: "g",
  GOOGLE_API_KEY: "g2",
  GEMINI_MODEL: "m",
  VERCEL_AUTOMATION_BYPASS_SECRET: "b",
  CONVEX_DEPLOY_KEY: "d",
  CONVEX_DEPLOY_KEY_PREVIEW: "dp",
  CONVEX_DEPLOY_KEY_PROD: "dprod",
  BETTER_AUTH_SECRET: "a",
  BETTER_AUTH_SECRET_DEV: "ad",
  BETTER_AUTH_SECRET_PROD: "aprod",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "cs",
  GH_TOKEN: "t",
  VITE_MAPBOX_TOKEN: "pk",
  SOMETHING_PROD: "x",
  DB_PASSWORD: "p",
};

describe("senzaSegreti", () => {
  it("senza `tieni` lascia solo i nomi innocui", () => {
    expect(Object.keys(senzaSegreti(ENV)).sort()).toEqual(
      ["CONVEX_URL", "E2E", "E2E_NOW", "GEMINI_MODEL", "GOOGLE_CLIENT_ID", "HOME", "NODE_OPTIONS", "PATH", "PORT", "VITE_CONVEX_URL"],
    );
  });

  it("tiene solo i segreti chiesti (la chiave di Gemini, il bypass)", () => {
    const env = senzaSegreti(ENV, [...GEMINI, "VERCEL_AUTOMATION_BYPASS_SECRET"]);
    expect(env.GEMINI_API_KEY).toBe("g");
    expect(env.GOOGLE_API_KEY).toBe("g2");
    expect(env.VERCEL_AUTOMATION_BYPASS_SECRET).toBe("b");
    expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined();
    expect(env.GH_TOKEN).toBeUndefined();
  });

  it("le chiavi di produzione e di deploy non passano mai, nemmeno se chieste", () => {
    const tieni = ["CONVEX_DEPLOY_KEY", "CONVEX_DEPLOY_KEY_PREVIEW", "CONVEX_DEPLOY_KEY_PROD", "BETTER_AUTH_SECRET_PROD", "BETTER_AUTH_SECRET_DEV", "SOMETHING_PROD"];
    const env = senzaSegreti(ENV, tieni);
    for (const name of tieni) expect(env[name], name).toBeUndefined();
  });

  it("non tocca l'ambiente di partenza", () => {
    const copy = { ...ENV };
    senzaSegreti(copy);
    expect(copy).toEqual(ENV);
  });
});
