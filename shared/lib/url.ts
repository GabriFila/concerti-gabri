/* Solo URL https (PIANO §4.7): siti e loghi dei "regalato da" sono dati
   degli utenti, quindi in pagina (href, src) entrano solo se sono https.
   `javascript:`, `data:`, `http:` e stringhe non valide spariscono. Lo
   schema Zod li rifiuta già in scrittura (shared/schema/campi.ts): questo è
   il secondo controllo, al momento di mostrarli. */
export function soloHttps(u: unknown): string | undefined {
  if (typeof u !== "string" || !u) return undefined;
  try {
    return new URL(u).protocol === "https:" ? u : undefined;
  } catch {
    return undefined;
  }
}
