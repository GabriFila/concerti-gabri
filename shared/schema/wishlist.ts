/* Lista dei desideri: l'input condiviso tra convex/wishlist.ts e il catalogo. */

import { z } from "zod";
import { artista } from "./campi.ts";

export const impostaWishlistInput = z
  .object({ artists: z.array(artista).max(100).describe("Artisti, nell'ordine in cui mostrarli") })
  .describe("Nuova lista dei desideri");
