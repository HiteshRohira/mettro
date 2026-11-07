import type { Station } from '@/lib/network';

/** Directions to the reviewed station position, never an ambiguous name search.
 * Leave the origin and transport mode to the maps app and the user's preferences.
 */
export function stationDirectionsUrls(station: Pick<Station, 'lat' | 'lng'>) {
  const destination = encodeURIComponent(`${station.lat},${station.lng}`);
  return {
    apple: `https://maps.apple.com/?daddr=${destination}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${destination}&dir_action=navigate`,
  };
}
