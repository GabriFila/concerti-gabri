/* Il `?next=` di /accedi e dei login (PIANO §6): solo un percorso della
   nostra origine, mai un altro sito. Puro (lo prova auth-next.test.ts). */

/** `next` se è un percorso della nostra origine (mai `//host`, `/\host` o caratteri di controllo), altrimenti `predefinito`. */
export function nextSicuro(next: unknown, predefinito = "/benvenuto"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return predefinito;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return predefinito;
  return next;
}
