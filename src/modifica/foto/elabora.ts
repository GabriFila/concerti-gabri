/* ──────────────────────────────────────────────────────────────
   Una foto scelta dal telefono o dal computer, pronta da caricare
   (DECISIONI «Foto dei concerti»): solo nel browser.

   La si decodifica (createImageBitmap, che raddrizza secondo l'orientamento
   EXIF), la si ridisegna su un canvas e la si ricodifica in JPEG: la foto
   con il lato lungo al massimo FOTO_LATO px e la miniatura a
   MINIATURA_LATO px. Il canvas scrive solo i pixel, quindi i metadati del
   file originale (GPS, data, modello del telefono) non arrivano mai al
   server; convex/foto.ts lo ricontrolla e rifiuta un JPEG che li abbia.
   ────────────────────────────────────────────────────────────── */

import { FOTO_LATO, FOTO_MAX_BYTES, FOTO_TIPO, MINIATURA_LATO, MINIATURA_MAX_BYTES } from "../../../shared/schema/foto.ts";

export interface FotoPronta {
  foto: Blob;
  miniatura: Blob;
}

export class FotoIllegibile extends Error {}

/** Le dimensioni con il lato lungo entro `lato` (mai ingrandite). */
export function misureEntro(w: number, h: number, lato: number): { w: number; h: number } {
  const k = Math.min(1, lato / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

async function decodifica(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // HEIC su un browser che non lo legge, un file rovinato o non un'immagine
    throw new FotoIllegibile("non riesco a leggere questa foto: prova con un jpeg o un png");
  }
}

function canvasJpeg(img: ImageBitmap, w: number, h: number, qualita: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) throw new FotoIllegibile("il browser non riesce a preparare la foto");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  return new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new FotoIllegibile("il browser non riesce a preparare la foto"))), FOTO_TIPO, qualita));
}

/** Un JPEG entro `lato` e `maxByte`: si abbassa la qualità, poi il lato, finché ci sta. */
async function jpegEntro(img: ImageBitmap, lato: number, maxByte: number, qualita: number[]): Promise<Blob> {
  for (let l = lato; l >= 256; l = Math.round(l * 0.8)) {
    const { w, h } = misureEntro(img.width, img.height, l);
    for (const q of qualita) {
      const b = await canvasJpeg(img, w, h, q);
      if (b.size <= maxByte) return b;
    }
  }
  throw new FotoIllegibile("questa foto resta troppo pesante anche ridotta");
}

export async function preparaFoto(file: Blob): Promise<FotoPronta> {
  const img = await decodifica(file);
  try {
    const foto = await jpegEntro(img, FOTO_LATO, FOTO_MAX_BYTES, [0.84, 0.74, 0.64]);
    const miniatura = await jpegEntro(img, MINIATURA_LATO, MINIATURA_MAX_BYTES, [0.78, 0.66]);
    return { foto, miniatura };
  } finally {
    img.close();
  }
}
