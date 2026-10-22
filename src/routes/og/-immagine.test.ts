/* L'immagine OG (routes/og/-immagine.ts): satori + resvg-wasm danno un PNG
   1200×630 con ognuno dei quattro font dei titoli, anche con un nome lungo
   e con zero concerti. Font e wasm arrivano dagli import `?inline`, come
   nel bundle del server. */

import { describe, expect, it } from "vitest";
import { FONT_TITOLI } from "../../../shared/theme.ts";
import { LAMPADA, pngOg } from "./-immagine.ts";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const dimensioni = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: v.getUint32(16), height: v.getUint32(20) };
};

describe("pngOg", () => {
  for (const fontTitoli of FONT_TITOLI) {
    it(`PNG 1200×630 con il font ${fontTitoli}`, async () => {
      const png = await pngOg({
        displayName: "Gabri", indirizzo: "concerti.gabrifila.me/gabrifila",
        numeri: { concerti: 80, inProgramma: 11, artisti: 50, citta: 13 }, lampada: LAMPADA, fontTitoli,
      });
      expect([...png.subarray(0, 8)]).toEqual(PNG_MAGIC);
      expect(dimensioni(png)).toEqual({ width: 1200, height: 630 });
    });
  }

  it("nome lunghissimo, accento del tema e zero concerti", async () => {
    const png = await pngOg({
      displayName: "Bartolomeo Lunghissimo Wolfgang Amadeus", indirizzo: "localhost:3100/e2e-x",
      numeri: { concerti: 0, inProgramma: 0, artisti: 0, citta: 0 }, lampada: "#ff4fa3", fontTitoli: "playfair-display",
    });
    expect(dimensioni(png)).toEqual({ width: 1200, height: 630 });
  });
}, 30_000);
