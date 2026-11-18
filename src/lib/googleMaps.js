/**
 * Shared Google Maps configuration for the microsites.
 *
 * The browser key is read from VITE_GOOGLE_MAPS_API_KEY so a tenant can supply
 * their own Cloud project key. The Places API (New) and the Geocoding API must
 * both be enabled on that project (and billing attached) for address
 * autocomplete and distance calculation to work.
 */

// Legacy fallback key shipped with the app. It currently has Places (New)
// disabled and no billing for Geocoding, so autocomplete falls back to
// OpenStreetMap until a valid key is provided.
export const GOOGLE_MAPS_API_KEY =
  import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDhwk7tNH19ACOUo0WUIJsVGSUtVLji_yM';

export function isGoogleMapsLoaded() {
  return Boolean(
    typeof window !== 'undefined'
    && window.google
    && window.google.maps
    && window.google.maps.places
  );
}

export function googlePlacesAvailable() {
  if (!isGoogleMapsLoaded()) return false;
  const places = window.google.maps.places;
  return Boolean(
    (places.AutocompleteSuggestion && places.AutocompleteSuggestion.fetchAutocompleteSuggestions)
    || places.AutocompleteService
  );
}
