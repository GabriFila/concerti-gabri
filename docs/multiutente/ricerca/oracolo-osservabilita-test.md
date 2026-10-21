# Ricognizione: Oracolo, osservabilità, test

> Appunti della ricognizione del 2026-10-21 per PIANO.md (non vincolanti: vince PIANO/DECISIONI).

## ai-obs-tests: research for Phase 3 (checked 2026-10-21 against npm, the shipped tarballs and current docs; repo left untouched)

### 0. Versions (npm view, today)
| pkg | installed in repo | latest | note |
|---|---|---|---|
| @tanstack/ai | 0.40.0 | **0.71.0** | big jump; ai-gemini 0.38.2, ai-react 0.31.1 (needs ai-client 0.40.1, peer ai ^0.71). ai 0.71 has a peer `@opentelemetry/api >=1.9` (Sentry already brings it in) |
| @tanstack/react-start | – | 1.169.3 | pins react-router **1.170.45** exact (repo has ^1.170.18, so bump) |
| nitro | – | 3.0.260903-beta | `nitro/vite` plugin, required for Vercel |
| @convex-dev/rate-limiter | – | 0.4.2 | peer convex ^1.43 (repo has 1.47.0) |
| @sentry/tanstackstart-react | – | **11.8.0** (beta) | `./vite` export, `@sentry/bundler-plugins` 11.8 |
| posthog-js | – | 1.438.13 | optional `@posthog/react` 1.11.3 |
| @playwright/test | – | 1.64.1 | **pin `1.62.1` exactly**: 1.62.0 and 1.62.1 use chromium rev 1234 (already in ~/.cache/ms-playwright with headless_shell-1234); 1.63.0 moves to rev 1243 |
| pixelmatch / pngjs | – | 8.0.0 / 7.0.0 | A/B screenshot diff |
| @convex-dev/better-auth | – | 0.12.5 | peer `better-auth >=1.6.11 <1.7.0`, so pin better-auth 1.6.x (latest is 1.7.12). Exports `./react-start` → `convexBetterAuthReactStart({convexUrl, convexSiteUrl})` returning `{handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction}` |

### 1. TanStack AI: moving netlify/functions/chat.mts and chat-history.mts to Start
**Route shape** (Start 1.169; file `src/routes/api/chat/index.ts`; the static `api` segment outranks `$handle`):
```ts
import { createFileRoute } from '@tanstack/react-router'
import { getRequestIP } from '@tanstack/react-start/server'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { geminiText } from '@tanstack/ai-gemini'
export const Route = createFileRoute('/api/chat/')({
  server: { handlers: { POST: async ({ request }) => {
    // Origin check (ALLOWED_ORIGINS must gain the Vercel URLs, the tailnet URL, localhost:3100 and *.concerti-gabri.localhost:1355)
    const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'   // Vercel overwrites XFF, so it is trustworthy there
    // validate(raw) unchanged; also read forwardedProps.handle and resolve the page profile from Convex
    const abortController = new AbortController(); request.signal.addEventListener('abort', () => abortController.abort())
    const stream = chat({ adapter: geminiText(MODEL), messages, threadId, systemPrompts: [systemPrompt(profileData)],
      tools: [...chatToolDefs, queryConcertsTool, reportUnsupportedTool, webSearchTool, ...(isOwnerWriteMode ? ownerTools : [])],
      agentLoopStrategy: untilAnswered, middleware: [convexChatLog(...)], modelOptions: { maxOutputTokens: 1500, temperature: 0.4 }, abortController })
    return toServerSentEventsResponse(stream, { abortController })
  } } },
})
```
- Netlify-specific pieces and their replacements:
  - `context.ip` / `x-nf-client-connection-ip` → `getRequestIP({xForwardedFor:true})`.
  - `context.deploy.context` / `CONTEXT` → `process.env.VERCEL_ENV` (`production|preview|development`).
  - `export const config = { path }` → file route.
