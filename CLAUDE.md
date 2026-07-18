# concerti-gabri

Concert dashboard at concerti.gabrifila.me. Vite 8 + React 19 + TypeScript 7, pnpm only.

- Concert data lives in `src/data.ts` (typed: bad enum values fail the build). App code in `src/App.tsx`, styles in `src/styles.css`.
- Verify with `pnpm build` (typecheck + build) before every commit.
- Deploys are git-driven: push to `main` → production; PRs → deploy previews. Never deploy manually.
- A new venue/city needs coordinates in `VENUE_COORDS`/`CITY_COORDS` (in `src/data.ts`), otherwise the map silently skips it — the types can't catch this.
- `VITE_MAPBOX_TOKEN` (Mapbox pk. token) is set in Netlify env vars — never commit tokens.
- AI chat ("L'Oracolo" in the UI): UI in `src/chat/`, endpoint in `netlify/functions/chat.mts` (TanStack AI + Gemini; server env vars listed in `.env.example`). General music questions are answered via the `web_search` server tool — a nested Gemini call with Google Search grounding only (the Gemini API rejects `google_search` mixed with function declarations in one request, so never combine them); the system prompt fences it to music/concert topics, and Gabri's own data still comes only from the `query_concerts` tool. Page sections live in `SECTIONS` (`src/chat/tools.ts`) — the TOC and the chat's navigation tool both derive from it, so add new sections there. Conversations are logged to Upstash Redis under `concerti:chat:log:*` (TTL-bounded, keyed by the client thread id) and served back by `chat-history.mts` (`/api/chat/history`): reading is public (deliberate — no accounts), continuing requires the thread's write key, which lives only in the owner browser's localStorage. Non-production deploys (previews/branch deploys/local dev) log to the separate `concerti:chat:log:preview:*` namespace — kept for debugging, never listed in production's public history; each endpoint reads the namespace its own deploy context writes. Shared key layout in `src/chat/chatlog.ts`.
- TS in `App.tsx` is deliberately loose (converted from untyped JSX): tighten types opportunistically, no blanket refactors.
