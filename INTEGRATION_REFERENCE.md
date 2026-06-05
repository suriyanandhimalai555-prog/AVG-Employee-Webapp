# Integration Reference — S3 Upload & Socket.io

Extracted from the actual frontend source. This is the real code used in production.

---

## Socket.io — Listening for Attendance & Sign-off Events

**File:** `frontend/src/pages/attendance/hooks/useAttendanceSocket.js`

```javascript
/**
 * useAttendanceSocket
 *
 * Maintains a persistent Socket.io connection for the authenticated user.
 * When the worker finishes writing attendance to the DB, it publishes a
 * Redis pub/sub event → the API relays it via Socket.io to this user's room
 * → this hook invalidates the RTK Query cache so the UI updates automatically.
 *
 * Replaces the 3-second setTimeout polling hack in useCheckIn.
 */
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import { apiSlice } from '../../../store/api/apiSlice';
import { selectCurrentToken } from '../../../store/slices/authSlice';

// Strip the '/api' suffix to reach the base server URL where Socket.io is mounted
const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');

export const useAttendanceSocket = () => {
  const dispatch = useDispatch();
  const token = useSelector(selectCurrentToken);

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      // Send JWT in handshake so the server can authenticate before accepting the connection
      auth: { token },
      // Start with polling so the handshake works through Railway's reverse proxy;
      // Socket.io upgrades to WebSocket automatically once the connection is established.
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    // When the worker confirms attendance was persisted to the DB,
    // force RTK Query to refetch the relevant queries for this user.
    // 'Employees' is included so the branch admin panel reflects the new record.
    socket.on('attendance:confirmed', () => {
      dispatch(apiSlice.util.invalidateTags(['Summary', 'Attendance', 'Employees']));
    });

    // When the worker confirms a sign-off was persisted to the DB,
    // invalidate the same tags so all panels show the updated check-out time.
    socket.on('signoff:confirmed', () => {
      dispatch(apiSlice.util.invalidateTags(['Summary', 'Attendance', 'Employees']));
    });

    // Teardown: disconnect when the component unmounts or the token changes
    return () => {
      socket.disconnect();
    };
  }, [token, dispatch]);
};
```

---

## S3 Upload — Attendance Photo (Field Check-in)

**File:** `frontend/src/pages/attendance/hooks/useCheckIn.js`

The relevant upload block inside `handleCheckIn`:

```javascript
setIsUploading(true);
const fileType = fieldPhoto.file.type || 'image/jpeg';

// Pass the file's MIME type so the presigned URL is signed for the correct Content-Type
const { uploadUrl, photoKey } = await getUploadUrl(fileType).unwrap();

const uploadResponse = await fetch(uploadUrl, {
  method: 'PUT',
  body: fieldPhoto.file,
  headers: { 'Content-Type': fileType },
});

if (!uploadResponse.ok) {
  throw new Error('Photo upload failed. Please try again.');
}

await submitAttendance({
  mode: 'field',
  fieldNote,
  photoKey,          // <-- key passed to API after successful S3 upload
  checkInLat: gpsStatus.lat,
  checkInLng: gpsStatus.lng,
}).unwrap();
```

- `getUploadUrl` calls `GET /api/attendance/upload-url?contentType=<fileType>`
- `submitAttendance` calls `POST /api/attendance`

---

## S3 Upload — Money Receipt (GPay / Bank)

**File:** `frontend/src/pages/MoneySubmitPage.jsx`

The relevant upload block inside `handleSubmitCollection`:

```javascript
let photoKey = undefined;

if (formState.mode !== 'cash' && fieldPhoto) {
  setIsUploading(true);
  const fileType = fieldPhoto.file.type || 'image/jpeg';

  const { uploadUrl, photoKey: uploadedKey } = await getUploadUrl({
    mode: formState.mode,   // 'gpay' or 'bank_receipt'
    contentType: fileType,
  }).unwrap();

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: fieldPhoto.file,
    headers: { 'Content-Type': fileType },
  });

  if (!uploadResponse.ok) throw new Error('Photo upload failed. Please try again.');
  photoKey = uploadedKey;
}

await submitCollection({
  projectId: formState.projectId,
  amount: parseFloat(formState.amount),
  mode: formState.mode,
  clientName: formState.clientName,
  clientPhone: formState.clientPhone,
  handedOverTo: formState.mode === 'cash' && !formState.keepInWallet
    ? formState.handedOverTo
    : undefined,
  photoKey,           // <-- key passed to API after successful S3 upload
}).unwrap();
```

- `getUploadUrl` calls `GET /api/money/upload-url?contentType=<fileType>&mode=<mode>`
- `submitCollection` calls `POST /api/money`

---

## S3 Upload — Profile Photo / Document

**File:** `frontend/src/pages/ProfilePage.jsx`

The `uploadAsset` helper function:

```javascript
const uploadAsset = async (file, kind) => {
  const contentType = file.type || 'application/octet-stream';

  const { uploadUrl, fileKey } = await getProfileUploadUrl({ kind, contentType }).unwrap();

  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': contentType },
  });

  if (!uploadRes.ok) {
    throw new Error('Upload failed. Please try again.');
  }

  return fileKey;   // <-- returned and then submitted to PATCH /api/auth/profile-assets
};
```

- `kind` is either `'photo'` or `'proof'`
- `getProfileUploadUrl` calls `GET /api/auth/profile-upload-url?kind=<kind>&contentType=<contentType>`
- After upload, `fileKey` is submitted via `PATCH /api/auth/profile-assets`

---

## Key Pattern Across All Three Flows

1. Call the presigned URL endpoint on your API (with JWT auth) → get back `uploadUrl` + `photoKey`/`fileKey`
2. `fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': fileType } })` — no auth header
3. Pass the key to the relevant data submission API call