- **The `preview:` namespace goes away.** Each Convex deployment (dev, `preview/multiutente`, prod) is its own database, so the split is physical.
- **Client tools vs server tools**, all of which still work in 0.40 and 0.71:
  - Definitions without `.server()` stay client tools: `set_filters`, `clear_filters`, `go_to_section`, `set_theme` run in the browser via `useChat({ tools: [...client impls] })`.
  - `query_concerts`, `web_search` and `report_unsupported` stay `.server()`.
  - `query_concerts` must now read the page's data from Convex (ConvexHttpClient query by handle) instead of `src/data.ts`.
  - **Owner write tools must be server tools**: `.server(input => fetchAuthMutation(api.concerts.add, input))`, using the session cookie through `getToken()` from `convexBetterAuthReactStart`. Ownership is then enforced by the Convex helper, not by the model.
  - Use `needsApproval: true` (exists in 0.40 and 0.71) for deletes and imports over 10 rows. The client answers with `addToolApprovalResponse`.
  - Do **not** pass client-declared tools through `mergeAgentTools(serverTools, params.tools)`: that would let a browser inject tool declarations. Keep the tool list fixed on the server.
- `forwardedProps` (writeKey, author, add handle) is still how ai-client 0.40 sends extra data. The `body` option is deprecated in favour of `forwardedProps`.
- `chatParamsFromRequest(req)` (in both versions) parses the AG-UI RunAgentInput and throws a 400 `Response`, which Start returns as is. Optional: the existing `validate()` with its size caps is stricter and should stay.
- **Breaking change in middleware `onFinish`:**
  - In 0.71 the engine calls `addTerminalAssistantMessages()` before `runOnFinish`, so `ctx.messages` already contains the final answer.
  - 0.40 does not do this, which is why the current code appends `{role:'assistant', content: info.content}`.
  - If we upgrade, drop that append, or every stored transcript duplicates the last answer.
- `FinishInfo` = `{finishReason, duration, content, usage}`. `ctx.defer(promise)` runs non-blocking work that is awaited after the terminal hook, before the stream closes, so it is safe on Vercel. Use it for the Convex `saveTranscript` mutation.
- **Recommendation on versions:**
  - Milestone 1 (parity): keep 0.40 and port as is.
  - Milestone 6 (Oracolo): upgrade to 0.71/0.38/0.31/0.40 in its own commit. 0.71 adds `@tanstack/ai/testing` → `fakeText()`, a scripted adapter with no network or key, so Vitest can cover middleware, persistence and the "no addresses in Oracolo output" check without spending Gemini calls.
  - `geminiText` reads `GOOGLE_API_KEY` or `GEMINI_API_KEY`, and `gemini-3.1-flash-lite` is in GEMINI_MODELS.
- **chat-history.mts → Convex:**
  - Public queries `chat.listThreads({handle})` and `chat.getThread({threadId})` replace `/api/chat/history`. They are reactive, with no route needed. Never return `writeKey`/`ip`.
  - Store **sha256(writeKey)**, not the plaintext key. Browsers keep sending the plaintext and the server compares hashes. The migration script hashes keys from Upstash.
  - Replace the stored raw IP with an HMAC.
  - Read endpoints can't be rate-limited in Convex queries (the limiter needs a mutation/action ctx). That is acceptable since queries are cached.
- On Vercel set function regions near Convex EU (presumably AWS eu-west-1 → `dub1`): `nitro({ vercel: { functions: { regions: ['dub1'] } } })`. SSE streaming works on Fluid compute (default maxDuration 300 s).

