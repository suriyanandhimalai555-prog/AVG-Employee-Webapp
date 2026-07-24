// Zod schema for PATCH /app-version — all fields optional so Management can
// update just one field (e.g. flip force_update) without resending the rest.
// Unknown keys (id, createdAt, updatedAt) are stripped by default z.object so
// the external team's full-object payload passes through without validation errors.
import { z } from 'zod';

// TS: PATCH body — every field is optional; the service COALESCEs missing
// fields against the existing DB row so unchanged values are preserved.
export const AppVersionPatchSchema = z.object({
  androidCurrentVersion: z.string().optional(),
  androidMinimalVersion: z.string().optional(),
  iosCurrentVersion:     z.string().optional(),
  iosMinimalVersion:     z.string().optional(),
  // TS: nullable so Management can clear release notes
  forceUpdate:           z.boolean().optional(),
  releaseNotes:          z.string().nullable().optional(),
});

// TS: inferred type keeps the service signature in sync with the schema
export type AppVersionPatch = z.infer<typeof AppVersionPatchSchema>;

// TS: shape of a full config row returned from GET and PATCH
export interface AppVersionConfig {
  androidCurrentVersion: string;
  androidMinimalVersion: string;
  iosCurrentVersion:     string;
  iosMinimalVersion:     string;
  forceUpdate:           boolean;
  releaseNotes:          string | null;
  updatedAt:             string;
}
