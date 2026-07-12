# concerti-gabri

Concert dashboard at concerti.gabrifila.me. Vite 8 + React 19 + TypeScript 7, pnpm only.

- Concert data lives in `src/data.ts` (typed: bad enum values fail the build). App code in `src/App.tsx`, styles in `src/styles.css`.
- Verify with `pnpm build` (typecheck + build) before every commit.
- Deploys are git-driven: push to `main` → production; PRs → deploy previews. Never deploy manually.
- A new venue/city needs coordinates in `VENUE_COORDS`/`CITY_COORDS` (in `src/data.ts`), otherwise the map silently skips it — the types can't catch this.
- `VITE_MAPBOX_TOKEN` (Mapbox pk. token) is set in Netlify env vars — never commit tokens.
- TS in `App.tsx` is deliberately loose (converted from untyped JSX): tighten types opportunistically, no blanket refactors.