### 2. @convex-dev/rate-limiter
```ts
// convex/convex.config.ts
import { defineApp } from 'convex/server'; import rateLimiter from '@convex-dev/rate-limiter/convex.config.js'
const app = defineApp(); app.use(rateLimiter); export default app
// convex/limits.ts
import { RateLimiter, MINUTE, DAY, SECOND } from '@convex-dev/rate-limiter'
export const limiter = new RateLimiter(components.rateLimiter, {
  chatIpMinute: { kind: 'token bucket', rate: 8, period: MINUTE },          // CHAT_RPM_PER_IP
  chatIpDay:    { kind: 'fixed window', rate: 40, period: DAY },             // CHAT_RPD_PER_IP
  chatGlobalDay:{ kind: 'fixed window', rate: 200, period: DAY },            // CHAT_RPD_GLOBAL
  nominatim:    { kind: 'token bucket', rate: 1, period: 1100, capacity: 1, maxReserved: 10 },
})
```
- `limit(ctx: MutationCtx | ActionCtx, name, {key?, count?, reserve?, throws?, config?})` → `{ok, retryAfter}`. It works from mutations, actions and HTTP actions.
- With `throws: true` it throws a `ConvexError` whose data is `{kind:'RateLimited', name, retryAfter}`. Detect it with `isRateLimitError(e)`.
- Throwing inside a mutation **rolls back every consumption in that transaction**, which is better than Upstash's three independent `.limit()` calls.
- **From the Start route** you can't call the component directly. Expose a public mutation and call it with `new ConvexHttpClient(process.env.VITE_CONVEX_URL!, { logger: false })` and `client.mutation(api.chat.beginTurn, {...})`. For owner calls, use `setAuth(jwt)` or the `auth:` constructor option.
- Because the mutation is public, guard it with a **server-only shared secret**, compared in constant time. Otherwise anyone can drain `chatGlobalDay` and take the chat down.
- Shape of `beginTurn({secret, handle, threadId, writeKeyHash, ipHash})`:
  1. check the secret;
  2. run the three limits with `throws: true`;
  3. check the write-key gate;
  4. return `{ok}`.

  `saveTranscript` is a separate secret-guarded mutation called from `onFinish` through `ctx.defer`.
- Hash the IP with HMAC-SHA256 keyed by the same secret before it leaves the Start server.
- **New env var** not in DECISIONI's map, e.g. `CHAT_SERVER_SECRET`. It goes in fnox, on Vercel (Preview + Production) and on Convex (dev, prod, default preview, `preview/multiutente`). It can be generated without ever being shown, via `openssl rand ... | fnox set --from-file` (see the memory note on fnox stdin).

### 3. Sentry (@sentry/tanstackstart-react 11.8, beta)
- **`sendDefaultPii` no longer exists in v11.**
  - From v11 the `dataCollection` defaults *always* apply, and they collect user IP and id, cookies, request/response headers, **every HTTP body** (incoming and outgoing requests and responses), query params, genAI inputs/outputs, DB query data and stack-frame local variables.
  - DECISIONI's "niente PII di default" therefore has to be written out explicitly, in both client and server init:
```ts
dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: { deny: ['forwarded','-ip','remote-','via','-user'] },
  genAI: { inputs: false, outputs: false }, databaseQueryData: false, queues: false, graphQL: { document: false, variables: false }, stackFrameVariables: false }
```
- **Files:**
  - `src/instrument.client.ts`: `Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, environment, dataCollection, beforeSend: scrub, beforeBreadcrumb })`. **No `replayIntegration()`, no `feedbackIntegration()`, no `tracesSampleRate`**: replay and tracing stay off unless explicitly added.
  - Import it first in `src/client.tsx`, the custom client entry: `hydrateRoot(document, <StrictMode><StartClient/></StrictMode>)` inside `startTransition`.
  - `instrument.server.mjs` (root): `Sentry.init({ dsn: process.env.VITE_SENTRY_DSN, environment: process.env.VERCEL_ENV ?? 'development', dataCollection, beforeSend: scrub })`. Vercel exposes `VITE_SENTRY_DSN` at runtime too, so no new var is needed.
  - **Vercel, without `--import`**:
```ts
// src/server.ts
import '../instrument.server.mjs'
import { wrapFetchWithSentry } from '@sentry/tanstackstart-react'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
export default createServerEntry(wrapFetchWithSentry({ fetch(request: Request) { return handler.fetch(request) } }))
```
    Restriction: only native fetch/http are instrumented, which is fine for error-only monitoring. `wrapFetchWithSentry` calls `flushIfServerless()`, so events are not lost when the function freezes. It also injects `sentry-trace` meta tags into HTML (trace ids only, no PII).
  - `src/start.ts`: `export const startInstance = createStart(() => ({ requestMiddleware: [sentryGlobalRequestMiddleware], functionMiddleware: [sentryGlobalFunctionMiddleware] }))`. Sentry's must come first in each array.
  - **SSR render errors are not captured by the middleware**: call `Sentry.captureException` in the route `errorComponent` (inside a `useEffect`).
