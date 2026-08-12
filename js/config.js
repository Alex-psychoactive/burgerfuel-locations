/* ------------------------------------------------------------------
   BurgerFuel Store Locations — configuration
   ------------------------------------------------------------------
   googleMapsApiKey
     Paste a Google Maps JavaScript API key here to render the real
     Google basemap with the medium-contrast greyscale skin below.

     Get one at: https://console.cloud.google.com/google/maps-apis
     Enable "Maps JavaScript API", then restrict the key to your domain.

     Leave it empty and the page falls back to a keyless renderer
     (MapLibre GL + CARTO vector tiles) recoloured to the same
     greyscale skin, so the build is always viewable.
   ------------------------------------------------------------------ */
window.BF_CONFIG = {
  googleMapsApiKey: '',

  // Whole-of-New-Zealand starting view
  center: { lat: -41.0, lng: 173.6 },
  zoom: 5.35,
  minZoom: 4,
  maxZoom: 18
};
