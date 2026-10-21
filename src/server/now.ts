/* L'istante "adesso" lato server. Solo per i test locali, con E2E=1 e fuori
   da Vercel, E2E_NOW (ISO 8601) congela l'orologio: su Vercel non vale mai. */
export function serverNow(env: Record<string, string | undefined> = process.env): number {
  if (env.E2E === "1" && !env.VERCEL && env.E2E_NOW) {
    const t = Date.parse(env.E2E_NOW);
    if (!Number.isNaN(t)) return t;
  }
  return Date.now();
}