- **vite.config.ts**:
```ts
plugins: [
  tanstackStart(),
  nitro({ ... }),
  viteReact(),
  sentryTanstackStart({ org: 'gabriele-filaferro', project: 'concerti-gabri', authToken: process.env.SENTRY_AUTH_TOKEN, autoInstrumentMiddleware: false }),
]
```
  - Sentry's plugin goes last; import it from `@sentry/tanstackstart-react/vite`.
  - If `build.sourcemap` is unset, the plugin enables `'hidden'` source maps and deletes the .map files after upload, so no maps are served.
  - The EU region needs no `url` because org tokens carry it. That's an assumption: verify with the first preview build.
  - Optional: `tunnelRoute: true` creates a same-origin tunnel route, which helps against ad blockers and also passes events through our server.
- **Scrubbing** (shared `src/lib/scrub.ts`, used by client and server `beforeSend`/`beforeBreadcrumb`):
  - Walk the event recursively: `message`, `exception.values[].value`, `breadcrumbs[].message/data`, `extra`, `contexts`, `request.data/query_string`, `tags`.
  - Replace values whose key matches `/^(address|indirizzo|street|lat|lng|lon|latitude|longitude|coords?|coordinates|geo)$/i` with `[Filtered]`.
  - Replace coordinate-looking strings `/-?\d{1,3}\.\d{3,}\s*[,; ]\s*-?\d{1,3}\.\d{3,}/g` with `[coords]`.
  - Drop `console` and `ui.input` breadcrumbs.
  - Never put an address in a ConvexError message: errors should carry ids or links (`/<handle>/modifica#partenze`).
- `environment` on the client: Vite doesn't see `VERCEL_ENV`, so use `define: { __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? 'development') }`.

### 4. PostHog (cookieless, EU, /ingest)
```ts
// in src/client.tsx (browser only, never in SSR code), guarded by import.meta.env.VITE_POSTHOG_KEY
posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: '/ingest', ui_host: 'https://eu.posthog.com', defaults: '2026-05-30',
  cookieless_mode: 'always',            // also requires Project Settings > Web analytics > "Cookieless server hash mode" ON
  autocapture: false, capture_dead_clicks: false, rageclick: false, capture_heatmaps: false,
  capture_pageview: 'history_change', capture_pageleave: true,
  disable_session_recording: true, capture_exceptions: false /* Sentry does errors */, capture_performance: false,
  disable_surveys: true, disable_web_experiments: true, disable_external_dependency_loading: true,
  person_profiles: 'identified_only', before_send: e => scrubPosthog(e),
  // e2e only: disable_compression: true (otherwise payloads are gzip+base64 and the leak test can't grep them)
})
```
- **Identify in `'always'` mode:**
  - posthog-js uses memory-only persistence with distinct_id `$posthog_cookieless`; the server derives the id as hash(team_id, daily salt, IP, UA, host).
  - `identify()` **still works** but persists nothing, so it has to be called **on every page load** once the Better Auth session is known.
  - Call it as `posthog.identify(profileId /* opaque Convex id, never the email */, { handle })`, and `posthog.reset()` on logout.
  - PostHog's docs warn that a persistent id is personal data, so `/privacy` should say owners are identified by an opaque id.
  - `alias()` events are dropped in this mode.
- **Reverse proxy, the key finding:**
  - The Nitro Vite plugin installs a **pre** middleware in dev (`nitroDevMiddlewarePre`, source checked). It sends every non-asset request (e.g. `POST /ingest/e/`) into Nitro/Start before Vite's internal middlewares run.
  - So a **Vite `server.proxy` for `/ingest` is shadowed in dev when `nitro()` is active**. Start returns 404, or `/ingest` alone hits `$handle`.
  - Without nitro, Start's own dev middleware is a post hook and `server.proxy` would work.
  - Recommended single source of truth, Nitro route rules:
```ts
nitro({ routeRules: {
  '/ingest/static/**': { proxy: 'https://eu-assets.i.posthog.com/static/**' },
  '/ingest/array/**':  { proxy: 'https://eu-assets.i.posthog.com/array/**' },
  '/ingest/**':        { proxy: 'https://eu.i.posthog.com/**' },
}, vercel: { functions: { regions: ['dub1'] } } })
```
  - In dev, Nitro's devApp serves the proxy (worth checking with a curl POST).
  - On Vercel, the preset (source checked, `generateBuildConfig`) compiles any proxy to an external `https://` URL with no advanced options into **CDN rewrites placed before `{handle:'filesystem'}`**, sorted deepest path first. No function runs.
  - **Caveat:** route rules that only set headers are emitted *before* the proxy rewrites. A site-wide `'/**': { headers }` rule (no `continue`) would shadow them, which is the bug in learn-tanstack-start PR #417. Put security headers in vercel.json `headers` instead.
