/* L'URL del deployment Convex (PIANO §1.6): `import.meta.env.VITE_CONVEX_URL`,
   inserito nel codice al build. A runtime su Vercel `process.env` non lo
   contiene (`convex deploy --cmd` lo passa solo al build), quindi né il
   server né il browser lo leggono mai da lì. */
export function convexUrl(): string {
  const url = import.meta.env.VITE_CONVEX_URL;
  if (!url) throw new Error("VITE_CONVEX_URL mancante al build: il sito non sa a quale Convex collegarsi");
  return url;
}
