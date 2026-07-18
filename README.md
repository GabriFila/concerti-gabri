# Concerti Gabri

Source for [concerti.gabrifila.me](https://concerti.gabrifila.me), deployed on Netlify.

A React 19 + TypeScript 7 dashboard of every concert Gabri has been to, built with Vite 8.

## Repo structure

```
index.html              Vite entry (head metadata, fonts, theme bootstrap)
src/
  main.tsx              React bootstrap
  App.tsx               The whole dashboard (data, charts, map, archive)
  styles.css            All styles
  chat/
    tools.ts            AI chat tool definitions, shared browser ↔ function
    ChatWidget.tsx      AI chat UI (trigger in the bottom bar + modal)
public/                 Static assets copied to the site root
  favicon-32.png, icon-192.png, icon-512.png,
  apple-touch-icon.png, manifest.webmanifest
netlify/functions/
  chat.mts              AI chat endpoint (/api/chat): rate limit + Gemini via TanStack AI
netlify.toml            Netlify config (build command, publish dir, functions dir)
```

## Development

```sh
pnpm install
cp .env.example .env    # then fill in VITE_MAPBOX_TOKEN
pnpm dev                # dev server with HMR
pnpm build              # typecheck (tsc) + production build to dist/
pnpm preview            # serve the production build locally
```

`VITE_MAPBOX_TOKEN` is a Mapbox public (`pk.`) token used by the map section.
It is intentionally not committed; for deploys it is set in Netlify under
Site configuration → Environment variables. Without it the site still works —
the map section shows a fallback message.

### AI chat

The chat button in the bottom bar talks to `/api/chat` (a Netlify function),
which calls Google Gemini through [TanStack AI](https://tanstack.com/ai).
The model can answer questions about the concert data, change the dashboard
filters and scroll to page sections (filter/navigation tools run in the
browser as TanStack AI client tools). Conversations are ephemeral — nothing
is stored.

Server-side env vars (see `.env.example`; set them in Netlify, never
`VITE_`-prefixed): `GEMINI_API_KEY` (required), `GEMINI_MODEL`, and
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` for persistent rate
limiting (without them a best-effort in-memory limiter is used).

`pnpm dev` serves only the front-end: `/api/chat` needs the Netlify runtime,
so test the chat with `netlify dev` (Netlify CLI) or on a deploy preview.

## Deploys

- **Push to `main`** → Netlify runs `pnpm build` and deploys `dist/` to production at https://concerti.gabrifila.me
- **Open a PR** → Netlify builds a deploy preview and links it on the PR
