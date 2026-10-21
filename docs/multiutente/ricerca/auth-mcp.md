# Ricognizione: Better Auth + MCP

> Appunti della ricognizione del 2026-10-21 per PIANO.md (non vincolanti: vince PIANO/DECISIONI).

## Auth + MCP research for concerti-gabri, branch `multiutente` (checked 2026-10-21 against npm, package source and official docs)

### 0. Main finding: stay on Better Auth 1.6.x and use the 1.6 `mcp()` plugin
- `@convex-dev/better-auth@0.12.5` is the latest release (2026-06-27). Its peer range is **`better-auth >=1.6.11 <1.7.0`**.
- Better Auth `latest` is already **1.7.12**, so a plain `pnpm add better-auth` installs a version that breaks.
  - Issue convex/better-auth#433: on 1.7, `convex()` fails to bundle with `"./plugins/oidc-provider" is not exported`. 1.7 also removed `better-auth/plugins/mcp/client`.
  - The 1.7 migration PR (#430) has had no maintainer response.
- **Pin exactly:** `better-auth@1.6.33`, `@better-auth/api-key@1.6.33`, and the CLI `auth@1.6.33`. `npx auth` with no version runs 1.7.12, which generates the 1.7 schema (`oauthClient`…).
- **Do NOT use `@better-auth/oauth-provider`** (1.6.33) together with `convex()`:
  - Issue #395: `/api/auth/convex/token` returns 404 at runtime, so login bounces.
  - It needs a separate `jwt` plugin, which collides with the JWT that `convex()` registers under id `"convex"`.
  - Issue #399: refresh-token rotation always returns `invalid_grant`, because the adapter's `eq null` never matches absent fields.
  - The fix PR #380 (oauth-provider migration) is unreviewed.
- **`@better-auth/mcp` + `@better-auth/cimd`** (the current upstream recommendation: CIMD, JWT `aud`, `requireMcpAuth`) exist **only for 1.7**, so they are unusable with Convex today. Revisit when the adapter supports 1.7.
- **What works today:** the 1.6 `mcp()` from `better-auth/plugins`.
  - It is built on the deprecated oidc-provider and uses the tables `oauthApplication`, `oauthAccessToken` and `oauthConsent`, which **are already in the component's default schema**.
  - Endpoints:
    - `/api/auth/mcp/authorize`, `/mcp/token` (accepts form-urlencoded), `/mcp/register` (open DCR, RFC 7591)
    - `/oauth2/consent`
    - `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`, both under basePath
  - Tokens are **opaque** random strings, stored in plaintext in `oauthAccessToken`.
- 1.6 `mcp()` limits I verified in the source (`dist/plugins/mcp/*.mjs`) and the hardening each one needs:

| Limit | Hardening |
|---|---|
| (a) **No consent screen unless the client sends `prompt=consent`.** Combined with open DCR, an attacker can register a client and a link silently mints a code for a logged-in victim. | Force consent: a Better Auth `before` hook on `/mcp/authorize`, plus a gate in the Start proxy. |
| (b) No RFC 8707 `resource`/audience binding. | Acceptable: this authorization server issues tokens for a single resource. |
| (c) Refresh grants issue a new pair but **do not revoke the old refresh token**. | Old rows must be cleaned up (cron). |
| (d) No CIMD and no RFC 9207 `iss`. | Claude and ChatGPT fall back to DCR. ChatGPT then uses `https://chatgpt.com/connector/oauth/{callback_id}`, which works because DCR registers it. |
| (e) The metadata advertises `jwks_uri`/`userinfo_endpoint` that don't exist. | Post-process the AS metadata in our `/.well-known` route. |
| (f) `/mcp/get-session` returns the whole token row, **including `refreshToken`**, to any access-token holder. | `disabledPaths: ["/mcp/get-session"]` and verify inside Convex instead. |
| (g) `convex()` embeds the oidc-provider `after` hook, so two hooks react to the same `oidc_login_prompt` cookie. | Never let Better Auth set that cookie: the Start proxy redirects unauthenticated `/api/auth/mcp/authorize` to `/accedi?next=…` itself. |

### 1. Package versions (npm, 2026-10-21)
- **Auth:**
  - `@convex-dev/better-auth@0.12.5`, `better-auth@1.6.33` (dist-tag `release-1.6`), `@better-auth/api-key@1.6.33`, CLI `auth@1.6.33`.
  - `convex@1.47.0` (already installed).
  - Convex libraries: `convex-helpers@0.1.128`, `@convex-dev/rate-limiter@0.4.2`, `@convex-dev/resend@0.2.9` (later), `convex-test@0.0.63`.
- **TanStack Start:**
  - `@tanstack/react-start@1.169.3`. It pins `@tanstack/react-router@1.170.45`; bump from 1.170.18 to match.
  - `@tanstack/react-query@5.104.5`, `@convex-dev/react-query@0.1.0`, `@tanstack/react-router-ssr-query@1.167.3`.
- **MCP:**
  - `@modelcontextprotocol/server@2.3.1` (SDK v2, spec **2026-07-28**; zod ^4.2).
  - Don't use `@modelcontextprotocol/sdk@1.32.1`: it is v1 and tops out at 2025-11-25.
  - `mcp-handler@2.3.0` (built on SDK v2, peer `next` optional) is optional; the SDK's own `createMcpHandler` is enough.
  - `@vercel/mcp-adapter` is obsolete.
- **TypeScript 7:** the SDK's `.d.mts` references `Buffer`, so add `"types": ["node"]` to tsconfig.

### 2. Plugins on Convex: out of the box vs local install
- **Out of the box:** emailOTP (uses `verification`), Google social, `oAuthProxy` (no schema), the 1.6 `mcp()` (oidc tables are in the default schema), jwt.
- **Local install required:** `@better-auth/api-key` (`apikey` table), `@better-auth/oauth-provider` (new tables; broken anyway).
- **Not supported:** SSO.
- **Recommendation:** do a **local install from the start** (milestone 3 starts on an empty database). It is needed for apiKey, and it also allows custom indexes (e.g. `oauthAccessToken.refreshTokenExpiresAt` for cleanup) and component-side functions. Layout and steps:
  - `convex/betterAuth/{convex.config.ts (defineComponent("betterAuth")), auth.ts (only: export const auth = createAuth({} as any)), schema.ts, adapter.ts}`.
  - `adapter.ts`: `export const { create, findOne, findMany, updateOne, updateMany, deleteOne, deleteMany } = createApi(schema, createAuthOptions)`.
  - Generate the schema with `cd convex/betterAuth && pnpm dlx auth@1.6.33 generate --output generatedSchema.ts`, then `schema.ts` spreads `tables` and adds indexes.
  - `convex/convex.config.ts` imports `./betterAuth/convex.config`.
  - Plugins that change the schema (`mcp`, `apiKey`) must be **unconditional**, because the CLI evaluates them without env.

### 3. Setup files (TanStack Start guide, adapted)
- **`vite.config.ts`:** `ssr: { noExternal: ['@convex-dev/better-auth'] }`.
- **`convex/auth.config.ts`:** `export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig` (from `@convex-dev/better-auth/auth-config`). This is a customJwt with RS256, issuer `CONVEX_SITE_URL`, aud `convex`. Optional static JWKS: `getAuthConfigProvider({ jwks: process.env.JWKS })` plus `convex({ authConfig, jwks })`.
- **`convex/http.ts`:** `authComponent.registerRoutes(http, createAuth)`. No CORS is needed because the Start proxy keeps it same-origin.
- **`convex/auth.ts`:**
```ts
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { createClient, type AuthFunctions, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireRunMutationCtx } from "@convex-dev/better-auth/utils";
import { mcp } from "better-auth/plugins";            // 1.6: not a subpath export
import { emailOTP } from "better-auth/plugins/email-otp";
import { oAuthProxy } from "better-auth/plugins/oauth-proxy";
import { createAuthMiddleware } from "better-auth/api";
import { apiKey } from "@better-auth/api-key";
import authSchema from "./betterAuth/schema";
const authFunctions: AuthFunctions = internal.auth;
export const authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, {
  local: { schema: authSchema }, authFunctions,
  triggers: { user: {
    onCreate: async (ctx, user) => { await ctx.db.insert("profiles", { authUserId: user._id, status: "onboarding" }); },
    onDelete: async (ctx, user) => { /* find profile by_authUserId → ctx.scheduler.runAfter(0, internal.account.purge, …); also adapter.deleteMany oauthAccessToken/apikey where userId */ },
  } },
});
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();
const forceMcpConsent = { id: "force-mcp-consent", hooks: { before: [{ matcher: c => c.path === "/mcp/authorize",
  handler: createAuthMiddleware(async ctx => { ctx.query = { ...ctx.query, prompt: "consent" }; return { context: ctx }; }) }] } };
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => ({
  baseURL: process.env.SITE_URL,            // no trailing slash: it is also the MCP AS issuer
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),
  database: authComponent.adapter(ctx),
  socialProviders: { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } },
  user: { deleteUser: { enabled: true } },
  disabledPaths: ["/mcp/get-session"],
  rateLimit: { enabled: true, storage: "database", customRules: { "/mcp/register": { window: 60, max: 5 }, "/email-otp/send-verification-otp": { window: 60, max: 3 } } },
  plugins: [
    convex({ authConfig }),
    mcp({ loginPage: "/accedi", resource: `${process.env.SITE_URL}/mcp`,
      oidcConfig: { loginPage: "/accedi", consentPage: "/autorizza", requirePKCE: true, scopes: ["concerti"], defaultScope: "openid concerti", accessTokenExpiresIn: 3600, refreshTokenExpiresIn: 30*86400 } }),
    apiKey({ defaultPrefix: "cgk_", rateLimit: { enabled: false } }),   // default is 10 req/DAY!
    forceMcpConsent,
    ...(emailOn ? [emailOTP({ otpLength: 6, expiresIn: 600, allowedAttempts: 5, storeOTP: "hashed",
      sendVerificationOTP: async ({ email, otp, type }) => devOtp
        ? requireRunMutationCtx(ctx).runMutation(internal.devOtp.record, { email, otp, type })
        : sendViaResend(email, otp) })] : []),
    ...(process.env.OAUTH_PROXY_SECRET ? [oAuthProxy({ currentURL: process.env.SITE_URL, productionURL: process.env.OAUTH_PROXY_PRODUCTION_URL, secret: process.env.OAUTH_PROXY_SECRET })] : []),
  ],
}) satisfies BetterAuthOptions;
export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));
```
- **`src/lib/auth-client.ts`:** `createAuthClient({ plugins: [convexClient(), emailOTPClient(), apiKeyClient()] })`. Import paths: `@convex-dev/better-auth/client/plugins`, `better-auth/client/plugins`, `@better-auth/api-key/client`.
- **`src/lib/auth-server.ts`:** `convexBetterAuthReactStart({ convexUrl: import.meta.env.VITE_CONVEX_URL, convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL })`. Use **`import.meta.env`, not `process.env`**: `convex deploy --cmd` (CLI 1.47, verified in the bundle) sets `VITE_CONVEX_URL` **and** `VITE_CONVEX_SITE_URL` only for the build process, so they are undefined at runtime in Vercel functions.
- **`src/routes/api/auth/$.ts`:** GET/POST call `handler(request)`. Special case for `_splat === "mcp/authorize"`: `if (!(await getToken())) return redirect /accedi?next=<path+search>`; also append `prompt=consent`.
- **`__root.tsx`:** `beforeLoad` runs `getToken` through `createServerFn`, then `serverHttpClient?.setAuth(token)`, then `<ConvexBetterAuthProvider client initialToken>`.
- **`router.tsx`:** `new ConvexQueryClient(url, { expectAuth: true })` plus `setupRouterSsrQueryIntegration`. Reload on sign-out, as the guide says.

### 4. Account on first login and the profile row
- Google and emailOTP both create the Better Auth `user` on the first sign-in, unless `disableSignUp` is set.
- A `triggers.user.onCreate` runs **in the same transaction** and inserts `profiles { authUserId: user._id, status: "onboarding" }`. Handle, grammatical form (forma) and display name are set later by the `/benvenuto` mutation, which:
  - checks the reserved list and the `by_handle` index (Convex mutations are serializable, so check-then-insert is safe);
  - sets `status: "active"`.
- Use `newUserCallbackURL: "/benvenuto"` in `signIn.social`, and add a root guard that redirects onboarding profiles.
- `identity.subject` equals the component `user._id`. Add a unique index `profiles.by_authUserId`.
- `onDelete` cascades through the scheduler.

### 5. Email OTP behind config, with a dev sender tests can read
- Plugin on when `devOtp || (RESEND_API_KEY && EMAIL_FROM)`.
- `devOtp = process.env.AUTH_DEV_OTP === "1"`, set **only** on the dev and local Convex deployments. Hard guard: throw if `CONVEX_CLOUD_URL` contains `brave-chickadee-534`.
- The sender writes to an internal table `devOtpOutbox { email, otp, type, createdAt }`. Playwright reads it with `npx convex run devOtp:latest '{"email":"…"}'` (`convex run` can call internal functions), which also works with per-agent local deployments.
- Don't use `testUtils({ captureOTP })`: it is an in-memory map and doesn't survive across Convex isolates.
- Sending is awaited (`runInBackgroundOrAwait`) unless `advanced.backgroundTasks` is set, so leave that unset.
- Expose a public query `authFlags → { emailLogin }` so the UI knows whether to show "Entra con email".

### 6. Google and oAuthProxy (verified in the 1.6.33 source)
- In 1.6 the production side only exchanges the Google code and encrypts the profile. The **preview** creates the user and session in **its own** database via `/oauth-proxy-callback`.
- Requirements:
  - (i) The same encryption key on production and preview. The code uses `opts.secret ?? BETTER_AUTH_SECRET`, and the secrets differ per environment, so add a shared `OAUTH_PROXY_SECRET` on Convex prod and preview.
  - (ii) `currentURL: SITE_URL` must be explicit: inside Convex the request URL is `*.convex.site`, and `VERCEL_URL` is absent.
  - (iii) Production must actually run the new code with `oAuthProxy`. Production builds are blocked until the switch, so **until then register the branch URL callback directly in Google**: `https://concerti-gabri-git-multiutente-gabrifilas-projects.vercel.app/api/auth/callback/google`.
- Redirect URIs are always `${SITE_URL}/api/auth/callback/google`. Google rejects `*.localhost`, so parallel portless worktrees log in with the dev OTP.

### 7. MCP server as a Start server route (Vercel serverless)
- **`src/routes/mcp.ts`:**
```ts
import { createMcpHandler, McpServer, requireBearerAuth, OAuthError, OAuthErrorCode, originValidationResponse, type AuthInfo } from "@modelcontextprotocol/server";
const gate = requireBearerAuth({ requiredScopes: ["concerti"], expectedResource: RESOURCE /* new URL("/mcp", SITE) */, resourceMetadataUrl: `${SITE}/.well-known/oauth-protected-resource/mcp`,
  verifier: { async verifyAccessToken(token) {
    const r = await new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL).query(api.agent.auth.introspect, { agentToken: token });
    if (!r) throw new OAuthError(OAuthErrorCode.InvalidToken, "Token non valido o scaduto");
    return { token, clientId: r.clientId, scopes: r.scopes, expiresAt: r.expiresAt /* required! api keys: key.expiresAt ?? now+3600 */, resource: RESOURCE, extra: { via: r.via } } satisfies AuthInfo; } } });
const mcp = createMcpHandler(({ authInfo }) => { const s = new McpServer({ name: "concerti", version: "1.0.0" }); registerTools(s, authInfo!); return s; },
  { legacy: "stateless" /* serves 2025-era initialize clients */, responseMode: "json" });
export const Route = createFileRoute("/mcp")({ server: { handlers: {
  POST: async ({ request }) => { const bad = originValidationResponse(request, [new URL(SITE).hostname]); if (bad) return bad;
    request = xApiKeyToBearer(request); const a = await gate(request); return a instanceof Response ? a : mcp.fetch(request, { authInfo: a }); },
  GET: () => new Response(null, { status: 405, headers: { Allow: "POST" } }), DELETE: () => new Response(null, { status: 405 }) } } });
```
- Tools: `server.registerTool(name, { description, inputSchema: z.object(…), annotations }, async (args, ctx) => …)`. The handler reads `ctx.http?.authInfo` and calls Convex `api.agent.*` with `{ agentToken: authInfo.token, ...args }`. Convex validates the token again on every call.
- **`/.well-known` routes** (files under `src/routes/[.]well-known/…`):
  - `oauth-protected-resource` (root) and `oauth-protected-resource/mcp` serve `{ resource: "<SITE>/mcp", authorization_servers: [issuer], scopes_supported: ["concerti"], bearer_methods_supported: ["header"] }`.
    - `issuer` must equal the AS `issuer` = `SITE_URL` exactly; it can be read from the proxied AS metadata.
    - Don't use `createMcpAuthClient().protectedResourceHandler`: it advertises `authorization_servers: ["<SITE>/api/auth"]`, which does not match the issuer, and strict clients reject that.
  - `oauth-authorization-server`: proxy `/api/auth/.well-known/oauth-authorization-server` through the auth `handler`, adding `concerti` to `scopes_supported` and removing `jwks_uri`/`userinfo_endpoint`. Add CORS `*` on GET.
- **MCP spec 2026-07-28:**
  - Stateless: no `initialize` and no `Mcp-Session-Id`.
  - Headers `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` (validated by the SDK).
  - Origin header present and invalid: 403.
  - PRM (RFC 9728) is a MUST: either in a 401 `WWW-Authenticate` or at the well-known URLs, path-suffixed first.
  - CIMD is a SHOULD; DCR is deprecated (MAY).
  - RFC 8707 `resource` is sent by clients.
- **Claude** (claude.com/docs/connectors/building/authentication):
  - A 401 with `WWW-Authenticate: Bearer resource_metadata=…` is mandatory.
  - The PRM `resource` must equal the URL the user types (`https://…/mcp`, no trailing slash).
  - Only the first `authorization_servers` entry is used.
  - It falls back to DCR unless the AS advertises `client_id_metadata_document_supported` and `none`.
  - Callbacks: `https://claude.ai/api/mcp/auth_callback`; Claude Code uses `http://localhost:<any>/callback`, which works because DCR registers the exact URI.
  - PKCE S256; `offline_access` is appended when the AS lists it; refresh errors must be `invalid_grant`; the token endpoint must accept form-urlencoded; endpoints have 10 s (30 s for refresh) to answer.
  - Egress range `160.79.104.0/21`.
  - Static API-key headers are in beta and org-level only.
- **ChatGPT** (developers.openai.com/plugins/build/auth):
  - PKCE S256 is required. CIMD is preferred, otherwise DCR.
  - Redirect URI: `https://chatgpt.com/connector_platform_oauth_redirect` only when the AS supports RFC 9207 `iss`; otherwise `/connector/oauth/{callback_id}`.
  - **No API-key support.**
- **API key alternative** (scripts, Claude Code `--header`):
  - Accept `x-api-key: cgk_…` or `Authorization: Bearer cgk_…`, telling them apart by prefix.
  - Keys are created in `#agenti` with `authClient.apiKey.create`. They are SHA-256 base64url-hashed in `apikey.key` (indexed), owner `referenceId`.
  - Don't enable `enableSessionForAPIKeys`.
  - Verify by lookup inside Convex. `auth.api.verifyApiKey` writes, and `convex()` no-ops writes in query context.

### 8. One token = one profile: the single ownership helper (Convex)
```ts
// convex/lib/owner.ts
type Actor = { via: "dashboard"|"oauth"|"apikey"; userId: string; clientId?: string; keyId?: string };
async function resolveActor(ctx, agentToken?: string): Promise<Actor> {
  if (!agentToken) { const u = await authComponent.getAuthUser(ctx); return { via: "dashboard", userId: u._id }; } // validates session expiry
  if (agentToken.startsWith("cgk_")) { const k = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "apikey", where: [{ field: "key", value: await sha256b64url(agentToken) }] });
    if (!k || k.enabled === false || (k.expiresAt && k.expiresAt < Date.now())) throw new ConvexError({ code: "unauthorized" }); return { via: "apikey", userId: k.referenceId, keyId: k._id }; }
  const t = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "oauthAccessToken", where: [{ field: "accessToken", value: agentToken }] });
  if (!t || !t.accessTokenExpiresAt || t.accessTokenExpiresAt < Date.now()) throw new ConvexError({ code: "unauthorized" });
  return { via: "oauth", userId: t.userId!, clientId: t.clientId! };
}
export async function requireOwner(ctx, { agentToken }: { agentToken?: string } = {}) {
  const actor = await resolveActor(ctx, agentToken);
  const profile = await ctx.db.query("profiles").withIndex("by_authUserId", q => q.eq("authUserId", actor.userId)).unique();
  if (!profile || profile.status !== "active") throw new ConvexError({ code: "no_profile", fix: "/benvenuto" });
  return { profile, actor };
}
export const ownerMutation = customMutation(mutation, { args: { agentToken: v.optional(v.string()) },
  input: async (ctx, { agentToken }) => ({ ctx: { owner: await requireOwner(ctx, { agentToken }) }, args: {} }) }); // + ownerQuery
```
- Every write and private read uses `ownerMutation`/`ownerQuery`. `profileId` **never** comes from args.
- `getOwned(ctx, owner, id)` returns the same not_found error when the doc exists but belongs to someone else.
- Departure addresses are read only on the `via:"dashboard"` path.
- Revocation list in `#agenti`: distinct `clientId`s in `oauthAccessToken` for the user; revoke with `adapter.deleteMany`.
- A daily cron deletes rows with `refreshTokenExpiresAt < now`.
- Rate-limit agent writes with `@convex-dev/rate-limiter` keyed by `profileId`.
- Unit-test with `convex-test` and `@convex-dev/better-auth/test` `register(t)`. The local component needs its own glob registration.

### 9. Env / setup deltas vs DECISIONI
- **Convex, new:**
  - `OAUTH_PROXY_SECRET`: prod and preview, the same value.
  - `OAUTH_PROXY_PRODUCTION_URL`: preview only, after the switch.
  - `AUTH_DEV_OTP=1`: dev and local only.
  - Optional `JWKS`.
- **Google:** add the branch-URL callback now.
- **Each local or agent Convex deployment** needs `BETTER_AUTH_SECRET`, `SITE_URL` (its own portless URL) and `AUTH_DEV_OTP`.
- **Testing the MCP OAuth flow:** a scripted Playwright run (DCR fetch, then authorize in the browser with a dev-OTP session, consent, PKCE token exchange, then `tools/call`), plus Claude Code on t3node against the tailnet `SITE_URL`.
  - Claude.ai and ChatGPT can't reach a tailnet host or a Vercel-protected preview.
  - Real connector tests need a bypass or must wait for the switch. Tailscale Funnel would make it public, which needs Gabri's OK.

## Rischi
- @convex-dev/better-auth 0.12.5 needs better-auth <1.7. better-auth `latest` is 1.7.12 and the CLI `npx auth` is 1.7.12, so a loose install or a schema generation breaks the Convex bundle (issue #433). Pin better-auth, @better-auth/api-key and auth to exactly 1.6.33, and consider a pnpm override.
- The 1.6 `mcp()` plugin is marked 'soon deprecated' and is removed in 1.7. When the adapter supports 1.7 (PR #430 pending), moving to @better-auth/mcp + @better-auth/cimd changes the schema (oauthApplication becomes oauthClient) and every MCP client has to re-authorize.
- Without forced consent, 1.6 `mcp()` issues authorization codes silently to any logged-in user for any client registered through open DCR (consent phishing). Both the before-hook and the Start-proxy gate are required, and an e2e test must assert that the consent page always appears.
- `convex()` embeds the oidc-provider after-hook. With `mcp()` there are two continuation hooks on the same `oidc_login_prompt` cookie, and their interaction is unverified. Avoid the cookie path by redirecting unauthenticated /api/auth/mcp/authorize to /accedi in the Start proxy, and verify end to end.
- The 1.6 mcp tokens are opaque and stored in plaintext. Refresh tokens are never rotated or revoked (they stay valid until they expire), and /mcp/get-session leaks the refresh token to anyone holding the access token. Disable that path, keep token lifetimes short, run a cleanup cron and offer revocation in #agenti.
- @better-auth/oauth-provider together with convex() is broken: /convex/token returns 404 (issue #395), there is a jwt plugin id conflict, and refresh fails with `eq null` (issue #399). Don't adopt it on 1.6.
- oAuthProxy needs the same encryption secret on production and preview (BETTER_AUTH_SECRET differs per environment), an explicit currentURL inside Convex, and a production deployment that actually runs the new code. Production builds are blocked until the switch, so register the branch-URL Google callback directly for now.
- The api-key plugin's default rate limit is 10 requests per day per key. Set rateLimit.enabled to false, or verify by lookup inside Convex as proposed.
- VITE_CONVEX_URL and VITE_CONVEX_SITE_URL exist only during the `convex deploy --cmd` build. Server code on Vercel must read import.meta.env (inlined at build time), not process.env at runtime.
- The MCP AS issuer is SITE_URL, one per Convex deployment, and the Secure cookie and issuer follow it. http://localhost:3100 and the tailnet URL can't both work fully against the same dev deployment, and the PRM `resource` must match the exact URL users enter (no trailing slash).
- Claude.ai and ChatGPT reach MCP servers from their own clouds. They can't reach the tailnet dev URL or Vercel-protected previews, so real connector tests need a bypass, a public tunnel (needs Gabri's OK) or the switch. Claude Code on t3node and scripted Playwright cover development.
- The Convex site URL (*.convex.site/api/auth) is publicly reachable and bypasses the Start proxy gates. Keep the consent enforcement inside Better Auth (the before-hook), not only in the proxy. Better Auth rate limiting by IP may see forwarded headers that can be spoofed.
- Passing agentToken as a Convex function argument puts it in the function args. Never log it, and scrub agentToken, authorization and x-api-key in the Sentry and PostHog beforeSend.
- MCP spec 2026-07-28 is new. SDK v2 serves 2025-era clients statelessly (legacy: 'stateless'), but which version Claude and ChatGPT actually negotiate was not verified live.

## Fonti
- https://labs.convex.dev/better-auth/framework-guides/tanstack-start
- https://raw.githubusercontent.com/get-convex/better-auth/main/docs/content/docs/features/local-install.mdx
- https://raw.githubusercontent.com/get-convex/better-auth/main/docs/content/docs/features/triggers.mdx
- https://raw.githubusercontent.com/get-convex/better-auth/main/docs/content/docs/supported-plugins.mdx
- https://raw.githubusercontent.com/get-convex/better-auth/main/docs/content/docs/migrations/migrate-to-0-12.mdx
- https://raw.githubusercontent.com/get-convex/better-auth/main/docs/content/docs/experimental.mdx
- https://github.com/get-convex/better-auth/issues/395
- https://github.com/get-convex/better-auth/issues/399
- https://github.com/get-convex/better-auth/issues/433
- https://github.com/get-convex/better-auth/pull/380
- https://raw.githubusercontent.com/better-auth/better-auth/v1.6.33/docs/content/docs/plugins/mcp.mdx
- https://raw.githubusercontent.com/better-auth/better-auth/v1.6.33/docs/content/docs/plugins/oauth-provider.mdx
- https://raw.githubusercontent.com/better-auth/better-auth/v1.6.33/docs/content/docs/plugins/oauth-proxy.mdx
- https://www.better-auth.com/docs/plugins/mcp
- npm tarballs inspected: better-auth@1.6.33 (dist/plugins/mcp, oidc-provider, oauth-proxy, email-otp), @convex-dev/better-auth@0.12.5 (src/plugins/convex, client/create-client.ts, react-start), @better-auth/api-key@1.6.33, @modelcontextprotocol/server@2.3.1, mcp-handler@2.3.0, @modelcontextprotocol/sdk@1.32.1
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/dist/cli.bundle.cjs (deploy --cmd sets VITE_CONVEX_URL and VITE_CONVEX_SITE_URL)
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/authorization-server-discovery
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- https://ts.sdk.modelcontextprotocol.io/v2/serving/http
- https://ts.sdk.modelcontextprotocol.io/v2/serving/legacy-clients
- https://ts.sdk.modelcontextprotocol.io/v2/serving/authorization
- https://claude.com/docs/connectors/building/authentication
- https://developers.openai.com/plugins/build/auth
- https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
- https://github.com/williamzisa/convex-mcp-gateway
- https://github.com/Crown384/convex-mcp/pull/7
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/SPEC.md
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/PROMPT.md
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/DECISIONI.md
- /home/gabri/code/personal/concerti-gabri/scripts/check-setup.mjs
