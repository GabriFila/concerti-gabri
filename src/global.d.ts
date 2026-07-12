// Mapbox GL JS is loaded lazily from the Mapbox CDN at runtime (see the map
// section in App.tsx), so it has no npm package or bundled types here.
declare var mapboxgl: any;

interface Window {
  mapboxgl?: typeof mapboxgl;
}
