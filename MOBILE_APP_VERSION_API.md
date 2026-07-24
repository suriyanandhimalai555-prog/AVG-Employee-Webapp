# Mobile App Version Gate — API Reference

This document is for the mobile app team. It describes the two endpoints used to check and control the app version gate.

---

## Overview

The EMS backend now exposes a single-row config that your app should check **on every launch, before showing the login screen**. Management can update the version strings and flip a force-update flag at any time from the admin panel. No app store release needed to push a force-update.

---

## Base URL

| Environment | Base URL |
|---|---|
| Production | `https://<your-railway-domain>/api` |
| Local dev  | `http://localhost:3001/api` |

---

## Endpoints

### 1. GET `/api/app-version` — Check current version config

**Authentication:** None. This endpoint is fully public — call it before the user logs in.

**Request**
```
GET /api/app-version
```

No headers, no body, no query params needed.

**Response — 200 OK**
```json
{
  "success": true,
  "data": {
    "androidCurrentVersion": "1.2.0",
    "androidMinimalVersion": "1.0.0",
    "iosCurrentVersion": "1.2.0",
    "iosMinimalVersion": "1.0.0",
    "forceUpdate": false,
    "releaseNotes": "Bug fixes and performance improvements.",
    "updatedAt": "2026-07-24T10:30:00.000Z"
  }
}
```

**Field descriptions**

| Field | Type | Description |
|---|---|---|
| `androidCurrentVersion` | string | Latest available Android build version |
| `androidMinimalVersion` | string | Oldest Android build still allowed to run |
| `iosCurrentVersion` | string | Latest available iOS build version |
| `iosMinimalVersion` | string | Oldest iOS build still allowed to run |
| `forceUpdate` | boolean | If `true`, block the app until the user updates |
| `releaseNotes` | string \| null | What changed — display in the update prompt |
| `updatedAt` | ISO 8601 string | When management last changed this config |

---

### 2. PATCH `/api/app-version` — Update version config (Management only)

**Authentication:** Bearer JWT (Management role only). Your team does not call this — it is called by the EMS admin panel. Documented here for completeness.

**Request**
```
PATCH /api/app-version
Authorization: Bearer <management_jwt>
Content-Type: application/json
```

Body (all fields optional — send only what you want to change):
```json
{
  "androidCurrentVersion": "1.2.0",
  "androidMinimalVersion": "1.0.0",
  "iosCurrentVersion": "1.2.0",
  "iosMinimalVersion": "1.0.0",
  "forceUpdate": true,
  "releaseNotes": "Critical security fix — update required."
}
```

**Response — 200 OK**: same shape as the GET response `data` object.

**Error responses**

| Status | Meaning |
|---|---|
| 401 | Missing or invalid JWT |
| 403 | Authenticated but not Management role |
| 400 | Invalid field types (e.g. `forceUpdate` sent as a string) |

---

## How to implement in the app

On app launch, before showing the login screen:

1. Call `GET /api/app-version`.
2. Compare the device's current build version against the response:
   - If device version < `androidMinimalVersion` (or `iosMinimalVersion`) → **block the app**, show a mandatory update screen. Do not allow login.
   - If `forceUpdate === true` → **block the app**, show the update prompt with `releaseNotes`.
   - Otherwise → proceed to the login screen as normal.
3. If the network call fails (timeout, no connection), decide whether to fail-open (let the user proceed) or fail-closed (show a "no connection" screen). We recommend fail-open so a network outage doesn't lock users out.

**Suggested version comparison logic:**
```js
// semver-style comparison (works for "major.minor.patch" strings)
function isVersionLessThan(current, minimum) {
  const a = current.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return false;
  }
  return false; // equal → not less than
}

// Usage
const config = await fetch('https://<domain>/api/app-version').then(r => r.json());
const minVersion = platform === 'android'
  ? config.data.androidMinimalVersion
  : config.data.iosMinimalVersion;

if (config.data.forceUpdate || isVersionLessThan(APP_VERSION, minVersion)) {
  showForceUpdateScreen(config.data.releaseNotes);
}
```

---

## Defaults (before Management sets anything)

If Management has never touched the config, the API returns:

```json
{
  "androidCurrentVersion": "1.0.0",
  "androidMinimalVersion": "1.0.0",
  "iosCurrentVersion": "1.0.0",
  "iosMinimalVersion": "1.0.0",
  "forceUpdate": false,
  "releaseNotes": null
}
```

`forceUpdate` is `false` by default — no users will be blocked until Management explicitly enables it.