- **Alternative**, the official PostHog Vercel recipe:
  - `vercel.json` `rewrites` in the same three-rule order: static, array, then catch-all.
  - With framework output, vercel.json rewrites are merged into the filesystem phase, ahead of Nitro's catch-all. Source for that is the community PR, not Vercel's docs.
  - It still needs a dev-time solution, and given the shadowing above that means Nitro route rules anyway.
- Unverified: whether Vercel's external rewrite forwards the real client IP to PostHog. If it doesn't, the cookieless hash collapses visitors and unique-user counts are wrong. Check the counts after the first preview. "Discard client IP data" is ON.

### 5. Playwright e2e and parity screenshots
- `devDependencies`: `"@playwright/test": "1.62.1"`, `"playwright-core": "1.62.1"` (exact, chromium 1234), plus `pixelmatch@8`, `pngjs@7`, `@types/pngjs`.
- **Local Convex for e2e and parallel agents:**
  - The session env already exports `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL` (names checked, values not printed).
  - The CLI returns early when `CONVEX_DEPLOYMENT` is set, and Vite gives existing process env priority over `.env.local`.
  - So e2e and worktree agents **must unset them**: `env -u CONVEX_DEPLOYMENT -u VITE_CONVEX_URL -u VITE_CONVEX_SITE_URL CONVEX_AGENT_MODE=anonymous pnpm exec convex dev --tail-logs disable`, or `--env-file .env.e2e`. Otherwise they silently hit the shared cloud dev `agile-leopard-908`.
  - The local backend picks the first free ports from **3210** (cloud) and **3211** (site), auto-incrementing (hidden flags `--local-cloud-port` / `--local-site-port`). State lives in `<repo>/.convex/local/default`, one per worktree.
  - `npx convex init` → `npx convex env set` (accepts stdin or `--from-file`) → `npx convex dev --once`.
  - Local env needs `BETTER_AUTH_SECRET` (generate it), `SITE_URL` = e2e origin, `DEV_OTP_SINK=1` and `CHAT_SERVER_SECRET`.
  - `"use node"` actions on local deployments use the configured Node version (20/22/24, set in `convex.json`).
- **Dev OTP:**
  - Better Auth's `testUtils({captureOTP:true})` keeps OTPs **in process memory**, which won't survive across Convex function invocations.
  - Instead, the `emailOTP({ sendVerificationOTP })` dev sender does `ctx.runMutation(internal.devOtp.record, {email, otp})`. It's enabled only when `process.env.DEV_OTP_SINK === '1'`, and also refuses when `SITE_URL` is the prod domain.
  - The test reads it with `execFileSync('pnpm', ['exec','convex','run','devOtp:latest', JSON.stringify({email})], {env: envWithoutCloudDeployment})`. The CLI's admin key can run internal functions, so nothing is public.
- **playwright.config.ts sketch:**
  - `workers: 1`, which fits the 4-vCPU box and a shared local backend.
  - `use: { baseURL, reducedMotion: 'reduce', launchOptions: { args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] } }`. The app already honours prefers-reduced-motion (count-ups, glide scroll, CSS), and the GL flags keep Mapbox alive headless.
  - Projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7).
  - `webServer: [{name:'convex', command:<unset-env convex dev>, url:'http://127.0.0.1:3210/version' /*verify endpoint*/, timeout:180_000, reuseExistingServer:true}, {name:'app', command:'pnpm dev --port $E2E_PORT --strictPort', env:{VITE_CONVEX_URL:'http://127.0.0.1:3210', VITE_CONVEX_SITE_URL:'http://127.0.0.1:3211'}, url:...}]`.
  - Use a dedicated E2E_PORT or portless, **not 3100**: `reuseExistingServer` would otherwise latch onto the manual dev server connected to cloud dev.
  - The Google login test is manual, on 3100 plus the tailnet URL plus cloud dev.
