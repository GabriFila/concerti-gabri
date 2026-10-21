/* Il titolo della scheda. Su una preview Vercel ha davanti il branch, così la
   scheda non si confonde con la produzione (né con un'altra preview). I due
   valori arrivano al build da `define` in vite.config.ts. */

export const BASE_TITLE = "Gabri ai concerti";

export function siteTitle(base: string = BASE_TITLE): string {
  const env = typeof __VERCEL_ENV__ === "string" ? __VERCEL_ENV__ : "";
  const ref = typeof __VERCEL_GIT_COMMIT_REF__ === "string" ? __VERCEL_GIT_COMMIT_REF__ : "";
  return env === "preview" && ref ? `${ref} · ${base}` : base;
}
