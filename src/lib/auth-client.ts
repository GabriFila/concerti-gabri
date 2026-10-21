/* ──────────────────────────────────────────────────────────────
   Client di Better Auth (contratto di ondata). Lo scrive la corsia 3,
   che può aggiungere export; le altre corsie usano solo `esci()`.
   ────────────────────────────────────────────────────────────── */

/** Esce e ricarica la pagina per intero (§1.39). Segnaposto fino al traguardo 3. */
export async function esci(): Promise<void> {
  throw new Error("login: arriva col traguardo 3");
}