- **Leak test:**
  - `page.route` / `page.on('request')` on `/ingest/**` (needs `disable_compression` in the e2e build) and on the Sentry envelope URL.
  - Point the server-side Sentry DSN at a local sink, e.g. `http://public@127.0.0.1:<port>/1`, a tiny HTTP server inside the test, and grep its envelopes.
- **Parity vs `main`:**
  - `git worktree add /tmp/concerti-main main && cd … && pnpm install --frozen-lockfile && pnpm build && pnpm exec vite preview --port 4173 --strictPort` (do not touch the main checkout).
  - Shoot main `/` and `/dati` against new `/gabrifila` and `/gabrifila/dati`, light and dark, desktop and mobile.
  - Theme: main reads `localStorage.theme` (`addInitScript`); the new app reads a cookie (`context.addCookies`).
  - Wait for `document.fonts.ready` and `#sec-archivio`. Call `page.screenshot({fullPage:true, animations:'disabled', mask:[page.locator('canvas.mapboxgl-canvas'), …dynamic]})`.
  - Diff with pixelmatch (threshold ~0.1, report the ratio), attach the diff PNG via `testInfo.attach`, and treat a page-height mismatch as a failure in its own right.
  - **Don't use `page.clock`** on the SSR app: the server renders with the real date, and a frozen client clock causes hydration mismatches. Capture both builds on the same day instead.
  - The map is masked: the URL-restricted pk. token may refuse port 4173.
  - Alternative: Playwright's own `toHaveScreenshot`, with two projects sharing a `snapshotPathTemplate` without `{projectName}`, running `--project=main --update-snapshots` first and then `--project=start`.

### 6. Nominatim from a Convex action
- Policy: **at most 1 req/s** absolute, single thread; an identifying UA (stock library UAs are rejected); results **must be cached**; no autocomplete; attribution required. API 5.3.3 `/search`: `q` or structured fields, `format=jsonv2`, `limit` ≤40, `addressdetails=1`, `accept-language=it`, `countrycodes`, `layer=poi,address`, `email`. `lat`/`lon` come back as strings.
```ts
// convex/geocode.ts
const UA = 'concerti-gabri/1.0 (+https://concerti.gabrifila.me)'
const BASE = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org'
async function nominatim(ctx: ActionCtx, params: Record<string,string>) {
  const r = await limiter.limit(ctx, 'nominatim', { reserve: true })   // global key = one queue across all users
  if (!r.ok) throw new ConvexError({ kind: 'geocoder_busy' })          // over maxReserved
  if (r.retryAfter) await new Promise(res => setTimeout(res, r.retryAfter))
  const url = new URL('/search', BASE)
  Object.entries({ format: 'jsonv2', limit: '5', addressdetails: '1', 'accept-language': 'it', ...params }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new ConvexError({ kind: 'geocoder_unavailable', status: res.status })
  return (await res.json()) as Array<{ lat: string; lon: string; display_name: string; name?: string; osm_type: string; osm_id: number; category: string; type: string; address?: Record<string,string> }>
}
export const searchVenue = action({ args: { query: v.string() }, handler: async (ctx, { query }) => {
  await requireOwner(ctx)  // only logged-in users geocode
  const key = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const hit = await ctx.runQuery(internal.geocode.cached, { key }); if (hit) return hit.results
  const results = (await nominatim(ctx, { q: query, layer: 'poi,address' })).map(h => ({ name: h.name ?? h.display_name, displayName: h.display_name, lng: +h.lon, lat: +h.lat, osm: `${h.osm_type[0].toUpperCase()}${h.osm_id}`, city: h.address?.city ?? h.address?.town ?? h.address?.village }))
  await ctx.runMutation(internal.geocode.store, { key, results }); return results
} })
```
- Search on submit only, then the user picks a candidate.
- The shared cache table is **for venues only**. Departure geocoding uses a separate internal action: the result goes straight into the private departure doc, which also triggers the server-side km recompute with fresh jitter. It is never cached in a shared table, never `console.log`ged (Convex logs are visible in the dashboard), and never returned.
- Show "© OpenStreetMap contributors" next to the picker.
- `NOMINATIM_URL` is the switchable base DECISIONI asks for. It is a new optional Convex env var with a default.
- **Unverified:** whether Convex's default V8 runtime keeps a custom `User-Agent` on `fetch`. Check once with a dev action against an echo endpoint. Fallback: put the action in a `"use node"` file.
- `setTimeout` in actions: I believe it works, but the docs don't list it, so the sleep pattern needs a quick test.

