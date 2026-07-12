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
public/                 Static assets copied to the site root
  favicon-32.png, icon-192.png, icon-512.png,
  apple-touch-icon.png, manifest.webmanifest
netlify/functions/
  hello.mjs             Test serverless function, served at /api/hello
netlify.toml            Netlify config (build command, publish dir, functions dir)
```

## Development

```sh
npm install
cp .env.example .env    # then fill in VITE_MAPBOX_TOKEN
npm run dev             # dev server with HMR
npm run build           # typecheck (tsc) + production build to dist/
npm run preview         # serve the production build locally
```

`VITE_MAPBOX_TOKEN` is a Mapbox public (`pk.`) token used by the map section.
It is intentionally not committed; for deploys it is set in Netlify under
Site configuration → Environment variables. Without it the site still works —
the map section shows a fallback message.

## Deploys

- **Push to `main`** → Netlify runs `npm run build` and deploys `dist/` to production at https://concerti.gabrifila.me
- **Open a PR** → Netlify builds a deploy preview and links it on the PR

## Testing the function

```sh
curl https://concerti.gabrifila.me/api/hello
```

Expected response:

```json
{"ok":true,"message":"Hello from Netlify Functions!","timestamp":"2026-07-12T10:00:00.000Z"}
```
