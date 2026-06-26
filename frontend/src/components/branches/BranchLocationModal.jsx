// BranchLocationModal — set or clear the GPS geofence for a branch.
// Features: manual lat/lng/radius inputs, "Use my current location" button
// (fills coords from device GPS via useGeolocation), and a "Clear geofence" path.
//
// The clear path sends { latitude: null, longitude: null, geofenceRadiusM: null }.
// This is valid because branch.schema.ts marks geofenceRadiusM as .nullable().optional()
// and the service uses COALESCE, so clearing only nulls the coordinates.
//
// Props:
//   isOpen  — boolean
//   branch  — branch row (must have id, name, latitude, longitude, geofence_radius_m)
//   onClose — () => void
import { useState, useEffect } from 'react';
import {
  Navigation, Loader2, Check, X, MapPin, AlertCircle,
} from 'lucide-react';
import { GlassModal } from '../GlassModal';
import { useSetBranchLocationMutation } from '../../store/api/apiSlice';
import { useGeolocation } from '../../hooks/useGeolocation';

export const BranchLocationModal = ({ isOpen, branch, onClose }) => {
  const [setBranchLocation, { isLoading: saving }] = useSetBranchLocationMutation();
  const geo = useGeolocation();

  const [lat,    setLat]    = useState('');
  const [lng,    setLng]    = useState('');
  const [radius, setRadius] = useState('150');
  const [gpsMsg, setGpsMsg] = useState(''); // '' | 'fetching' | 'ready' | 'blocked'
  const [err,    setErr]    = useState('');
  const [clearing, setClearing] = useState(false);

  const hasGeofence = branch?.latitude != null && branch?.longitude != null;

  // Populate form when modal opens (or branch changes).
  useEffect(() => {
    if (isOpen && branch) {
      setLat(hasGeofence ? String(parseFloat(branch.latitude)) : '');
      setLng(hasGeofence ? String(parseFloat(branch.longitude)) : '');
      setRadius(branch.geofence_radius_m != null ? String(branch.geofence_radius_m) : '150');
      setErr('');
      setGpsMsg('');
    }
  }, [isOpen, branch]);

  // Sync GPS hook status → local gpsMsg, auto-fill coords when ready.
  useEffect(() => {
    if (geo.status === 'fetching') {
      setGpsMsg('fetching');
    } else if (geo.status === 'ready' && geo.coords) {
      setLat(geo.coords.lat.toFixed(6));
      setLng(geo.coords.lng.toFixed(6));
      setGpsMsg('ready');
    } else if (geo.status === 'error') {
      setGpsMsg('blocked');
    }
  }, [geo.status, geo.coords]);

  const useMyLocation = () => {
    setGpsMsg('');
    setErr('');
    geo.request();
  };

  const handleSave = async () => {
    const parsedLat    = parseFloat(lat);
    const parsedLng    = parseFloat(lng);
    const parsedRadius = parseInt(radius, 10);

    if (isNaN(parsedLat) || parsedLat < -90  || parsedLat > 90)  {
      setErr('Latitude must be between −90 and 90'); return;
    }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
      setErr('Longitude must be between −180 and 180'); return;
    }
    if (isNaN(parsedRadius) || parsedRadius < 20 || parsedRadius > 5000) {
      setErr('Radius must be between 20 m and 5000 m'); return;
    }
    setErr('');
    try {
      await setBranchLocation({
        id:              branch.id,
        latitude:        parsedLat,
        longitude:       parsedLng,
        geofenceRadiusM: parsedRadius,
      }).unwrap();
      onClose();
    } catch (e) {
      setErr(e?.data?.error?.message || 'Save failed — please try again');
    }
  };

  const handleClear = async () => {
    if (!window.confirm(`Remove the geofence for "${branch?.name}"?\nCheck-in will become unrestricted for this branch.`)) return;
    setClearing(true);
    setErr('');
    try {
      // geofenceRadiusM: null is valid — schema is .nullable().optional()
      await setBranchLocation({
        id:              branch.id,
        latitude:        null,
        longitude:       null,
        geofenceRadiusM: null,
      }).unwrap();
      onClose();
    } catch (e) {
      setErr(e?.data?.error?.message || 'Clear failed — please try again');
    } finally {
      setClearing(false);
    }
  };

  if (!branch) return null;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Branch Location — ${branch.name}`}
    >
      <div className="space-y-4">
        {/* Info banner */}
        <div className="bg-indigo/5 border border-indigo/10 rounded-2xl p-3 flex items-start gap-2.5">
          <MapPin size={13} className="text-indigo flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-navy/60 leading-relaxed">
            Set the GPS coordinates and radius. Employees must be inside the radius to mark
            <strong> office attendance</strong>. Field check-in is never geofenced.
            Branches without a geofence are unrestricted.
          </p>
        </div>

        {/* GPS fill button */}
        <button
          type="button"
          onClick={useMyLocation}
          disabled={gpsMsg === 'fetching'}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-indigo/20 bg-indigo/5 text-xs font-bold text-indigo tactile-press disabled:opacity-50"
        >
          {gpsMsg === 'fetching'
            ? <Loader2 size={13} className="animate-spin" />
            : <Navigation size={13} />}
          {gpsMsg === 'fetching' ? 'Getting your location…' : 'Use my current location'}
        </button>

        {/* GPS feedback */}
        {gpsMsg === 'blocked' && (
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 rounded-xl">
            <AlertCircle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-amber-700 font-medium">
              Location access blocked — enable it in browser settings, or enter coordinates manually below.
            </p>
          </div>
        )}
        {gpsMsg === 'ready' && (
          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-xl">
            <Check size={12} className="text-emerald-500" />
            <p className="text-[10px] text-emerald-700 font-medium">
              Coordinates filled from GPS — review then save.
            </p>
          </div>
        )}

        {/* Lat / Lng inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
              Latitude
            </label>
            <input
              type="number"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              step="0.000001"
              placeholder="e.g. 13.082680"
              className="w-full px-3 py-2.5 text-xs font-medium text-navy rounded-xl border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
            />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
              Longitude
            </label>
            <input
              type="number"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              step="0.000001"
              placeholder="e.g. 80.270721"
              className="w-full px-3 py-2.5 text-xs font-medium text-navy rounded-xl border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
            />
          </div>
        </div>

        {/* Radius */}
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
            Geofence Radius (metres)
          </label>
          <input
            type="number"
            value={radius}
            onChange={(e) => setRadius(e.target.value)}
            min={20}
            max={5000}
            placeholder="150"
            className="w-full px-3 py-2.5 text-xs font-medium text-navy rounded-xl border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
          />
          <p className="text-[9px] text-navy/30 mt-1.5">
            Employees must be within this distance to check in as office. Default 150 m (recommended — accommodates GPS jitter).
          </p>
        </div>

        {/* Error */}
        {err && (
          <div className="flex items-start gap-2 px-3 py-2 bg-red-50 rounded-xl">
            <X size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-red-600 font-medium">{err}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || clearing}
            className="flex-1 py-3 rounded-2xl bg-stone-800 text-white text-xs font-bold tactile-press flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={13} className="animate-spin" />
              : <Check size={13} />}
            {saving ? 'Saving…' : 'Save Geofence'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl bg-navy/5 text-navy/50 text-xs font-bold tactile-press"
          >
            Cancel
          </button>
        </div>

        {/* Clear geofence — only shown when one is set */}
        {hasGeofence && (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving || clearing}
            className="w-full py-2.5 rounded-2xl border border-red-100 bg-red-50 text-red-500 hover:text-red-700 hover:bg-red-100 text-xs font-bold tactile-press flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {clearing
              ? <Loader2 size={12} className="animate-spin" />
              : <X size={12} />}
            {clearing ? 'Clearing…' : 'Clear Geofence (make unrestricted)'}
          </button>
        )}
      </div>
    </GlassModal>
  );
};
