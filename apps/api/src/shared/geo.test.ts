import { describe, it, expect } from 'vitest';
import { haversineMeters } from './geo';

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMeters(13.0827, 80.2707, 13.0827, 80.2707)).toBe(0);
  });

  it('computes ~111km between degree-1 latitude step at the equator', () => {
    const dist = haversineMeters(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });

  it('computes distance within geofence tolerance (150m branch, 50m away)', () => {
    // Roughly 50m north of the branch
    const branchLat = 12.9716;
    const branchLng = 77.5946;
    const userLat   = 12.97205; // ~50m north
    const dist = haversineMeters(branchLat, branchLng, userLat, branchLng);
    expect(dist).toBeLessThan(150);
  });

  it('computes distance outside geofence (150m branch, 250m away)', () => {
    const branchLat = 12.9716;
    const branchLng = 77.5946;
    const userLat   = 12.9739; // ~250m north
    const dist = haversineMeters(branchLat, branchLng, userLat, branchLng);
    expect(dist).toBeGreaterThan(150);
  });

  it('handles north pole coordinate without NaN', () => {
    const dist = haversineMeters(90, 0, 90, 0);
    expect(Number.isFinite(dist)).toBe(true);
    expect(dist).toBe(0);
  });

  it('handles antimeridian crossing (lng 179 to -179)', () => {
    // Points on opposite sides of the antimeridian, very close together
    const dist = haversineMeters(0, 179.9999, 0, -179.9999);
    // Should be ~22m, not ~40_000km
    expect(dist).toBeLessThan(100);
  });

  it('returns non-negative for any input', () => {
    expect(haversineMeters(-33.87, 151.21, 51.51, -0.13)).toBeGreaterThan(0);
  });
});
