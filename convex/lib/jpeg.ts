/* ──────────────────────────────────────────────────────────────
   Il controllo di un JPEG caricato come foto (convex/foto.ts): puro, sui
   byte, senza decodificare l'immagine.

   Si leggono i segmenti fino all'inizio dei dati (SOS). Un file è buono se:
   - comincia con SOI (FFD8) ed è un JPEG ben formato fino a SOS;
   - non ha segmenti di metadati: APP1 (Exif, XMP: lì stanno GPS, data e
     modello del telefono), APP13 (IPTC) né commenti (COM). Il browser
     ricodifica le foto con un canvas, che scrive solo APP0 (JFIF): un
     metadato qui vuol dire che il file non è passato da lì;
   - ha un SOF con le dimensioni, entro il lato massimo.
   ────────────────────────────────────────────────────────────── */

export type EsitoJpeg =
  | { ok: true; larghezza: number; altezza: number }
  | { ok: false; motivo: "non_jpeg" | "metadati" | "troppo_grande" };

/** Segmenti che portano metadati: APP1 (Exif/XMP), APP13 (IPTC), COM. */
const METADATI = new Set([0xe1, 0xed, 0xfe]);
/** SOF0…SOF15 tranne DHT (C4), JPG (C8) e DAC (CC): quelli con altezza e larghezza. */
const eSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

export function controllaJpeg(b: Uint8Array, latoMax: number): EsitoJpeg {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return { ok: false, motivo: "non_jpeg" };
  let i = 2;
  let dimensioni: { larghezza: number; altezza: number } | null = null;
  while (i < b.length) {
    if (b[i] !== 0xff) return { ok: false, motivo: "non_jpeg" };
    // byte di riempimento: più FF di fila
    while (i < b.length && b[i] === 0xff) i++;
    if (i >= b.length) return { ok: false, motivo: "non_jpeg" };
    const marker = b[i++];
    // marcatori senza lunghezza (RSTn, TEM): non dovrebbero stare qui, ma non portano dati
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9) return { ok: false, motivo: "non_jpeg" }; // EOI prima dei dati
    if (i + 2 > b.length) return { ok: false, motivo: "non_jpeg" };
    const lunghezza = (b[i] << 8) | b[i + 1];
    if (lunghezza < 2 || i + lunghezza > b.length) return { ok: false, motivo: "non_jpeg" };
    if (METADATI.has(marker)) return { ok: false, motivo: "metadati" };
    if (eSof(marker)) {
      if (lunghezza < 7) return { ok: false, motivo: "non_jpeg" };
      const altezza = (b[i + 3] << 8) | b[i + 4];
      const larghezza = (b[i + 5] << 8) | b[i + 6];
      if (!altezza || !larghezza) return { ok: false, motivo: "non_jpeg" };
      dimensioni = { larghezza, altezza };
    }
    if (marker === 0xda) {
      // l'inizio dei dati: da qui in poi niente più segmenti da guardare
      if (!dimensioni) return { ok: false, motivo: "non_jpeg" };
      if (Math.max(dimensioni.larghezza, dimensioni.altezza) > latoMax) return { ok: false, motivo: "troppo_grande" };
      return { ok: true, ...dimensioni };
    }
    i += lunghezza;
  }
  return { ok: false, motivo: "non_jpeg" };
}
