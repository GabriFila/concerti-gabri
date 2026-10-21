// Mapbox GL JS is loaded lazily from the Mapbox CDN at runtime (see
// src/dashboard/MapCard.tsx), so it has no npm package or bundled types here.
declare var mapboxgl: any;

interface Window {
  mapboxgl?: typeof mapboxgl;
}

// Inlined at build time by `define` in vite.config.ts (Vercel system env vars):
// the deploy environment and the git branch, for the preview tab title.
declare const __VERCEL_ENV__: string;
declare const __VERCEL_GIT_COMMIT_REF__: string;
