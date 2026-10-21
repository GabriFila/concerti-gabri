/* L'orologio del server: E2E_NOW congela "adesso" solo nei test locali,
   con E2E=1 e fuori da Vercel. Su Vercel non deve valere mai, nemmeno se
   qualcuno impostasse le due variabili per sbaglio. */

import { describe, expect, it } from "vitest";
import { serverNow } from "./now.ts";

const FROZEN = "2026-10-21T12:00:00+02:00";
const near = (t: number) => Math.abs(t - Date.now()) < 5_000;

describe("serverNow", () => {
  it("con E2E=1 ed E2E_NOW, fuori da Vercel, è l'istante congelato", () => {
    expect(serverNow({ E2E: "1", E2E_NOW: FROZEN })).toBe(Date.parse(FROZEN));
  });

  it("su Vercel ignora E2E_NOW", () => {
    expect(near(serverNow({ E2E: "1", E2E_NOW: FROZEN, VERCEL: "1" }))).toBe(true);
  });

  it("senza E2E=1 ignora E2E_NOW", () => {
    expect(near(serverNow({ E2E_NOW: FROZEN }))).toBe(true);
    expect(near(serverNow({ E2E: "true", E2E_NOW: FROZEN }))).toBe(true);
  });

  it("un E2E_NOW illeggibile non congela niente", () => {
    expect(near(serverNow({ E2E: "1", E2E_NOW: "domani" }))).toBe(true);
    expect(near(serverNow({ E2E: "1" }))).toBe(true);
  });
});
