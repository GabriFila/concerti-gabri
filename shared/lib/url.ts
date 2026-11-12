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

/* Gli URL dei file di Convex (le foto: storage.getUrl, mai scritti da un
   utente): https, oppure http del Convex locale (sviluppo ed e2e, solo su
   loopback). In produzione il deployment è https e l'eccezione non vale. */
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
export function urlFileConvex(u: unknown): string | undefined {
  if (soloHttps(u)) return u as string;
  if (typeof u !== "string" || !u) return undefined;
  try {
    const url = new URL(u);
    return url.protocol === "http:" && LOOPBACK.has(url.hostname) ? u : undefined;
  } catch {
    return undefined;
  }
}
