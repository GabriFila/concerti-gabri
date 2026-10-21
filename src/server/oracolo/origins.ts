/* ──────────────────────────────────────────────────────────────
   Origini ammesse per ambiente (PIANO §1.8). Si ricavano da VERCEL_ENV e
   dalle variabili di sistema di Vercel, mai dall'header Host:

   | ambiente          | origini                                                      |
   |-------------------|--------------------------------------------------------------|
   | production        | https://concerti.gabrifila.me, https://concerti-gabri.vercel.app |
   | preview           | https://${VERCEL_BRANCH_URL}                                  |
   | fuori da Vercel   | http://localhost:3100, l'URL tailnet, https://*.concerti-gabri.localhost:1355 |

   Una richiesta SENZA header Origin (curl, server-to-server) non si blocca
   qui: l'Origin si valida solo quando c'è, come prima su Netlify.
   ────────────────────────────────────────────────────────────── */

export interface DeployEnv {
  /** "production" | "preview" | "development" su Vercel; assente fuori. */
  VERCEL_ENV?: string;
  /** Host dell'URL del branch (senza schema), es. concerti-gabri-git-multiutente-….vercel.app */
  VERCEL_BRANCH_URL?: string;
}

export const PRODUCTION_ORIGINS = ["https://concerti.gabrifila.me", "https://concerti-gabri.vercel.app"] as const;

/** Dev su t3node: la porta fissa 3100 e l'URL tailnet che la espone (DECISIONI). */
export const LOCAL_ORIGINS = [
  "http://localhost:3100",
  "http://127.0.0.1:3100",
  "https://t3node.tail4a8e3b.ts.net:8444",
] as const;

/** portless: il checkout principale e i worktree (`<worktree>.concerti-gabri.localhost:1355`). */
export const PORTLESS_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)?concerti-gabri\.localhost:1355$/;

export type DeployKind = "production" | "preview" | "local";

export function deployKind(env: DeployEnv): DeployKind {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "local";
}

/** Le origini esatte ammesse nell'ambiente (il jolly portless vale solo in locale). */
export function allowedOrigins(env: DeployEnv): string[] {
  switch (deployKind(env)) {
    case "production":
      return [...PRODUCTION_ORIGINS];
    case "preview":
      return env.VERCEL_BRANCH_URL ? [`https://${env.VERCEL_BRANCH_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`] : [];
    default:
      return [...LOCAL_ORIGINS];
  }
}

export function isAllowedOrigin(origin: string, env: DeployEnv): boolean {
  const o = origin.trim().toLowerCase();
  if (allowedOrigins(env).includes(o)) return true;
  return deployKind(env) === "local" && PORTLESS_ORIGIN_RE.test(o);
}

/** Origin assente = ammessa (si valida solo quando il browser la manda). */
export const originOk = (origin: string | null, env: DeployEnv): boolean =>
  origin === null || isAllowedOrigin(origin, env);
