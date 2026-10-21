/* ──────────────────────────────────────────────────────────────
   Il canarino del controllo fughe (PIANO §8.2), congelato nel traguardo 2.
   Un indirizzo finto che il proprietario scrive in #partenze; lo stub di
   Nominatim (scripts/nominatim-stub.mjs) risponde con un `display_name`
   DIVERSO dal testo scritto e con coordinate fisse. Le spec di e2e/fughe/
   cercano tutte e tre le forme (anche URL-encoded e JSON-escaped, e le
   coordinate a 4, 5 e 7 decimali, con punto e con virgola) ovunque possano
   uscire. Solo sintassi cancellabile: lo importa anche lo stub (.mjs).
   ────────────────────────────────────────────────────────────── */

export const CANARINO = {
  indirizzo: "Via dei Canarini 7, Genova",
  displayName: "Civico 7, Vico dei Canarini, Quartiere Canarino, Genova, Liguria, 16100, Italia",
  lat: 44.4123456,
  lng: 8.9345678,
} as const;

/** Le forme in cui il canarino potrebbe uscire. */
export function formeCanarino(): string[] {
  const testi = [CANARINO.indirizzo, CANARINO.displayName, "Canarini"];
  const coord = [CANARINO.lat, CANARINO.lng].flatMap(n => [4, 5, 7].map(d => n.toFixed(d)));
  const forme = new Set<string>();
  for (const t of [...testi, ...coord]) {
    forme.add(t);
    forme.add(encodeURIComponent(t));
    forme.add(JSON.stringify(t).slice(1, -1));
    if (/^\d+\.\d+$/.test(t)) forme.add(t.replace(".", ","));
  }
  return [...forme];
}
