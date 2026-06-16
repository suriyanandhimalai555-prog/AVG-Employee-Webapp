/**
 * useGeolocation — shared GPS hook for all attendance screens.
 *
 * Exposes a consistent { status, coords, errorCode, request } interface so every
 * screen that needs location uses the same capture logic, error codes, and options.
 *
 * status values:
 *   'idle'     — not yet requested
 *   'fetching' — getCurrentPosition in progress
 *   'ready'    — coords available (lat/lng/accuracy numbers)
 *   'error'    — capture failed; errorCode carries the GeolocationPositionError code
 *               (1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT)
 *               or 0 for "geolocation not supported by this browser"
 *
 * coords shape when ready: { lat, lng, accuracy }
 *   accuracy — metres radius reported by the browser for this fix.
 *   The server uses it to widen the geofence tolerance (capped at 100 m server-side).
 *
 * Never resolves to (0,0) — callers must check status === 'ready' before submitting.
 */
import { useState, useCallback } from 'react';

const GEO_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

export const useGeolocation = () => {
  const [status, setStatus]       = useState('idle');
  const [coords, setCoords]       = useState(null);   // { lat, lng, accuracy } when ready
  const [errorCode, setErrorCode] = useState(null);  // GeolocationPositionError.code

  const request = useCallback(() => {
    setStatus('fetching');
    setCoords(null);
    setErrorCode(null);

    if (!navigator.geolocation) {
      // Browser does not support the API at all
      setStatus('error');
      setErrorCode(0);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus('ready');
      },
      (err) => {
        setErrorCode(err.code); // 1 | 2 | 3
        setStatus('error');
      },
      GEO_OPTIONS,
    );
  }, []);

  return { status, coords, errorCode, request };
};
