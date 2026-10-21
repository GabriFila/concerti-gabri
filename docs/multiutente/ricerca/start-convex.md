# Ricognizione: TanStack Start + Convex

> Appunti della ricognizione del 2026-10-21 per PIANO.md (non vincolanti: vince PIANO/DECISIONI).

## Versions (npm registry, checked 2026-10-21)

| Package | Latest | Constraint / note |
|---|---|---|
| `@tanstack/react-start` | **1.169.3** | First stable release ("1.169 is the first stable release of TanStack Start"). Peer `vite >=8.0.0`. Engines: node >=22.12. It pins `@tanstack/react-router@1.170.45` exactly, so bump the repo's `^1.170.18` to 1.170.45 to avoid two router copies. |
| `@tanstack/react-router` | 1.170.45 | |
| `@tanstack/react-query` | 5.104.5 | `queryClient.query()` needs at least 5.102 |
| `@tanstack/react-router-ssr-query` | 1.167.3 | Peer router >=1.170.33, query >=5.102 |
| `@tanstack/react-form` | 1.33.5 | Takes Standard Schema (zod 4) validators directly |
| `nitro` | **3.0.260903-beta** | v3 exists only as a beta (the `latest` dist-tag). `nitropack` 2.x is the old line. Pin the exact version. |
| `convex` | 1.47.0 (installed) | 1.48 is still alpha |
| `@convex-dev/react-query` | 0.1.0 | |
| `@convex-dev/better-auth` | 0.12.5 | **Peer `better-auth >=1.6.11 <1.7.0`**: use `better-auth@~1.6.33` (dist-tag `release-1.6`), NOT the latest 1.7.12. Plugins must match: `@better-auth/api-key@1.6.33`, `@better-auth/oauth-provider@1.6.33`. The CLI is `pnpm dlx auth@1.6.33 generate` (the package was renamed from `@better-auth/cli`). |
| `@convex-dev/rate-limiter` | 0.4.2 | Peer convex ^1.43. Ships a `./test` helper. |
| `convex-test` | 0.0.63 | Also needs `@edge-runtime/vm@5.0.0` |
| `convex-helpers` | 0.1.128 | `convex-helpers/server/zod4` provides `zodToConvex`, `zodToConvexFields`, `zCustomQuery/Mutation/Action`, `zid` (zod ^4) |
| `@convex-dev/workpool` | 0.4.14 | Optional, as a queue for Nominatim |
| `@modelcontextprotocol/sdk` | 1.32.1 | Has `WebStandardStreamableHTTPServerTransport` (`handleRequest(Request): Promise<Response>`), which fits Start server routes |
| vite / plugin-react / vitest / typescript | 8.3.5 / 6.1.2 / 5.0.5 / 7.0.2 | |

## TanStack Start: things AI-written code commonly gets wrong
- **`.inputValidator()` was removed in 1.169. Use `.validator()`.** `useSession` is also gone, and `@tanstack/nitro-v2-vite-plugin` is replaced by `nitro()` from `nitro/vite`.
- Response helpers come from `@tanstack/react-start/server`: `getCookie`, `setCookie`, `deleteCookie`, `getRequest`, `getRequestHeaders`, `getRequestUrl`, `getRequestIP`, `setResponseHeader`, `setResponseStatus`. `setResponseHeader('set-cookie', …)` replaces every outgoing cookie, so use `setCookie` instead.
- The Start docs say **"Enabling `verbatimModuleSyntax` can result in server bundles leaking into client bundles"**. `tsconfig.app.json` has it ON today, so turn it off for the Start app.
- **Import protection:** in the client bundle, `*.server.*` files and `@tanstack/react-start/server` are denied (build error). You can also mark a file with `import '@tanstack/react-start/server-only'`.
- **CSRF:** Start installs its CSRF middleware for server functions automatically, unless you create `src/start.ts`. If you do, add `createCsrfMiddleware({ filter: ctx => ctx.handlerType === 'serverFn' })` yourself.
- **Redirects:** `redirect()` defaults to **307**. Pass `statusCode: 308` for the legacy links. An HTTP redirect whose Location has no fragment keeps the browser's `#fragment`, so `/dati#sec-mappa` → `/gabrifila/dati#sec-mappa` works on the server with no extra code. On client navigation, pass `hash: location.hash`.
- **Route matching:** static routes outrank `$handle`, so `/dati`, `/benvenuto`, `/privacy`, `/mcp` and `/api/*` win. Files or folders prefixed with `-` are excluded from the route tree (useful for colocated components).
- **`ssr` option:** accepts `true | false | 'data-only'`. `<ClientOnly fallback>` (from `@tanstack/react-router`) suits Mapbox. `ScriptOnce` is exported too.
- **Env vars:** Start's load-env plugin only fills `process.env` in the vite process (dev and build). On Vercel at runtime, `process.env.VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` are **undefined**: `convex deploy --cmd` injects them (and the `VITE_CONVEX_SITE_URL` for TanStack Start, auto-detected) only into the build. So server code must read **`import.meta.env.VITE_CONVEX_URL` / `import.meta.env.VITE_CONVEX_SITE_URL`**, which are inlined at build. The Better Auth example's `process.env.VITE_CONVEX_URL!` would break on per-branch previews.

