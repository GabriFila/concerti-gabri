/* ──────────────────────────────────────────────────────────────
   L'immagine Open Graph di un profilo (PIANO traguardo 4): 1200×630, la
   sala buia del sito, il nome nel font dei titoli del profilo e i numeri
   delle card KPI (concerti, artisti, città), la lampada nel colore
   d'accento del tema.

   Esito dello spike (PIANO §9): @vercel/og 1.0.3 non si carica in Node
   ESM fuori da Next.js (il suo harfbuzz impacchettato chiama `require("fs")`
   e cerca un hb.wasm che non c'è), quindi si usa il fallback previsto:
   satori (SVG, con i suoi wasm già dentro il pacchetto) e
   @resvg/resvg-wasm (PNG). satori non legge i font variabili né il woff2:
   per questo qui ci sono i woff statici di @fontsource. Font e wasm di
   resvg entrano nel bundle del server (`?inline`), quindi ci sono anche su
   Vercel senza leggere node_modules a runtime; la route carica questo
   modulo solo quando serve un'immagine, così l'SSR delle pagine non lo
   paga.
   ────────────────────────────────────────────────────────────── */

import { createElement as h, type ReactElement } from "react";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm?url&inline";
import fraunces from "@fontsource/fraunces/files/fraunces-latin-400-normal.woff?inline";
import inter400 from "@fontsource/inter/files/inter-latin-400-normal.woff?inline";
import inter500 from "@fontsource/inter/files/inter-latin-500-normal.woff?inline";
import playfair from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?inline";
import spaceGrotesk from "@fontsource/space-grotesk/files/space-grotesk-latin-400-normal.woff?inline";
import satori from "satori";
import type { FontTitoli } from "../../../shared/theme.ts";
import type { Riassunto } from "../../shell/seo.ts";

export const LARGHEZZA = 1200;
export const ALTEZZA = 630;

/** data:…;base64,… → i byte. */
const byte = (dataUrl: string): ArrayBuffer => {
  const b = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const TITOLI: Record<FontTitoli, string> = {
  fraunces,
  inter: inter400,
  "space-grotesk": spaceGrotesk,
  "playfair-display": playfair,
};

/** I font per satori: quello dei titoli del profilo ("Titoli") e Inter per il resto. */
const fontPer = (titoli: FontTitoli) => [
  { name: "Titoli", data: byte(TITOLI[titoli]), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: byte(inter400), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: byte(inter500), weight: 500 as const, style: "normal" as const },
];

// il wasm di resvg si inizializza una volta per processo (nessun dato di richiesta qui)
let resvgPronto: Promise<void> | undefined;

const TESTO = "#e9e7e3";
const MUTED = "#85838c";
const DIM = "#56555d";
/** La lampada di sempre (--lamp in scuro). */
export const LAMPADA = "#d9a441";

export interface DatiImmagine {
  displayName: string;
  /** "concerti.gabrifila.me/gabrifila": dove porta il link. */
  indirizzo: string;
  numeri: Riassunto;
  lampada: string;
  fontTitoli: FontTitoli;
}

// satori vuole `display: flex` su ogni div con dentro del testo
const numero = (n: number, etichetta: string, lampada: string) =>
  h("div", { style: { display: "flex", flexDirection: "column", marginRight: 72 } },
    h("div", { style: { display: "flex", fontFamily: "Titoli", fontSize: 92, lineHeight: 1, color: lampada } }, String(n)),
    h("div", { style: { display: "flex", marginTop: 14, fontSize: 22, fontWeight: 500, letterSpacing: 4, textTransform: "uppercase", color: MUTED } }, etichetta),
  );

function immagine({ displayName, indirizzo, numeri, lampada }: DatiImmagine): ReactElement {
  const nome = displayName.length > 24 ? displayName.slice(0, 23).trimEnd() + "…" : displayName;
  // i nomi lunghi stanno su una riga sola
  const corpo = nome.length > 16 ? 76 : nome.length > 11 ? 92 : 112;
  return h("div", {
    style: {
      width: LARGHEZZA, height: ALTEZZA, display: "flex", flexDirection: "column",
      padding: "64px 80px", fontFamily: "Inter", color: TESTO,
      backgroundColor: "#0a0a0b",
      // il cono della lampada dall'alto, come la sala del sito
      backgroundImage: `radial-gradient(ellipse 900px 520px at 78% -12%, ${lampada}38, #0a0a0b00 70%)`,
    },
  },
    h("div", { style: { display: "flex", alignItems: "center", fontSize: 22, fontWeight: 500, letterSpacing: 6, textTransform: "uppercase", color: lampada } },
      h("div", { style: { width: 14, height: 14, borderRadius: 7, backgroundColor: lampada, marginRight: 16 } }),
      "Concerti",
    ),
    h("div", { style: { display: "flex", flexDirection: "column", marginTop: 70 } },
      h("div", { style: { display: "flex", fontFamily: "Titoli", fontSize: corpo, lineHeight: 1, letterSpacing: -2 } }, nome),
      h("div", { style: { display: "flex", fontFamily: "Titoli", fontSize: 60, lineHeight: 1.1, color: MUTED } }, "ai concerti"),
    ),
    h("div", { style: { display: "flex", position: "absolute", left: 80, right: 80, bottom: 60, alignItems: "flex-end", justifyContent: "space-between" } },
      h("div", { style: { display: "flex" } },
        numero(numeri.concerti, numeri.concerti === 1 ? "concerto" : "concerti", lampada),
        numero(numeri.artisti, numeri.artisti === 1 ? "artista" : "artisti", lampada),
        numero(numeri.citta, "città", lampada),
      ),
      h("div", { style: { display: "flex", fontSize: 22, color: DIM } }, indirizzo),
    ),
  );
}

/** Il PNG dell'immagine OG. */
export async function pngOg(dati: DatiImmagine): Promise<Uint8Array<ArrayBuffer>> {
  const svg = await satori(immagine(dati), { width: LARGHEZZA, height: ALTEZZA, fonts: fontPer(dati.fontTitoli) });
  await (resvgPronto ??= initWasm(byte(resvgWasm)));
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: LARGHEZZA } });
  const img = resvg.render();
  try {
    return new Uint8Array(img.asPng());
  } finally {
    img.free();
    resvg.free();
  }
}
