/* ──────────────────────────────────────────────────────────────
   L'origine canonica del sito per /mcp e i metadati OAuth (PIANO §1.8):
   si ricava dall'ambiente, MAI dall'header Host. Coincide con SITE_URL del
   deployment Convex, cioè con l'issuer di Better Auth:

   | ambiente        | origine                                                        |
   |-----------------|----------------------------------------------------------------|
   | production      | https://${VERCEL_PROJECT_PRODUCTION_URL} (il dominio di produzione) |
   | preview         | https://${VERCEL_BRANCH_URL}                                    |
   | fuori da Vercel | SITE_URL (worktree, da .env.worktree), poi VITE_SITE_URL (URL tailnet), poi localhost:3100 |
   ────────────────────────────────────────────────────────────── */

import { PRODUCTION_ORIGINS, deployKind, type DeployEnv } from "../oracolo/origins.ts";

export interface McpEnv extends DeployEnv {
  /** Vercel: il dominio di produzione più corto (il custom domain, se c'è). */
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  /** Fuori da Vercel: lo stesso SITE_URL del deployment Convex (worktree). */
  SITE_URL?: string;
  /** Fuori da Vercel: l'URL tailnet del dev (VITE_SITE_URL, dal build). */
  VITE_SITE_URL?: string;
}

const origineDi = (x: string | undefined): string | null => {
  if (!x) return null;
  try {
    return new URL(/^https?:\/\//.test(x) ? x : `https://${x}`).origin;
  } catch {
    return null;
  }
};

/** L'origine canonica (senza barra finale), es. https://concerti.gabrifila.me. */
export function origineCanonica(env: McpEnv): string {
  switch (deployKind(env)) {
    case "production":
      return origineDi(env.VERCEL_PROJECT_PRODUCTION_URL) ?? PRODUCTION_ORIGINS[0];
    case "preview":
      return origineDi(env.VERCEL_BRANCH_URL) ?? PRODUCTION_ORIGINS[0];
    default:
      return origineDi(env.SITE_URL) ?? origineDi(env.VITE_SITE_URL) ?? "http://localhost:3100";
  }
}

/** L'ambiente del processo (server Start): solo i nomi che servono qui. */
export function envDelProcesso(): McpEnv {
  return {
    VERCEL_ENV: process.env.VERCEL_ENV,
    VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    SITE_URL: process.env.SITE_URL,
    VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
  };
}

/** L'URL del server MCP (la `resource` dei metadati): <origine>/mcp, senza barra finale. */
export const urlMcp = (origine: string) => `${origine}/mcp`;

/** Il documento PRM (RFC 9728) per il path /mcp. */
export const urlMetadatiRisorsa = (origine: string) => `${origine}/.well-known/oauth-protected-resource/mcp`;