## Vercel + Nitro
- Vercel's official recipe is `plugins: [tanstackStart(), nitro(), viteReact()]` plus `pnpm i nitro`. Nitro detects Vercel by itself, writes `.vercel/output`, and runs on Fluid compute with streaming.
- Pick the Node runtime with `"engines": {"node": "24.x"}` in package.json.
- Set the function region in Nitro options: `vercel: { functions: { regions: ['dub1'] } }`. Convex EU is aws-eu-west-1 (Dublin) and Vercel's default region is iad1. Per-route overrides go in `vercel.functionRules`.
- Nitro `routeRules` proxies to external URLs become **Vercel CDN rewrites** (no function call). That suits PostHog `/ingest`.
- `convex deploy` runs `--cmd` **before** pushing functions. `--preview-run fn` runs **only when the preview deployment is new**: `preview/multiutente` already exists, so seed it by hand.
- Build order must be `vite build && tsc -b` (as in Start's docs), because `routeTree.gen.ts` is generated by the build. Alternatively, commit `routeTree.gen.ts`.

```ts
// vite.config.ts
export default defineConfig({
  server: { port: Number(process.env.PORT) || 3100, strictPort: true,
            allowedHosts: ['t3node.tail4a8e3b.ts.net'] }, // Vite blocks unknown hosts; *.localhost is allowed by default (portless)
  resolve: { tsconfigPaths: true },
  ssr: { noExternal: ['@convex-dev/better-auth'] },          // required by the Better Auth guide
  plugins: [
    tanstackStart(),
    nitro({
      vercel: { functions: { regions: ['dub1'] } },
      routeRules: {
        '/ingest/static/**': { proxy: 'https://eu-assets.i.posthog.com/static/**' },
        '/ingest/**': { proxy: 'https://eu.i.posthog.com/**' },
      },
    }),
    viteReact(),
  ],
})
```

## File layout (Phase 3)
```
src/router.tsx                 getRouter(): per-request QueryClient + ConvexQueryClient
src/start.ts                   (optional) createStart({requestMiddleware:[csrf,...]})
src/server.ts                  (optional) createServerEntry: Sentry wrapper
src/routeTree.gen.ts           generated
src/routes/__root.tsx          <html> shell, head(), theme cookie, token → ConvexBetterAuthProvider
src/routes/index.tsx           landing; beforeLoad: ?chat=x → 308 /gabrifila?chat=x
src/routes/dati.tsx            beforeLoad: 308 → /$handle/dati {handle:'gabrifila'}, hash+search kept
src/routes/benvenuto.tsx, privacy.tsx
src/routes/$handle.tsx         layout: validate handle regex → notFound; loader prefetches page; head() OG/JSON-LD/theme tokens
src/routes/$handle.index.tsx   Sul palco    ('/$handle/')
src/routes/$handle.dati.tsx    I dati       ('/$handle/dati')
src/routes/$handle.modifica.tsx  guard in beforeLoad (non-owner → redirect /$handle)
src/routes/api/auth/$.ts       GET/POST → handler(request) (proxy to Convex site)
src/routes/api/chat/index.ts   POST SSE (Oracolo);  api/chat/history.ts  GET
src/routes/mcp.ts              GET/POST/DELETE (MCP SDK web-standard transport)
src/routes/[.]well-known/oauth-protected-resource.ts   (MCP OAuth metadata)
src/routes/og/$handle.ts       OG image
src/lib/auth-client.ts, src/lib/auth-server.ts
shared/ (or src/shared/)       single Zod schema; Convex can import files outside convex/ (esbuild bundles them)
convex/convex.config.ts, auth.config.ts, auth.ts, http.ts, schema.ts, betterAuth/{convex.config,schema,adapter,auth}.ts,
convex/lib/{ownership,km}.ts, files.ts, rateLimits.ts, geo.ts, seed.ts, crons.ts, *.test.ts, tsconfig.json
```
Delete `index.html` and `src/main.tsx` (Start owns the document). Move icons, manifest, theme-color and fonts into the root `head()`, and load styles with `links:[{rel:'stylesheet',href: appCss}]` where `appCss` comes from `import appCss from '../styles.css?url'`.

## Convex + TanStack Query SSR (official pattern)
```tsx
// src/router.tsx
export function getRouter() {
  if (typeof document !== 'undefined') notifyManager.setScheduler(window.requestAnimationFrame)
  // see the expectAuth risk: only wait for auth when SSR saw a session
  const expectAuth = typeof document !== 'undefined' && document.documentElement.dataset.auth === '1'
  const convexQueryClient = new ConvexQueryClient(import.meta.env.VITE_CONVEX_URL, { expectAuth })
  const queryClient = new QueryClient({ defaultOptions: { queries: {
    queryKeyHashFn: convexQueryClient.hashFn(), queryFn: convexQueryClient.queryFn() } } })
  convexQueryClient.connect(queryClient)
  const router = createRouter({ routeTree, context: { queryClient, convexQueryClient },
    defaultPreload: 'intent', defaultPreloadStaleTime: 0, scrollRestoration: true })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}
```
- **Loaders:** current Convex docs use `await context.queryClient.query({ ...convexQuery(api.x, args), staleTime: 'static' })`; `ensureQueryData` also works. Components read the same data with `useSuspenseQuery(convexQuery(api.x, args))`.
- **SSR on the server:** `ConvexHttpClient.consistentQuery` (one logical timestamp, two round trips). `dangerouslyUseInconsistentQueriesDuringSSR` trades that for one round trip.
- **Staying subscribed after hydration** (checked in the source): hydrated queries fire the QueryCache `added` event, and `ConvexQueryClient` then calls `convexClient.watchQuery` over WebSocket. The page stays live until `gcTime` (default 5 min) after the last observer. `staleTime` is `Infinity`.
- **Root route:** a `createServerFn` calls `getToken()`. Then `ctx.context.convexQueryClient.serverHttpClient?.setAuth(token)` (server-only, per request) and return `{token, isAuthenticated}`. Wrap the app in `<ConvexBetterAuthProvider client={convexQueryClient.convexClient} authClient={authClient} initialToken={token}>`. Render `<html lang="it" data-tema={tema} data-theme={...} data-auth={token?'1':undefined} suppressHydrationWarning>`.
- **Theme without a flash:** read the `tema` cookie in root `beforeLoad` (server: `getCookie('tema')`; client: `document.cookie`, via `createIsomorphicFn`) and SSR `data-theme` for `light` or `dark`. Only `system` needs the existing 3-line matchMedia script; put it in `<ScriptOnce>` in `<head>`. Set the cookie on the client (non-httpOnly, SameSite=Lax, 1 year) and migrate the old `localStorage.theme` once.
- `App.tsx` reads `localStorage`/`matchMedia` inside `useState` initializers (around lines 2460 and 2511). Under SSR that gives hydration mismatches; move those reads into effects or the cookie.
- **`$handle` head():**
  - build it from `loaderData`: `meta` (og:*, twitter:*), `links` (canonical), and `scripts:[{type:'application/ld+json', children: JSON.stringify(ld).replace(/</g,'\\u003c')}]`;
  - put theme tokens in `styles:[{children: ':root{--accent:…}'}]`, only from zod-validated values (hex colours, enums) so user data cannot inject `</style>`;
  - absolute URLs come from `getRequestUrl().origin` on the server and `location.origin` on the client;
  - a missing handle gets `notFound()`; an old handle (alias) gets `redirect(..., statusCode: 301)`.
- **`/modifica` guard:** in `beforeLoad`, `if(!context.isAuthenticated) throw redirect({to:'/$handle',params})`. Then `const me = await queryClient.query({...convexQuery(api.profiles.mine,{}), staleTime:'static'})` and redirect if `me?.handle !== params.handle`. This is UX only; the real check is `requireOwner` inside every mutation.
- **Sign-out:** the docs recommend `location.reload()` after `authClient.signOut` because of `expectAuth`. Use a full page load after the OTP login as well.

## Better Auth on Convex (TanStack Start guide + example `convex/better-auth` repo, `examples/tanstack`)
- **`convex/auth.config.ts`:** `export default { providers:[getAuthConfigProvider()] } satisfies AuthConfig` (from `@convex-dev/better-auth/auth-config`).
- **`convex/auth.ts`:**
  - `createAuthOptions(ctx)` returns `{baseURL: process.env.SITE_URL, database: authComponent.adapter(ctx), socialProviders:{google}, plugins:[emailOTP(...), convex({authConfig}), ...]} satisfies BetterAuthOptions`;
  - `createAuth = ctx => betterAuth(createAuthOptions(ctx))`, imported from `better-auth/minimal`;
  - `authComponent = createClient<DataModel, typeof authSchema>(components.betterAuth, { local:{schema:authSchema}, authFunctions: internal.auth, triggers:{user:{onCreate...}} })`.
- **`convex/http.ts`:** `authComponent.registerRoutes(http, createAuth)`.
- **`src/lib/auth-server.ts`:** `convexBetterAuthReactStart({ convexUrl, convexSiteUrl })` returns `{handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction}`. `src/routes/api/auth/$.ts` sets `server.handlers` GET/POST to `({request}) => handler(request)`.
- **`src/lib/auth-client.ts`:** `createAuthClient({ plugins:[convexClient(), emailOTPClient()] })` with `convexClient` from `@convex-dev/better-auth/client/plugins`.
- **Local install** (`convex/betterAuth/{convex.config.ts (defineComponent('betterAuth')), schema.ts (generated), adapter.ts (createApi(schema, createAuthOptions)), auth.ts (createAuth({} as any), used only for schema generation)}`, registered with `app.use(betterAuth from './betterAuth/convex.config')`) is **required** for plugins outside the supported list: api-key, oauth-provider/MCP, and probably oAuthProxy. Supported out of the box: anonymous, email-otp, generic-oauth, jwt, magic-link, one-tap, phone, 2FA, username. Regenerate the schema after every Better Auth upgrade: `cd convex/betterAuth && pnpm dlx auth@1.6.33 generate`.
- **Identity:** `identity.subject` is the Better Auth user `_id`. `authComponent.safeGetAuthUser(ctx)` also checks that `identity.sessionId` still exists and has not expired; the JWT alone stays valid until it expires.

## Convex components and config
```ts
// convex/convex.config.ts
const app = defineApp(); app.use(betterAuth /* ./betterAuth/convex.config */); app.use(rateLimiter /* @convex-dev/rate-limiter/convex.config.js */); export default app
// convex/rateLimits.ts
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  oracoloThread: { kind:'token bucket', rate:20, period:HOUR, capacity:5 },
  oracoloPage:   { kind:'fixed window', rate:300, period:DAY },
  nominatim:     { kind:'token bucket', rate:1, period:SECOND, capacity:1 }, // limit(ctx,'nominatim',{reserve:true}) → scheduler.runAfter(retryAfter, internal.geo.fetch)
  agentWrites:   { kind:'token bucket', rate:120, period:MINUTE, capacity:30 },
})
// usage: await rateLimiter.limit(ctx,'oracoloThread',{ key: threadId, throws: true })  // works in mutations and actions
```
- **File storage (logos):**
  1. The `generateLogoUploadUrl` mutation runs the owner check, then `ctx.storage.generateUploadUrl()`. The URL expires in 1 h. Upload size is **not limited**; only the POST times out after 2 min.
  2. The client POSTs the file and gets back `{storageId}`.
  3. The `setGifterLogo({gifterId, storageId: v.id('_storage')})` mutation runs the owner check and reads `ctx.db.system.get('_storage', id)` for `{size, contentType}`. If the file is too large or not `png`/`jpeg`/`webp`, call `ctx.storage.delete(id)` and throw. Otherwise patch, then delete the old logo.

  Queries return `await ctx.storage.getUrl(id)`, a public bearer URL on convex.cloud. Add a cron that cleans up orphaned uploads.
- **Convex 1.47 API:** prefer the 2-argument forms: `ctx.db.get('table', id)`, `ctx.db.patch('table', id, v)`, `ctx.db.delete('table', id)`, `ctx.db.system.get('_storage', id)`. The 1-argument forms are marked "backwards compatibility".
- **Ownership helper:**
  - `requireOwner(ctx, principal, profileId)` with `principal` = `{kind:'session', authUserId: identity.subject}` (from `ctx.auth.getUserIdentity()`) or `{kind:'apiKey'|'oauth', profileId}`;
  - resolve the API-key/OAuth principal *inside Convex* from the raw bearer token (hash lookup or Better Auth verify), with the Start `/mcp` and `/api/*` routes acting as thin proxies;
  - never accept `profileId` from callers.
- **Zod:** keep one schema in `shared/` and feed it to `zodToConvexFields` (schema/args), TanStack Form validators, MCP tool input schemas and the CSV/JSON import.

## Vitest for Convex functions (convex-test)
```ts
// vitest.config.ts (keep it separate from vite.config so Start/Nitro plugins don't load)
export default defineConfig({ test: { passWithNoTests: true, projects: [
  { extends: true, test: { name: 'convex', include: ['convex/**/*.test.ts'], environment: 'edge-runtime',
      server: { deps: { inline: ['convex-test', '@convex-dev/rate-limiter', '@convex-dev/better-auth'] } } } },
  { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts','shared/**/*.test.ts','scripts/**/*.test.ts'], environment: 'node' } },
]}})
// convex/test.setup.ts
/// <reference types="vite/client" />
export const modules = import.meta.glob(['./**/*.ts', '!./betterAuth/**', '!./**/*.test.ts'])
export function setup() {
  const t = convexTest(schema, modules)
  rateLimiterTest.register(t)                                    // from '@convex-dev/rate-limiter/test'
  t.registerComponent('betterAuth', betterAuthSchema, import.meta.glob('./betterAuth/**/*.ts'))
  return t
}
// tests: t.withIdentity({ subject: 'userA', sessionId: 's1' }).mutation(api.concerts.add, …); t.run(ctx=>…); t.fetch('/path') for httpActions;
// vi.useFakeTimers + t.finishInProgressScheduledFunctions(); t.withRequestMetadata({ip}) (>=0.0.59); defineTestApp for component hosts.
```
The `server.deps.inline` line is needed because the component `./test` helpers ship raw `.ts` that uses `import.meta.glob`.

## Local deployments for parallel agents (Convex CLI 1.47 source + docs.convex.dev/cli/agent-mode)
- **The trap:**
  - `CONVEX_AGENT_MODE=anonymous` (or a non-TTY shell) only picks a local/anonymous deployment when **no** `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT` or self-hosted variables are found. The CLI reads `process.env`, then `.env.local`, then `.env`.
  - `t3-env-sync` writes the main checkout's fnox into every worktree's `.env.local`, including `CONVEX_DEPLOYMENT=dev:agile-leopard-908`.
  - So agent mode alone would push to the **shared** dev deployment.
- **Worktree recipe (documented):**
  1. Run `pnpm exec convex deployment create local --select` once. It rewrites `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` in that worktree's `.env.local`. State lives in `<worktree>/.convex/local/default/`; the backend runs as a subprocess of `convex dev`, and ports are picked automatically from 3210 upward.
  2. Seed its env: `openssl rand -base64 32 | tr -d '\n' | pnpm exec convex env set BETTER_AUTH_SECRET` (stdin, so nothing is printed). Then `convex env set SITE_URL https://<wt>.concerti-gabri.localhost:1355` and the same value for `BETTER_AUTH_TRUSTED_ORIGINS`.
  3. Run `pnpm exec convex dev`, then `pnpm exec convex run seed:…`.
  4. Never re-run `t3-env-sync` there without re-running `convex deployment select local`.
  5. Add a guard script that refuses `convex dev` in a worktree whose `CONVEX_DEPLOYMENT` is still the shared dev deployment.
  6. Add `.convex/` to `.gitignore`.
- **Cloud alternative per worktree:** `npx convex deployment create --type dev --select <team>:concerti-gabri:dev/$USER-t3/<wt> --region <eu> --expiration "in 5 days"`, then `npx convex deployment token create agent-token --save-env`. Use it only if a public HTTPS site URL or webhooks are needed.
- **Limits of local deployments:** no public URL (fine for Better Auth through the same-origin `/api/auth` proxy). Google OAuth cannot work on `*.localhost`, so worktree e2e must use the dev OTP sender.

## TypeScript 7 (tsgo 7.0.2), verified locally with `node_modules/.bin/tsc`
- **`baseUrl` is removed:** `TS5102: Option 'baseUrl' has been removed`. The Better Auth example and Nitro's TanStack Start example tsconfigs still use it; use `paths` with relative targets, or Vite's `resolve.tsconfigPaths`.
- **`types` now defaults to `[]`:** `process.env` gives `TS2591` unless you set `"types": ["node"]`. The Convex 1.47 tsconfig template has no `types`, so **add `"types": ["node"]` to `convex/tsconfig.json`**, or `convex dev/deploy` typechecking fails on `process.env.SITE_URL`. The app needs `"types": ["vite/client"]` (or reference directives), and `tsconfig.node.json` needs `node` for `process.env.PORT` in vite.config.
- **`noUncheckedSideEffectImports` defaults to true:** CSS side-effect imports need declarations.
- **No classic JS compiler API:** in the `typescript@7` npm package, `require('typescript').createProgram` is `undefined`. None of the planned tools need it (router-generator uses jiti/prettier; the auth CLI uses prettier; Convex spawns `typescript/bin/tsc` and also knows `@typescript/native` and a `typescriptCompiler: "tsgo"` option). Any lint tool built on the TS API (typescript-eslint, ts-morph) would break.
- The Convex 1.47 tsconfig template is otherwise TS7-clean (no `baseUrl`, `moduleResolution: Bundler`, `lib ["ES2023","dom"]`).
- Start, Router, Better Auth and react-query types are consumed through `.d.ts` with `skipLibCheck`. The repo already builds TanStack Router 1.170 under TS7. Nitro's own TanStack Start example lists `typescript ^7.0.2`.

Reference copies of the official example and docs (for follow-up agents, not in the repo): `/tmp/research-pkgs/ba-example/examples/tanstack/`, `/tmp/research-pkgs/tsr/` (Start docs), `/tmp/research-pkgs/cvx-*.md` (Convex docs).

## Rischi
- Visitors never get live data with expectAuth on: the documented ConvexQueryClient({expectAuth:true}) pauses the WebSocket until setAuth is called, and ConvexBetterAuthProvider never calls it for a signed-out visitor (it only calls clearAuth). Anonymous visitors would then get no live updates, and any query not prefetched by SSR would hang. Mitigation: compute expectAuth on the client from <html data-auth> set by SSR, do a full reload after login and logout, and make owner queries return null instead of throwing. Verify with an e2e test where a visitor sees a concert another client adds, without reloading.
- @convex-dev/better-auth 0.12.5 requires better-auth >=1.6.11 <1.7.0. better-auth@latest is 1.7.12, where MCP/OAuth moved to separate packages, so a plain install breaks the peer. Pin better-auth, @better-auth/api-key and @better-auth/oauth-provider at ~1.6.33, and run the schema CLI as auth@1.6.33.
- The api-key, OAuth-provider/MCP and probably oAuthProxy plugins are outside the Convex Better Auth supported list, so they need a Local Install (convex/betterAuth component with a generated schema). The convex() plugin already embeds better-auth's oidcProvider and jwt plugins, so adding @better-auth/oauth-provider for MCP may collide on /.well-known and /oauth2 endpoints. Spike this before committing to the MCP auth design.
- On Vercel at runtime, process.env.VITE_CONVEX_URL and VITE_CONVEX_SITE_URL are undefined: convex deploy --cmd sets them only for the build, and preview Convex URLs change per branch. The official Better Auth example reads process.env at module scope; server code here must use import.meta.env, which is inlined at build.
- TanStack Start 1.169 removed .inputValidator() (now .validator()), useSession and the nitro-v2 plugin. Most training data and blog code uses the RC APIs.
- Nitro v3 is still a beta (3.0.260903-beta) and is the only path Vercel documents for Start. Pin it exactly and expect churn.
- tsconfig.app.json has verbatimModuleSyntax:true, which the Start docs warn can leak server bundles into the client. That matters here because home coordinates and addresses must never ship; add the bundle-grep leak test early.
- TypeScript 7 removes baseUrl and defaults types to []. Copying the Better Auth or Nitro example tsconfigs fails (TS5102), and convex/tsconfig.json without "types":["node"] makes Convex typechecking fail on process.env, which blocks convex dev and deploy pushes. The TS7 npm package has no JS compiler API, so ts-morph and typescript-eslint style tools won't work.
- CONVEX_AGENT_MODE=anonymous does not isolate a T3 worktree: t3-env-sync writes CONVEX_DEPLOYMENT=dev:agile-leopard-908 into every worktree's .env.local, so agents would push to the shared dev deployment. Use `convex deployment create local --select` per worktree plus a guard script, and never re-run t3-env-sync afterwards without re-selecting local.
- `convex deploy --preview-run` only runs on a newly created preview deployment, and preview/multiutente already exists, so seed it manually or with an idempotent seed run.
- routeTree.gen.ts is generated by vite: the current build script (tsc -b && vite build) fails on a clean checkout. Use `vite build && tsc -b` or commit the generated file.
- App.tsx reads localStorage and matchMedia in useState initializers, which causes hydration mismatches under SSR. The theme must move to a cookie plus SSR data-theme, with a ScriptOnce only for the system mode and suppressHydrationWarning on <html>.
- Vite blocks unknown Host headers in dev: the tailnet URL t3node.tail4a8e3b.ts.net:8444 needs server.allowedHosts. Vite also ignores the PORT env var unless vite.config reads it, which portless relies on in worktrees.
- A Convex identity JWT stays valid until it expires even after a session is revoked or the account deleted. Use authComponent.safeGetAuthUser (it checks the session) for sensitive operations, or accept a short window.
- Injection risk in user data: JSON-LD in head scripts and theme tokens in head styles carry user-entered text. Escape '<' in JSON-LD and allow only zod-validated tokens (hex colours, enums) in CSS.
- Convex upload URLs have no size limit: validate size and contentType after upload via ctx.db.system.get('_storage', id), delete rejected files, and clean up orphans with a cron. Avoid SVG logos.
- The convex-test helpers of components (@convex-dev/rate-limiter/test, @convex-dev/better-auth/test) ship raw TS with import.meta.glob. They probably need test.server.deps.inline in Vitest 5; this is not verified by running it.
- With the default Vercel region iad1, every SSR request crosses the Atlantic to Convex EU (Dublin); set the function region to dub1.
- Unverified, needs a spike: whether Nitro routeRules proxy (for /ingest) and redirect work the same in `vite dev` as on Vercel, and whether Nominatim accepts a custom User-Agent from the default Convex runtime's fetch (a "use node" action is the fallback).

## Fonti
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/build-from-scratch.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/migrate-from-release-candidate.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/hosting.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/server-routes.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/seo.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/tanstack-query.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/environment-variables.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/middleware.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/import-protection.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/selective-ssr.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/server-entry-point.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/router/api/router/RedirectType.md
- https://raw.githubusercontent.com/TanStack/router/main/docs/router/guide/document-head-management.md
- https://vercel.com/docs/frameworks/full-stack/tanstack-start
- https://raw.githubusercontent.com/nitrojs/nitro/main/docs/2.deploy/20.providers/vercel.md
- https://raw.githubusercontent.com/nitrojs/nitro/main/docs/1.docs/61.vite.md
- https://raw.githubusercontent.com/nitrojs/nitro/main/docs/4.examples/vite-ssr-tss-react.md
- https://labs.convex.dev/better-auth/framework-guides/tanstack-start
- https://raw.githubusercontent.com/convex/better-auth/main/docs/content/docs/framework-guides/tanstack-start.mdx
- https://raw.githubusercontent.com/convex/better-auth/main/docs/content/docs/supported-plugins.mdx
- https://raw.githubusercontent.com/convex/better-auth/main/docs/content/docs/features/local-install.mdx
- https://raw.githubusercontent.com/convex/better-auth/main/docs/content/docs/migrations/migrate-to-0-12.mdx
- https://github.com/convex/better-auth/tree/main/examples/tanstack
- https://docs.convex.dev/client/tanstack/tanstack-start.md
- https://docs.convex.dev/quickstart/tanstack-start.md
- https://docs.convex.dev/cli/agent-mode.md
- https://docs.convex.dev/cli/local-deployments.md
- https://docs.convex.dev/testing/convex-test.md
- https://docs.convex.dev/file-storage/upload-files.md
- https://docs.convex.dev/file-storage/serve-files.md
- https://docs.convex.dev/production/hosting/vercel.md
- https://docs.convex.dev/production/regions
- https://ship.convex.dev/changelog/eu-region-hosting-dublin
- https://better-auth.com/docs/1.6/plugins/mcp
- https://discord-questions.convex.dev/m/1428045695113236521
- https://github.com/get-convex/better-auth/pull/154
- npm registry (npm view / npm pack): @tanstack/react-start@1.169.3, @tanstack/start-server-core@1.169.44, @tanstack/start-client-core@1.170.38, @tanstack/start-plugin-core@1.171.54, @tanstack/router-core@1.171.38, @convex-dev/better-auth@0.12.5, @convex-dev/react-query@0.1.0, @convex-dev/rate-limiter@0.4.2, convex-test@0.0.63, convex-helpers@0.1.128, nitro@3.0.260903-beta, @modelcontextprotocol/sdk@1.32.1, better-auth@1.6.33/1.7.12
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/src/browser/sync/client.ts (expectAuth pause)
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/src/react/ConvexAuthState.tsx (setAuth only when authenticated)
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/src/cli/lib/deploymentSelection.ts (anonymous only if no CONVEX_DEPLOYMENT)
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/src/cli/lib/typecheck.ts (tsc/tsgo resolution)
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/src/cli/lib/deploy2.ts (runCommand sets VITE_CONVEX_URL + VITE_CONVEX_SITE_URL)
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/dist/esm/cli/codegen_templates/tsconfig.js
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/SPEC.md
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/PROMPT.md
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/DECISIONI.md
- /home/gabri/.local/bin/t3-env-sync
- Local TS 7.0.2 experiments in /tmp/research-ts7 and /tmp/research-ts7b (baseUrl TS5102, types default [], noUncheckedSideEffectImports)
