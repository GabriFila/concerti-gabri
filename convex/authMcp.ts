/* ──────────────────────────────────────────────────────────────
   Opzioni del plugin mcp() di Better Auth (contratto di ondata). Le usa
   convex/auth.ts (corsia 3) così: `mcp({ ...opzioniMcp })`, con /mcp/*
   in disabledPaths finché MCP_ATTIVO è false. Le riempie la corsia 7.
   ────────────────────────────────────────────────────────────── */

export const MCP_ATTIVO = false;

export const opzioniMcp = {
  loginPage: "/accedi",
};
