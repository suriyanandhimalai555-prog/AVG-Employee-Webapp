// src/shared/geo.ts
// Pure geographic helper — no side effects, no I/O.
// Used by the attendance geofence enforcement in attendance.service.ts.

// TS: Earth's mean radius in metres (WGS-84 approximation)
const EARTH_RADIUS_M = 6_371_000;

// TS: Convert degrees to radians — required by Math.sin/cos
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Computes the great-circle distance between two points on Earth using the
 * Haversine formula.  Accuracy is well within the ±1 m margin needed for a
 * 150 m geofence; error only materialises over distances of hundreds of km.
 *
 * @returns Distance in metres (always ≥ 0).
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  // TS: intermediate deltas — typed explicitly to prevent accidental use as degrees
  const dLat: number = toRad(lat2 - lat1);
  const dLng: number = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}