## Rischi
- Sentry SDK v11 removed sendDefaultPii; dataCollection defaults ALWAYS collect user IP, cookies, headers, all HTTP bodies, query params, genAI inputs/outputs and stack locals. Without an explicit restrictive dataCollection block, mutation/server-fn bodies (which can carry departure addresses) and Oracolo prompts would be sent to Sentry. Passing sendDefaultPii:false would just be a TS error/no-op.
- Nitro's vite dev plugin registers a PRE middleware that routes non-asset requests (POST /ingest/e/) into Start before Vite's proxy runs, so vite server.proxy for /ingest is likely shadowed in dev. Use Nitro routeRules proxy (dev + Vercel CDN rewrite). Verify with curl -X POST to /ingest/e/ on the dev server.
- Nitro emits headers-only routeRules before its proxy rewrites in .vercel/output/config.json; a site-wide '/**' headers rule without continue silently disables the /ingest rewrites on Vercel. Put security headers in vercel.json instead.
- vercel.json rewrites vs Nitro routes precedence is only documented by a community PR (merged into filesystem phase, ahead of server catch-all), not by Vercel docs; Vercel external rewrites may not forward the client IP, which would collapse PostHog cookieless unique-user hashes. Verify on the preview.
- TanStack AI 0.40 -> 0.71 upgrade changes onFinish: ctx.messages already includes the final assistant message, so the current manual append would duplicate it in stored transcripts. The fakeText test adapter only exists in 0.71. ai-react 0.31 requires ai ^0.71 (lockstep upgrade).
- CONVEX_DEPLOYMENT/VITE_CONVEX_URL/VITE_CONVEX_SITE_URL are exported in the session env from fnox; Convex CLI and Vite give process env precedence, so e2e/parallel agents silently target the shared cloud dev agile-leopard-908 unless these are unset (env -u) before starting a local/anonymous deployment. reuseExistingServer on port 3100 has the same trap.
- Rate-limit and transcript mutations called from the Start route via ConvexHttpClient are public; they need a server-only shared secret (new env var, e.g. CHAT_SERVER_SECRET, absent from DECISIONI's env map: fnox + Vercel Preview/Prod + Convex dev/prod/preview defaults) or anyone can exhaust the global chat quota or forge transcripts.
- PostHog cookieless 'always' keeps identity in memory only: identify() must run on every page load for owners; PostHog docs flag a persistent distinct id as personal data, so /privacy must mention it. Payloads are gzip-compressed by default, so leak tests need disable_compression in the e2e build.
- @playwright/test must be pinned exactly to 1.62.1 (and playwright-core bumped 1.62.0->1.62.1); any caret range resolves to 1.64.x whose Chromium revision is not installed.
- Better Auth testUtils captureOTP stores OTPs in process memory and won't work across Convex function invocations; a Convex-table dev OTP sink gated by an env flag (and refusing on the prod SITE_URL) is needed.
- @convex-dev/better-auth 0.12.5 peer requires better-auth >=1.6.11 <1.7.0 while latest better-auth is 1.7.12: pin 1.6.x.
- Unverified: Convex default runtime may drop a custom User-Agent on fetch (Nominatim rejects stock UAs) and setTimeout availability in actions; test once, else move geocoding to a 'use node' action (Node version from convex.json, also required locally for local deployments).
- Nominatim from Convex cloud runs on shared AWS IPs: a block caused by other tenants is possible; keep NOMINATIM_URL switchable and surface geocoder errors with a 'riprova' message. Departure addresses go to a third party (OSMF): mention in /privacy; never cache them in the shared venue cache or log them.
- Parity screenshots: page.clock cannot be used with SSR (server renders real date -> hydration mismatch); the map must be masked because the URL-restricted pk. token may reject the vite preview port; main uses localStorage theme while the new app uses a cookie.
- @sentry/tanstackstart-react is beta and the without---import setup only instruments native fetch/http; SSR render errors are not captured by the global middleware (manual captureException in errorComponent). EU org-token region auto-detection by the bundler plugin is assumed, not verified.

## Fonti
- https://tanstack.com/ai/latest/docs/getting-started/quick-start
- npm tarball @tanstack/ai@0.71.0 (dist/esm/index.d.ts, activities/chat/index.js addTerminalAssistantMessages before runOnFinish, middleware/types.d.ts, utilities/chat-params.d.ts, testing/fake-text.d.ts, skills/ai-core/{chat-experience,middleware}/SKILL.md)
- /home/gabri/code/personal/concerti-gabri/node_modules/@tanstack/ai (0.40.0 dist, no terminal-message append; needsApproval present)
- npm tarballs @tanstack/ai-gemini@0.38.2, @tanstack/ai-client@0.40.1, @tanstack/ai-react@0.31.1
- https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
- npm tarball @tanstack/start-server-core@1.169.44 (getRequestIP) and @tanstack/start-plugin-core@1.171.54 (dev-server-plugin post middleware)
- npm tarball nitro@3.0.260903-beta (dist/_build/vite.dev.mjs nitroDevMiddlewarePre; dist/_presets.mjs generateBuildConfig/canUseVercelRewrite)
- https://vercel.com/kb/guide/deploy-a-tanstack-start-app-to-vercel
- https://vercel.com/kb/guide/migrate-a-tanstack-start-app-from-netlify-to-vercel
- https://nitro.build/deploy/providers/vercel
- https://vercel.com/docs/build-output-api/configuration
- https://github.com/nikilok/learn-tanstack-start/pull/417
- https://vercel.com/docs/headers/request-headers
- npm tarball @convex-dev/rate-limiter@0.4.2 (README, dist/client/index.d.ts, dist/shared.d.ts)
- /home/gabri/code/personal/concerti-gabri/node_modules/convex/dist/esm-types/browser/http_client.d.ts and dist/cli.bundle.cjs (CONVEX_AGENT_MODE, chooseLocalBackendPorts from 3210, .convex/local/default)
- https://docs.convex.dev/cli/local-deployments
- https://docs.convex.dev/cli/agent-mode
- https://docs.convex.dev/functions/runtimes
- https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup.md
- https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/configuration/options.md (dataCollection)
- npm tarballs @sentry/core@11.8.0 (types/datacollection.d.ts, no sendDefaultPii) and @sentry/tanstackstart-react@11.8.0 (vite/sentryTanstackStart.d.ts, vite/sourceMaps.d.ts, server/wrapFetchWithSentry.js flushIfServerless)
- https://posthog.com/docs/advanced/proxy/vercel
- https://posthog.com/docs/libraries/tanstack-start
- https://posthog.com/docs/libraries/js/config
- https://posthog.com/docs/privacy/cookieless-tracking
- npm tarballs posthog-js@1.438.13 (lib/src/posthog-core.js cookieless paths) and @posthog/types@1.416.0 (dist/posthog-config.d.ts)
- npm tarball better-auth@1.7.12 (plugins/test-utils captureOTP in-memory) and @convex-dev/better-auth@0.12.5 (react-start/index.d.ts, peerDependencies)
- npm tarballs playwright-core@1.62.1 / 1.63.0 browsers.json (chromium rev 1234 vs 1243); ~/.cache/ms-playwright contents
- https://playwright.dev/docs/test-webserver
- https://playwright.dev/docs/api/class-pageassertions#page-assertions-to-have-screenshot-1
- https://operations.osmfoundation.org/policies/nominatim/
- https://nominatim.org/release-docs/latest/api/Search/
- /home/gabri/code/personal/concerti-gabri/docs/multiutente/{SPEC.md,PROMPT.md,DECISIONI.md}
- /home/gabri/code/personal/concerti-gabri/netlify/functions/chat.mts
- /home/gabri/code/personal/concerti-gabri/netlify/functions/chat-history.mts
- /home/gabri/code/personal/concerti-gabri/src/chat/ChatWidget.tsx
- /home/gabri/code/personal/concerti-gabri/src/chat/tools.ts
- /home/gabri/code/personal/concerti-gabri/src/App.tsx (theme localStorage, prefers-reduced-motion)
- /home/gabri/code/personal/concerti-gabri/vercel.json
