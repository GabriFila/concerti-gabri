/* Convex accetta i JWT di Better Auth (plugin convex(): RS256, issuer
   CONVEX_SITE_URL, audience "convex", chiavi dalla tabella jwks). */
import type { AuthConfig } from "convex/server";
import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

export default {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;
