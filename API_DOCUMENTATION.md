# AVG Employee Management System — API Documentation (Part 1)

## Base URL
- **Development:** `http://localhost:3001`
- **Production:** Your deployed Railway URL

## Tech Stack
- **Framework:** Fastify (Node.js)
- **Database:** PostgreSQL
- **Cache / Sessions:** Redis
- **Real-time:** Socket.io
- **File Storage:** AWS S3
- **Auth:** JWT (Bearer token)

---

## Authentication

All protected routes require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

Obtain the token from `POST /api/auth/login`. The JWT payload contains:
- `id` — user UUID
- `role` — role string
- `branchId` — branch UUID or null
- `name` — display name

**Token expiry:** Configured via `JWT_EXPIRES_IN` env var (default `8h`).

---

## Role Hierarchy

| Role | Code | Description |
|------|------|-------------|
| Managing Director | `md` | Full system access |
| Director | `director` | Oversees multiple GM branches |
| General Manager | `gm` | Oversees assigned branches |
| Branch Manager | `branch_manager` | Manages one branch |
| Assistant Branch Manager | `abm` | Assists branch manager |
| Sales Officer | `sales_officer` | Field sales, own referrals only |
| Branch Admin | `branch_admin` | Branch-level write operations |
| Office Admin | `oa` | Read-only office tasks |
| Client | `client` | External client, very limited access |

---

## Standard Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

### Common Error Codes
| HTTP | Code | Meaning |
|------|------|---------|
| 400 | `VALIDATION_ERROR` | Invalid request body/params |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Insufficient role |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate resource |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests (300/min per user) |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Rate Limiting
- **Global:** 300 requests / minute per authenticated user (keyed by `user.id`)
- **Attendance submit & Money collection submit:** 6 requests / minute (dupe-guard)

---

## Health Check

### `GET /health`
Public. Returns server status.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-05-30T07:22:00.000Z",
    "environment": "production"
  }
}
```

---

# Module 1 — Authentication (`/api/auth`)

### `POST /api/auth/login`
**Auth required:** No  
**Description:** Authenticates a user and returns a JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```
| Field | Type | Rules |
|-------|------|-------|
| `email` | string | Valid email format |
| `password` | string | Min 6 characters |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci...",
    "user": {
      "id": "uuid",
      "name": "Ravi Kumar",
      "email": "ravi@avg.com",
      "role": "branch_manager",
      "branchId": "uuid-or-null",
      "branchName": "Tiruvannamalai Branch",
      "isHeadBranch": false,
      "hasSmartphone": true,
      "profilePhotoKey": "profiles/uuid/photo.jpg",
      "profilePhotoUrl": "https://presigned-s3-url..."
    }
  }
}
```

**Errors:**
- `401` — Invalid credentials
- `400` — Validation failure

---

### `GET /api/auth/me`
**Auth required:** Yes  
**Description:** Returns the currently authenticated user's profile.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Ravi Kumar",
    "email": "ravi@avg.com",
    "role": "branch_manager",
    "branchId": "uuid",
    "branchName": "Branch Name",
    "isHeadBranch": false,
    "hasSmartphone": true,
    "profilePhotoKey": "profiles/uuid/photo.jpg",
    "profilePhotoUrl": "https://presigned-s3-url..."
  }
}
```

---

### `POST /api/auth/logout`
**Auth required:** Yes  
**Description:** Invalidates the server-side Redis session for this user.

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Logged out successfully" }
}
```

---

### `PATCH /api/auth/change-password`
**Auth required:** Yes  
**Description:** Allows any authenticated user to change their own password. Forces re-login after success.

**Request Body:**
```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass456",
  "confirmPassword": "newpass456"
}
```
| Field | Type | Rules |
|-------|------|-------|
| `currentPassword` | string | Required, min 1 |
| `newPassword` | string | Min 6, max 100 |
| `confirmPassword` | string | Must match `newPassword` |

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Password changed successfully. Please log in again." }
}
```

---

### `GET /api/auth/profile-upload-url`
**Auth required:** Yes  
**Description:** Returns a presigned S3 PUT URL to upload a profile photo or proof document.

**Query Params:**
| Param | Type | Required | Values |
|-------|------|----------|--------|
| `kind` | string | Yes | `photo` or `proof` |
| `contentType` | string | No | e.g. `image/jpeg` (default) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.presigned-put-url...",
    "key": "profiles/uuid/photo_uuid.jpg"
  }
}
```
> **Usage:** PUT the file bytes directly to `uploadUrl`, then call `PATCH /api/auth/profile-assets` with the returned `key`.

---

### `PATCH /api/auth/profile-assets`
**Auth required:** Yes  
**Description:** Saves an uploaded S3 key to the authenticated user's profile.

**Request Body:**
```json
{
  "profilePhotoKey": "profiles/uuid/photo.jpg",
  "profileProofKey": "profiles/uuid/proof.jpg"
}
```
Both fields are optional but at least one should be provided.

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Profile updated successfully" }
}
```

---

# Module 2 — Users (`/api/users`)

### `POST /api/users`
**Auth required:** Yes — **MD only**  
**Description:** Creates a new user account.

**Request Body:**
```json
{
  "name": "Arun Sharma",
  "email": "arun@avg.com",
  "password": "initial123",
  "role": "branch_manager",
  "branchId": "uuid-or-null",
  "managerId": "uuid-or-null",
  "hasSmartphone": true,
  "oversightBranchIds": ["uuid1", "uuid2"],
  "oversightGmIds": ["uuid1"]
}
```
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | 2–200 chars |
| `email` | string | Yes | Valid email |
| `password` | string | Yes | Min 6, max 100 |
| `role` | string | Yes | See role table |
| `branchId` | UUID/null | No | Assign to a branch |
| `managerId` | UUID/null | No | Direct manager |
| `hasSmartphone` | boolean | No | Default `true` |
| `oversightBranchIds` | UUID[] | No | For `director`/`gm` |
| `oversightGmIds` | UUID[] | No | For `director` |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Arun Sharma",
    "email": "arun@avg.com",
    "role": "branch_manager",
    "branchId": "uuid",
    "isActive": true,
    "createdAt": "2026-05-30T07:00:00Z"
  }
}
```

---

### `GET /api/users`
**Auth required:** Yes — Roles: `md`, `director`, `gm`, `branch_admin`  
**Description:** Lists users, scoped by caller's role and branch.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `role` | string | Filter by role |
| `branchId` | UUID | Filter by branch |
| `search` | string | Name/email search |
| `page` | number | Default 1 |
| `limit` | number | Default 50 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "uuid",
        "name": "Ravi Kumar",
        "email": "ravi@avg.com",
        "role": "branch_manager",
        "branchId": "uuid",
        "branchName": "Branch Name",
        "isActive": true,
        "profilePhotoUrl": "https://..."
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 50
  }
}
```

---

### `GET /api/users/:id`
**Auth required:** Yes  
**Description:** Returns a single user's profile.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Ravi Kumar",
    "role": "branch_manager",
    "branchId": "uuid",
    "branchName": "Branch Name",
    "isActive": true,
    "profilePhotoUrl": "https://..."
  }
}
```

---

### `GET /api/users/deactivated`
**Auth required:** Yes — **MD only**  
**Description:** Lists auto-deactivated accounts (ABM/SO/OA) with absence duration.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Name",
      "role": "abm",
      "branchName": "Branch",
      "deactivatedAt": "2026-05-01T00:00:00Z",
      "absentDays": 45
    }
  ]
}
```

---

### `POST /api/users/:id/reactivate`
**Auth required:** Yes — **MD only**  
**Description:** Restores an auto-deactivated account.

**Response 200:**
```json
{
  "success": true,
  "data": { "id": "uuid", "isActive": true }
}
```

---

### `GET /api/users/manager-options`
**Auth required:** Yes  
**Description:** Returns users of specified roles for manager dropdowns.

**Query Params:**
| Param | Type | Required | Example |
|-------|------|----------|---------|
| `roles` | string | Yes | `director,gm` |

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Name", "role": "gm" }
  ]
}
```

---

### `GET /api/users/superiors`
**Auth required:** Yes  
**Description:** Returns the caller's full management chain up to MD.

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Name", "role": "branch_manager" },
    { "id": "uuid", "name": "Name", "role": "gm" }
  ]
}
```

---

### `GET /api/users/:id/oversight-branches`
**Auth required:** Yes — **MD only**  
**Description:** Returns oversight branch IDs for a Director or GM.

**Response 200:**
```json
{
  "success": true,
  "data": { "branchIds": ["uuid1", "uuid2"], "gmIds": ["uuid1"] }
}
```

---

### `PATCH /api/users/:id/oversight-branches`
**Auth required:** Yes — **MD only**  
**Description:** Replaces the oversight branch/GM assignments for a Director or GM.

**Request Body:**
```json
{
  "branchIds": ["uuid1", "uuid2"],
  "gmIds": ["uuid1"]
}
```

**Response 200:** Returns updated user object.

---

### `GET /api/users/upload-url`
**Auth required:** Yes  
**Description:** Returns presigned S3 URL for profile asset upload.

**Query Params:**
| Param | Type | Required |
|-------|------|----------|
| `kind` | string | Yes — `photo` or `proof` |
| `contentType` | string | Yes — e.g. `image/jpeg` |

**Response 200:**
```json
{
  "success": true,
  "data": { "uploadUrl": "https://...", "key": "profiles/uuid/..." }
}
```

---

### `GET /api/users/me/documents`
**Auth required:** Yes  
**Description:** Returns the caller's uploaded document records.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "s3Key": "documents/uuid/file.pdf",
      "fileName": "aadhar.pdf",
      "fileType": "application/pdf",
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

---

### `POST /api/users/me/documents`
**Auth required:** Yes  
**Description:** Registers a new document after S3 upload.

**Request Body:**
```json
{
  "s3Key": "documents/uuid/file.pdf",
  "fileName": "aadhar.pdf",
  "fileType": "application/pdf"
}
```

**Response 201:** Returns the created document record.

---

### `DELETE /api/users/me/documents/:id`
**Auth required:** Yes  
**Description:** Removes a document record.

**Response 200:**
```json
{ "success": true }
```

---

### `GET /api/users/:id/documents`
**Auth required:** Yes — Roles: `md`, `director`, `gm`, `branch_admin`  
**Description:** View another user's documents.

**Response 200:** Same shape as `GET /me/documents`.

---

# Module 3 — Branches (`/api/branches`)

### `GET /api/branches`
**Auth required:** Yes — Any role  
**Description:** Lists all active branches. Aggressively Redis-cached.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Tiruvannamalai",
      "gmId": "uuid-or-null",
      "adminId": "uuid-or-null",
      "shiftStart": "09:00",
      "shiftEnd": "18:00",
      "timezone": "Asia/Kolkata",
      "isActive": true,
      "isHeadBranch": false,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

---

### `GET /api/branches/:id`
**Auth required:** Yes  
**Description:** Returns a single branch's details.

**Response 200:** Same shape as a single item from `GET /api/branches`.

---

### `POST /api/branches`
**Auth required:** Yes — **MD only**  
**Description:** Creates a new branch.

**Request Body:**
```json
{
  "name": "Chennai North",
  "shiftStart": "09:00",
  "shiftEnd": "18:00",
  "timezone": "Asia/Kolkata"
}
```
| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes, 2–200 chars |
| `shiftStart` | string | No, HH:MM format |
| `shiftEnd` | string | No, HH:MM format |
| `timezone` | string | No, max 50 chars |

**Response 201:** Returns created branch object.

---

### `PATCH /api/branches/:id`
**Auth required:** Yes — **MD only**  
**Description:** Updates a branch's details, assigns GM/Admin.

**Request Body:**
```json
{
  "name": "Updated Name",
  "gmId": "uuid-or-null",
  "adminId": "uuid-or-null",
  "shiftStart": "09:30",
  "shiftEnd": "18:30",
  "isActive": true
}
```
All fields optional.

**Response 200:** Returns updated branch object.

---

### `DELETE /api/branches/:id`
**Auth required:** Yes — **MD only**  
**Description:** Soft-deactivates a branch (`isActive = false`).

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Branch deactivated" }
}
```

---

# Module 4 — Attendance (`/api/attendance`)

## Attendance Flow
1. Employee calls `POST /api/attendance` (self check-in) or admin calls `POST /api/attendance/admin-mark`
2. Server enqueues a BullMQ job and returns a `jobId` immediately (HTTP 202)
3. Worker processes the job asynchronously
4. Result is broadcast via Socket.io event `attendance:confirmed` to the employee (and admin if different)

---

### `POST /api/attendance`
**Auth required:** Yes — All roles except `client`  
**Rate limit:** 6/minute  
**Description:** Self check-in. Mode `office` requires GPS. Mode `field` requires photo + note + GPS.

**Request Body — Office Mode:**
```json
{
  "mode": "office",
  "checkInLat": 12.345678,
  "checkInLng": 79.123456
}
```

**Request Body — Field Mode:**
```json
{
  "mode": "field",
  "checkInLat": 12.345678,
  "checkInLng": 79.123456,
  "photoKey": "attendance/uuid/timestamp.jpg",
  "fieldNote": "Client visit at site XYZ"
}
```

| Field | Type | Required |
|-------|------|----------|
| `mode` | string | Yes — `office` or `field` |
| `checkInLat` | number | Yes for both modes |
| `checkInLng` | number | Yes for both modes |
| `photoKey` | string | Required for `field` mode |
| `fieldNote` | string | Required for `field` mode, max 1000 |

**Response 202:**
```json
{
  "success": true,
  "data": {
    "message": "Attendance submitted. Confirming shortly...",
    "jobId": "uuid"
  }
}
```

---

### `POST /api/attendance/self-absent`
**Auth required:** Yes  
**Description:** Employee marks themselves absent for today.

**Request Body:**
```json
{
  "note": "Sick leave"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Marked as absent for today" }
}
```

---

### `POST /api/attendance/admin-mark`
**Auth required:** Yes — Roles: `branch_admin`, `md`, `gm`  
**Description:** Admin marks attendance for a specific employee.

**Request Body:**
```json
{
  "targetUserId": "uuid",
  "status": "present",
  "mode": "office",
  "note": "Marked by admin",
  "photoKey": "attendance/uuid/photo.jpg",
  "fieldNote": "Field visit confirmed"
}
```
| Field | Type | Required |
|-------|------|----------|
| `targetUserId` | UUID | Yes |
| `status` | string | Yes — `present`, `absent`, `half_day` |
| `note` | string | No, max 500 |
| `mode` | string | No — `office` or `field`, default `office` |
| `photoKey` | string | No |
| `fieldNote` | string | No, max 1000 |

**Response 202:** Same shape as `POST /api/attendance`.

---

### `POST /api/attendance/sign-off`
**Auth required:** Yes  
**Description:** Self clock-out with GPS.

**Request Body:**
```json
{
  "checkOutLat": 12.345678,
  "checkOutLng": 79.123456
}
```

**Response 202:**
```json
{
  "success": true,
  "data": {
    "message": "Sign-off submitted. Confirming shortly...",
    "jobId": "uuid"
  }
}
```

---

### `POST /api/attendance/admin-sign-off`
**Auth required:** Yes — Roles: `branch_admin`, `md`, `gm`  
**Description:** Admin clocks out on behalf of an employee.

**Request Body:**
```json
{
  "targetUserId": "uuid",
  "checkOutLat": 12.345678,
  "checkOutLng": 79.123456
}
```

**Response 202:** Same shape as sign-off.

---

### `PATCH /api/attendance/:id/correct`
**Auth required:** Yes — Roles: `branch_admin`, `md`, `gm`  
**Description:** Corrects a previously submitted attendance record.

**Path Param:** `id` — attendance record UUID

**Request Body:**
```json
{
  "newStatus": "half_day",
  "correctionNote": "Employee left early due to medical emergency"
}
```
| Field | Type | Required |
|-------|------|----------|
| `newStatus` | string | Yes — `present`, `absent`, `half_day` |
| `correctionNote` | string | Yes, min 10, max 500 |

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Attendance corrected successfully" }
}
```

---

### `GET /api/attendance`
**Auth required:** Yes — All except `client`  
**Description:** Lists attendance records scoped by caller's role/branch.

**Query Params:**
| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `date` | string | Today | YYYY-MM-DD |
| `branchId` | UUID | — | Filter by branch |
| `status` | string | — | `present`, `absent`, `half_day` |
| `page` | number | 1 | |
| `limit` | number | 20 | Max 100 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "id": "uuid",
        "userId": "uuid",
        "userName": "Ravi Kumar",
        "date": "2026-05-30",
        "status": "present",
        "mode": "office",
        "checkInLat": 12.345,
        "checkInLng": 79.123,
        "checkOutLat": 12.345,
        "checkOutLng": 79.123,
        "photoKey": "attendance/...",
        "fieldNote": null,
        "note": null,
        "correctedAt": null,
        "createdAt": "2026-05-30T09:00:00Z"
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20
  }
}
```

---

### `GET /api/attendance/employees`
**Auth required:** Yes — Roles: `branch_admin`, `gm`, `md`, `director`, `branch_manager`, `abm`, `oa`  
**Description:** Lists branch employees with today's attendance status.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | Name search |
| `branchId` | UUID | Override branch (oversight roles) |
| `role` | string | Filter by role |
| `page` | number | Default 1 |
| `limit` | number | Default 50 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "employees": [
      {
        "id": "uuid",
        "name": "Name",
        "role": "sales_officer",
        "hasSmartphone": true,
        "todayStatus": "present",
        "todayMode": "office",
        "profilePhotoUrl": "https://..."
      }
    ],
    "total": 20,
    "page": 1,
    "limit": 50
  }
}
```

---

### `GET /api/attendance/summary`
**Auth required:** Yes — All except `client`  
**Description:** Returns attendance summary stats for a specific date.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `date` | string | YYYY-MM-DD, defaults to today (IST) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "date": "2026-05-30",
    "total": 25,
    "present": 20,
    "absent": 3,
    "halfDay": 2,
    "field": 8,
    "office": 12
  }
}
```

---

### `GET /api/attendance/team-history`
**Auth required:** Yes — All except `client`  
**Description:** Returns per-date team attendance counts for a month.

**Query Params:**
| Param | Type | Default |
|-------|------|---------|
| `month` | number | Current month |
| `year` | number | Current year |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-05-01",
      "present": 18,
      "absent": 4,
      "halfDay": 1,
      "field": 6,
      "office": 12,
      "total": 23
    }
  ]
}
```

---

### `GET /api/attendance/:userId/history`
**Auth required:** Yes — All except `client`  
**Description:** Returns a specific employee's monthly attendance calendar.

**Path Param:** `userId` — UUID  
**Query Params:**
| Param | Type | Default |
|-------|------|---------|
| `month` | number | Current month |
| `year` | number | Current year |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-05-01",
      "status": "present",
      "mode": "field",
      "photoKey": "attendance/...",
      "checkInLat": 12.345,
      "checkInLng": 79.123
    }
  ]
}
```

---

### `GET /api/attendance/upload-url`
**Auth required:** Yes — All except `client`  
**Description:** Returns presigned S3 PUT URL for attendance photo upload.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `contentType` | string | e.g. `image/jpeg`, default `image/jpeg` |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.presigned...",
    "key": "attendance/uuid/timestamp.jpg"
  }
}
```
> Upload file bytes via HTTP PUT to `uploadUrl`, then pass `key` in the attendance submission body.

---

### `GET /api/attendance/photo-url`
**Auth required:** Yes — All except `client`  
**Description:** Returns a presigned S3 GET URL to view an attendance photo.

**Query Params:**
| Param | Type | Required |
|-------|------|----------|
| `key` | string | Yes — the S3 key from the attendance record |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "url": "https://s3.presigned-get-url...",
    "expiresIn": 3600
  }
}
```

---

### `PATCH /api/attendance/users/:userId/smartphone`
**Auth required:** Yes — **branch_admin only**  
**Description:** Toggles whether an employee has a smartphone (controls app access).

**Path Param:** `userId` — UUID

**Request Body:**
```json
{
  "hasSmartphone": true
}
```

**Response 200:**
```json
{
  "success": true,
  "data": { "message": "Smartphone status updated" }
}
```

---
# AVG Employee Management System — API Documentation (Part 2)

# Module 5 — Money Collections (`/api/money`)

## Overview
Tracks cash/GPay/bank collections from clients. Collections flow through: `pending → approved/rejected`.
Branch admins can only submit from the **6th of the month** onward (cycle: 6th → 5th of next month).

---

### `POST /api/money/projects`
**Auth:** Yes — **MD only**
**Description:** Creates a new money collection project.

**Request Body:**
```json
{
  "name": "AVG Gold Project",
  "code": "avg_gold"
}
```
| Field | Type | Rules |
|-------|------|-------|
| `name` | string | Min 1, max 255 |
| `code` | string | Lowercase letters/digits/underscores only, max 50, immutable after creation |

**Response 201:** Returns created project object.

---

### `PATCH /api/money/projects/:id`
**Auth:** Yes — **MD only**
**Description:** Updates a project name or active status.

**Request Body:**
```json
{
  "name": "New Name",
  "isActive": true
}
```

**Response 200:** Returns updated project object.

---

### `GET /api/money/projects`
**Auth:** Yes — Any role
**Description:** Lists all money collection projects.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `includeInactive` | string | `"true"` to include inactive |

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Project Name", "code": "project_code", "isActive": true }
  ]
}
```

---

### `POST /api/money`
**Auth:** Yes — All roles except `oa`, `client`
**Rate limit:** 6/minute
**Description:** Submits a new money collection entry.
- `branch_admin` restricted to 6th of month onward; `collectionDate` must be within the active cycle.
- For `gpay`/`bank_receipt` modes, `photoKey` is **required**.
- For `cash` mode, `handedOverTo` is optional (omitting it keeps cash in the submitter's wallet).

**Request Body:**
```json
{
  "projectId": "uuid",
  "amount": 5000.00,
  "mode": "gpay",
  "clientName": "Suresh",
  "clientPhone": "9876543210",
  "photoKey": "money/uuid/receipt.jpg",
  "handedOverTo": "uuid",
  "collectionDate": "2026-05-15"
}
```
| Field | Type | Required |
|-------|------|----------|
| `projectId` | UUID | Yes |
| `amount` | number | Yes, positive |
| `mode` | string | Yes — `gpay`, `bank_receipt`, `cash` |
| `clientName` | string | Yes, 1–200 |
| `clientPhone` | string | Yes, max 20 |
| `photoKey` | string | Required for gpay/bank_receipt |
| `handedOverTo` | UUID | No |
| `collectionDate` | string | No, YYYY-MM-DD |

**Response 201:** Returns created collection record.

---

### `PATCH /api/money/:id/verify`
**Auth:** Yes
**Description:** Approves or rejects a pending collection.

**Request Body:**
```json
{
  "status": "approved",
  "rejectionNote": ""
}
```
| Field | Type | Rules |
|-------|------|-------|
| `status` | string | `approved` or `rejected` |
| `rejectionNote` | string | Required if `rejected`, max 1000 |

**Response 200:** Returns updated collection.

---

### `GET /api/money`
**Auth:** Yes
**Description:** Lists collections scoped to the caller's role/branch.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `projectId` | UUID | Filter by project |
| `status` | string | `pending`, `approved`, `rejected` |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "collections": [
      {
        "id": "uuid",
        "submittedBy": "uuid",
        "submitterName": "Name",
        "projectId": "uuid",
        "projectName": "Project",
        "amount": 5000,
        "mode": "gpay",
        "status": "pending",
        "clientName": "Suresh",
        "clientPhone": "9876543210",
        "photoKey": "money/...",
        "collectionDate": "2026-05-15",
        "createdAt": "2026-05-15T09:00:00Z"
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20
  }
}
```

---

### `GET /api/money/upload-url`
**Auth:** Yes
**Description:** Returns presigned S3 PUT URL for collection receipt photo.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `contentType` | string | Default `image/jpeg` |
| `mode` | string | `gpay` or `bank_receipt`, default `gpay` |

**Response 200:**
```json
{
  "success": true,
  "data": { "uploadUrl": "https://...", "key": "money/uuid/receipt.jpg" }
}
```

---

### `GET /api/money/photo-url`
**Auth:** Yes
**Description:** Returns presigned S3 GET URL for a receipt photo.

**Query Params:** `key` (string, required)

**Response 200:**
```json
{ "success": true, "data": { "url": "https://...", "expiresIn": 3600 } }
```

---

### `GET /api/money/wallet`
**Auth:** Yes
**Description:** Returns caller's cash wallet balance (un-forwarded cash collections).

**Response 200:**
```json
{
  "success": true,
  "data": { "balance": 15000, "pendingCollections": [...] }
}
```

---

### `POST /api/money/transfer`
**Auth:** Yes
**Description:** Transfers specific cash collection records to another user.

**Request Body:**
```json
{
  "targetUserId": "uuid",
  "collectionIds": ["uuid1", "uuid2"]
}
```

**Response 201:** Returns transfer result.

---

### `GET /api/money/:id/sources`
**Auth:** Yes
**Description:** Returns transfer source history for a given collection entry.

**Response 200:** Returns array of transfer events.

---

### `GET /api/money/admin/overview`
**Auth:** Yes — Roles: `md`, `director`, `gm`, `branch_manager`, `branch_admin`
**Description:** Returns admin-level collection overview (stuck collections, daily totals, etc.)

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `stuckDays` | number | Collections stuck for N+ days, default 3 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalToday": 150000,
    "pendingCount": 12,
    "stuckCollections": [...],
    "byBranch": [...]
  }
}
```

---

### `GET /api/money/admin/rankings`
**Auth:** Yes — **MD only**
**Description:** Branch ranking by collection totals.

**Query Params:**
| Param | Type |
|-------|------|
| `startDate` | YYYY-MM-DD |
| `endDate` | YYYY-MM-DD |

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "branchId": "uuid", "branchName": "Branch", "total": 500000, "rank": 1 }
  ]
}
```

---

### `POST /api/money/admin/entry`
**Auth:** Yes — **MD only**
**Description:** MD directly adds a collection entry attributed to any branch (idempotent).

**Request Body:**
```json
{
  "branchId": "uuid",
  "projectId": "uuid",
  "date": "2026-05-15",
  "mode": "cash",
  "amount": 50000,
  "notes": "Manually entered by MD",
  "idempotencyKey": "uuid"
}
```
| Field | Type | Required |
|-------|------|----------|
| `branchId` | UUID | Yes |
| `projectId` | UUID | Yes |
| `date` | string | Yes, YYYY-MM-DD |
| `mode` | string | Yes — `gpay`, `bank_receipt`, `cash` |
| `amount` | number | Yes, positive, max 100,000,000 |
| `notes` | string | No, max 1000 |
| `idempotencyKey` | UUID | Yes — retries with same key are safe |

**Response 201:** Returns created entry.

---

### `GET /api/money/admin/branch/:branchId`
**Auth:** Yes
**Description:** Returns collection drilldown for a specific branch.

**Response 200:** Returns branch-level summary and individual collection records.

---

### `GET /api/money/admin/holders/:holderId`
**Auth:** Yes
**Description:** Returns all un-forwarded cash currently held by a specific user.

**Response 200:** Returns list of pending cash collection records.

---

# Module 6 — Transactions (`/api/transactions`)

Used for internal money transfers: expenses, advances, reimbursements.

### `POST /api/transactions`
**Auth:** Yes
**Description:** Creates a new transaction (sender → receiver).

**Request Body:**
```json
{
  "receiverId": "uuid",
  "amount": 2000,
  "category": "advance",
  "note": "Travel advance for Chennai trip"
}
```
| Field | Type | Values |
|-------|------|--------|
| `receiverId` | UUID | Yes |
| `amount` | number | Positive |
| `category` | string | `expense`, `advance`, `reimbursement`, `collection`, `other` |
| `note` | string | Optional |

**Response 201:** Returns created transaction.

---

### `GET /api/transactions`
**Auth:** Yes
**Description:** Lists transactions for the caller.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `role` | string | `sender` or `receiver` |
| `status` | string | `pending_acknowledgment`, `acknowledged`, `rejected`, `flagged` |
| `category` | string | Filter by category |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 100 |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "uuid",
        "senderId": "uuid",
        "senderName": "Name",
        "receiverId": "uuid",
        "receiverName": "Name",
        "amount": 2000,
        "category": "advance",
        "status": "pending_acknowledgment",
        "note": "Travel advance",
        "createdAt": "2026-05-30T09:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 50
  }
}
```

---

### `PATCH /api/transactions/:id/status`
**Auth:** Yes
**Description:** Updates the status of a transaction.

**Request Body:**
```json
{
  "status": "acknowledged",
  "note": "Received, thanks"
}
```
| Field | Type | Values |
|-------|------|--------|
| `status` | string | `pending_acknowledgment`, `acknowledged`, `rejected`, `flagged` |
| `note` | string | Optional |

**Response 200:** Returns updated transaction.

---

# Module 7 — Gold Savings Scheme (`/api/gold`)

Chit-fund style gold scheme. Branch Admin writes; Managers/SO read (own referrals only).

### `GET /api/gold/employees`
**Auth:** Yes — Roles: `md`, `director`, `gm`, `branch_manager`, `abm`, `sales_officer`, `branch_admin`
**Description:** Lists branch employees for referrer dropdown.

**Response 200:** `{ "success": true, "data": [{ "id": "uuid", "name": "Name", "role": "..." }] }`

---

### `GET /api/gold/summary`
**Auth:** Yes — Reader roles
**Description:** Returns gold scheme stats for the caller's branch (own referrals only for SO/ABM/BM).

**Query Params:** `startDate`, `endDate` (YYYY-MM-DD, optional)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalMembers": 50,
    "activeMembers": 42,
    "totalCollected": 500000,
    "completedCount": 5,
    "withdrawnCount": 3
  }
}
```

---

### `GET /api/gold`
**Auth:** Yes — Reader roles
**Description:** Lists gold scheme members. SO/ABM/BM see only their own referrals.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `status` | string | `active`, `completed`, `withdrawn` |
| `referrerId` | UUID | Filter by referrer |
| `search` | string | Name/phone search |
| `startDate` | string | YYYY-MM-DD |
| `endDate` | string | YYYY-MM-DD |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 500 |

**Response 200:**
```json
{
  "success": true,
  "data": [...],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

---

### `POST /api/gold`
**Auth:** Yes — **branch_admin only**
**Description:** Adds a new gold scheme member (chit slot).

**Request Body:**
```json
{
  "chitNumber": "CHT-001",
  "customerId": "uuid",
  "referrerId": "uuid",
  "monthlyAmount": 5000,
  "startDate": "2026-06-01",
  "totalMonths": 12,
  "firstPaymentMode": "cash",
  "notes": "Optional note"
}
```
| Field | Type | Required |
|-------|------|----------|
| `chitNumber` | string | Yes, 1–20 chars |
| `customerId` | UUID | Yes, must exist |
| `referrerId` | UUID | Yes |
| `monthlyAmount` | number | Yes, positive, max 10,000,000 |
| `startDate` | string | Yes, YYYY-MM-DD |
| `totalMonths` | number | No, 1–60, default 12 |
| `firstPaymentMode` | string | No — `cash`, `gpay`, `bank_receipt`, default `cash` |
| `notes` | string | No, max 1000 |

**Response 201:** Returns created member record.

---

### `GET /api/gold/:id`
**Auth:** Yes — Reader roles
**Description:** Returns a single gold member's details.

**Response 200:** Returns full member object.

---

### `GET /api/gold/:id/payments`
**Auth:** Yes — Reader roles
**Description:** Lists all payments for a gold scheme member.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "monthNumber": 1,
      "paidDate": "2026-06-15",
      "amount": 5000,
      "paymentMode": "cash",
      "notes": null,
      "recordedAt": "2026-06-15T10:00:00Z"
    }
  ]
}
```

---

### `POST /api/gold/:id/payments`
**Auth:** Yes — **branch_admin only**
**Description:** Records a monthly payment for a gold scheme member.

**Request Body:**
```json
{
  "monthNumber": 2,
  "paidDate": "2026-07-10",
  "amount": 5000,
  "paymentMode": "gpay",
  "notes": "Received via GPay"
}
```
| Field | Type | Required |
|-------|------|----------|
| `monthNumber` | number | Yes, 1–60 |
| `paidDate` | string | Yes, YYYY-MM-DD |
| `amount` | number | Yes, positive |
| `paymentMode` | string | No — `cash`, `gpay`, `bank_receipt`, default `cash` |
| `notes` | string | No, max 500 |

**Response 201:** Returns created payment record.

---

### `PATCH /api/gold/:id/status`
**Auth:** Yes — **branch_admin only**
**Description:** Updates a gold scheme member's status.

**Request Body:**
```json
{ "status": "withdrawn" }
```
Values: `active`, `completed`, `withdrawn`

**Response 200:** Returns updated member.

---

# Module 8 — Incentives / Commission Wallet (`/api/incentives`)

### `GET /api/incentives/rules`
**Auth:** Yes
**Description:** Returns all commission rules (for all projects/schemes).

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "projectName": "Gold Project",
      "role": "sales_officer",
      "amount": 500
    }
  ]
}
```

---

### `GET /api/incentives/rules/:projectId`
**Auth:** Yes
**Description:** Returns commission rules for a specific project.

**Response 200:** Returns array of rules for the given project.

---

### `POST /api/incentives/rules`
**Auth:** Yes — Roles: `md`, `director`
**Description:** Sets or updates a commission rule for a project + role.

**Request Body:**
```json
{
  "projectId": "uuid",
  "role": "sales_officer",
  "amount": 500
}
```
| Field | Type | Required |
|-------|------|----------|
| `projectId` | UUID | Yes |
| `role` | string | Yes — `sales_officer`, `abm`, `branch_manager`, `gm`, `branch_admin` |
| `amount` | number | Yes, 0–1,000,000 |

**Response 201:** Returns the set rule.

---

### `POST /api/incentives/distribute`
**Auth:** Yes — Writer roles
**Description:** Auto-cascades incentives through the hierarchy for a completed deal.

**Request Body:**
```json
{
  "schemeCode": "gold_scheme",
  "dealMakerUserId": "uuid",
  "mode": "fixed_chain",
  "sourceDescription": "Gold Scheme enrollment - Ravi Kumar",
  "sourceId": "uuid",
  "paymentEvent": "enrollment",
  "baseAmount": 10000,
  "percentRole": "sales_officer"
}
```
| Field | Type | Required |
|-------|------|----------|
| `schemeCode` | string | Yes |
| `dealMakerUserId` | UUID | Yes |
| `mode` | string | Yes — `fixed_chain` or `percent_referrer` |
| `sourceDescription` | string | Yes, max 500 |
| `sourceId` | UUID | No |
| `paymentEvent` | string | No — `enrollment` or `renewal` |
| `baseAmount` | number | No |
| `percentRole` | string | No |

**Response 200:**
```json
{
  "success": true,
  "data": [...],
  "credited": 3
}
```

---

### `GET /api/incentives/wallet`
**Auth:** Yes — All except `client`
**Description:** Returns caller's own incentive wallet summary.

**Query Params:** `startDate`, `endDate` (YYYY-MM-DD, optional)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "total": 15000,
    "thisMonth": 3000,
    "lastMonth": 5000,
    "bySource": [
      { "sourceType": "scheme", "total": 10000 },
      { "sourceType": "collection", "total": 5000 }
    ]
  }
}
```

---

### `GET /api/incentives/wallet/:userId`
**Auth:** Yes
**Description:** Returns a subordinate employee's wallet summary.

**Query Params:** `startDate`, `endDate` (optional)

**Response 200:** Same shape as own wallet.

---

### `GET /api/incentives`
**Auth:** Yes — All except `client`
**Description:** Lists incentive history for the caller.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `userId` | UUID | View another user's (if permitted) |
| `sourceType` | string | `collection`, `scheme`, `direct_cash`, `other` |
| `startDate` | string | YYYY-MM-DD |
| `endDate` | string | YYYY-MM-DD |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 200 |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "amount": 500,
      "sourceType": "scheme",
      "sourceDescription": "Gold Scheme - Ravi Kumar",
      "creditedAt": "2026-05-30T10:00:00Z"
    }
  ],
  "total": 30,
  "page": 1,
  "limit": 50
}
```

---

### `POST /api/incentives`
**Auth:** Yes — Roles: `md`, `director`, `gm`, `branch_manager`, `branch_admin`
**Description:** Manually credits an incentive to a user.

**Request Body:**
```json
{
  "userId": "uuid",
  "amount": 1000,
  "sourceType": "direct_cash",
  "sourceDescription": "Bonus for performance",
  "notes": "Extra bonus"
}
```
| Field | Type | Required |
|-------|------|----------|
| `userId` | UUID | Yes |
| `amount` | number | Yes, positive, max 10,000,000 |
| `sourceType` | string | Yes — `collection`, `scheme`, `direct_cash`, `other` |
| `sourceDescription` | string | No, max 500 |
| `notes` | string | No, max 1000 |

**Response 201:** Returns created incentive record.

---

# Module 9 — Salaries (`/api/salaries`)

### `GET /api/salaries/me`
**Auth:** Yes — All except `client`
**Description:** Returns the caller's current salary record.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "baseSalary": 25000,
    "effectiveFrom": "2026-01-01",
    "notes": "Annual revision",
    "setBy": "uuid",
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

---

### `GET /api/salaries/:userId`
**Auth:** Yes
**Description:** Returns current salary of a subordinate.

**Response 200:** Same shape as `/me`.

---

### `GET /api/salaries/:userId/history`
**Auth:** Yes
**Description:** Returns full salary history for an employee.

**Query Params:** `page` (default 1), `limit` (default 50, max 200)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "baseSalary": 20000,
      "effectiveFrom": "2025-01-01",
      "notes": null,
      "createdAt": "2025-01-01T00:00:00Z"
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 50
}
```

---

### `POST /api/salaries`
**Auth:** Yes — Roles: `md`, `director`
**Description:** Assigns or updates an employee's salary.

**Request Body:**
```json
{
  "userId": "uuid",
  "baseSalary": 30000,
  "effectiveFrom": "2026-06-01",
  "notes": "Promotion increment"
}
```
| Field | Type | Required |
|-------|------|----------|
| `userId` | UUID | Yes |
| `baseSalary` | number | Yes, 0–100,000,000 |
| `effectiveFrom` | string | Yes, YYYY-MM-DD |
| `notes` | string | No, max 1000 |

**Response 201:** Returns created salary record.

---

# Module 10 — Trading Academy (`/api/trading-academy`)

One-time enrollment scheme. Branch Admin writes; Reader roles see listings.

### `GET /api/trading-academy/employees`
**Auth:** Yes — Reader roles
**Description:** Returns branch employees for "enrolled by" dropdown.

**Response 200:** `{ "success": true, "data": [{ "id": "uuid", "name": "Name" }] }`

---

### `GET /api/trading-academy/summary`
**Auth:** Yes — Reader roles
**Description:** Returns totals for the Trading Academy scheme.

**Query Params:** `startDate`, `endDate` (optional)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalMembers": 20,
    "totalCollected": 200000
  }
}
```

---

### `GET /api/trading-academy`
**Auth:** Yes — Reader roles (SO/ABM/BM see own referrals only)
**Description:** Lists Trading Academy members.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | Name search, max 100 |
| `enrolledBy` | UUID | Filter by referrer |
| `startDate` | string | YYYY-MM-DD |
| `endDate` | string | YYYY-MM-DD |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 200 |

**Response 200:**
```json
{
  "success": true,
  "data": [...],
  "total": 20,
  "page": 1,
  "limit": 50
}
```

---

### `POST /api/trading-academy`
**Auth:** Yes — **branch_admin only**
**Description:** Adds a Trading Academy member and auto-distributes incentives.

**Request Body:**
```json
{
  "customerId": "uuid",
  "amount": 15000,
  "enrolledBy": "uuid",
  "enrollmentDate": "2026-05-30",
  "paymentMode": "gpay",
  "notes": "Referred by Ravi"
}
```
| Field | Type | Required |
|-------|------|----------|
| `customerId` | UUID | Yes, must exist |
| `amount` | number | Yes, positive, max 100,000,000 |
| `enrolledBy` | UUID | Yes — SO/ABM/BM who brought the deal |
| `enrollmentDate` | string | Yes, YYYY-MM-DD |
| `paymentMode` | string | No — `cash`, `gpay`, `bank_receipt`, default `cash` |
| `notes` | string | No, max 1000 |

**Response 201:** Returns created member record + incentive distribution results.

---

# Module 11 — Customers (`/api/customers`)

### `GET /api/customers`
**Auth:** Yes — Roles: `md`, `director`, `gm`, `branch_manager`, `abm`, `branch_admin`, `oa`
**Description:** Searches customers for the caller's branch.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `search` | string | Name/phone/code search, max 100 |
| `page` | number | Default 1 |
| `limit` | number | Default 20, max 100 |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Customer Name",
      "phone": "9876543210",
      "address": "123 Street",
      "clientCode": "TVM-0001",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

### `POST /api/customers`
**Auth:** Yes — Same allowed roles as GET
**Description:** Creates a new customer. A unique client code is auto-generated per branch.

**Request Body:**
```json
{
  "name": "Suresh Kumar",
  "phone": "9876543210",
  "address": "123 Anna Nagar, Chennai",
  "notes": "Preferred contact: evenings"
}
```
| Field | Type | Required |
|-------|------|----------|
| `name` | string | Yes, 1–255 |
| `phone` | string | No, max 20 |
| `address` | string | No, max 500 |
| `notes` | string | No, max 1000 |

**Response 201:** Returns created customer with auto-generated `clientCode`.

---

### `GET /api/customers/:id`
**Auth:** Yes — Same allowed roles
**Description:** Returns a customer's full profile including all scheme enrollments.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Suresh Kumar",
    "phone": "9876543210",
    "address": "...",
    "clientCode": "TVM-0001",
    "createdAt": "2026-01-01T00:00:00Z",
    "schemeHistory": [
      {
        "scheme": "gold_scheme",
        "enrolledAt": "2026-02-01",
        "status": "active",
        "monthlyAmount": 5000
      },
      {
        "scheme": "trading_academy",
        "enrolledAt": "2026-03-15",
        "amount": 15000
      }
    ]
  }
}
```
# AVG Employee Management System — API Documentation (Part 3)

# Module 12 — Gold Coin Scheme (`/api/gold-coin`)

## Overview
Room-based scheme. Each room has **16 slots**. Monthly draws eliminate one slot per draw until only one remains (winner). Non-head-branch rooms can be sent to the head branch for combining. Head-branch admin combines rooms and runs combined draws.

## Room Status Machine
```
filling → pending_combine → combined_into
        ↘ active → completed
```
- **filling** — Room being filled with slots (< 16 slots)
- **pending_combine** — Filled room sent to head branch, awaiting combine
- **combined_into** — Room whose slots were merged into a combined room
- **active** — Combined room (or solo 16-slot room) ready for monthly draws
- **completed** — All draws done, winner determined
- **expired** — Room abandoned/refunded

---

### `GET /api/gold-coin/packages`
**Auth:** Yes — Any authenticated user
**Description:** Lists all active Gold Coin packages (price tiers).

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Gold Coin 1000",
      "price": 1000,
      "totalSlots": 16,
      "isActive": true
    }
  ]
}
```

---

### `POST /api/gold-coin/slots`
**Auth:** Yes — **branch_admin only**
**Description:** Customer buys one or more slots. If 16 slots already exist in the current filling room for (package, branch), the service automatically opens a new room.

**Request Body:**
```json
{
  "packageId": "uuid",
  "customerId": "uuid",
  "amountPaid": 1000,
  "quantity": 1,
  "paymentMode": "cash",
  "referrerId": "uuid",
  "notes": "Customer walk-in"
}
```
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `packageId` | UUID | Yes | Must be active package |
| `customerId` | UUID | Yes | Must exist in customers |
| `amountPaid` | number | Yes | Per-slot price, max 10,000,000 |
| `quantity` | number | No | 1–16, default 1. `quantity=16` = Full room |
| `paymentMode` | string | No | `cash`, `gpay`, `bank_receipt`, default `cash` |
| `referrerId` | UUID | No | SO/ABM/BM who referred |
| `notes` | string | No | Max 500 |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "slots": [...],
    "roomId": "uuid",
    "roomStatus": "filling",
    "slotsInRoom": 3
  }
}
```

---

### `POST /api/gold-coin/slots/:id/refund`
**Auth:** Yes — **branch_admin only** (own branch's slots)
**Description:** Refunds a slot that is in `held` status, returning money to customer.

**Response 200:**
```json
{ "success": true }
```

---

### `GET /api/gold-coin/rooms/awaiting-combine`
**Auth:** Yes — **Head-branch admin only**
**Description:** Lists rooms in `pending_combine` status waiting to be merged at head branch. Register BEFORE `/rooms/:id`.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "branchName": "Vellore Branch",
      "packageId": "uuid",
      "packageName": "Gold Coin 1000",
      "slotCount": 16,
      "sentAt": "2026-05-20T10:00:00Z"
    }
  ]
}
```

---

### `GET /api/gold-coin/rooms`
**Auth:** Yes — Roles: `md`, `director`, `gm`, `branch_admin`
**Description:** Lists rooms scoped by the caller's role:
- `branch_admin` → own branch rooms
- `md` → all rooms globally
- `director`/`gm` → oversight branches only

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `status` | string | `filling`, `pending_combine`, `combined_into`, `expired`, `active`, `completed` |
| `packageId` | UUID | Filter by package |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 200 |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "branchId": "uuid",
      "branchName": "Branch",
      "packageId": "uuid",
      "packageName": "Gold Coin 1000",
      "status": "active",
      "slotCount": 16,
      "remainingSlots": 10,
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 20,
  "page": 1,
  "limit": 50
}
```

---

### `GET /api/gold-coin/rooms/:id`
**Auth:** Yes — Same viewer roles
**Description:** Returns a full room with all slots and draw history.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "branchId": "uuid",
    "packageId": "uuid",
    "status": "active",
    "slots": [
      {
        "id": "uuid",
        "customerId": "uuid",
        "customerName": "Name",
        "slotNumber": 1,
        "status": "held",
        "amountPaid": 1000,
        "paymentMode": "cash",
        "referrerId": "uuid"
      }
    ],
    "draws": [
      {
        "id": "uuid",
        "drawNumber": 1,
        "winningSlotId": "uuid",
        "drawDate": "2026-02-15",
        "notes": null
      }
    ]
  }
}
```

---

### `POST /api/gold-coin/rooms/:id/activate`
**Auth:** Yes — **branch_admin only**
**Description:** Activates a filled room (16 slots) to begin monthly draws. Only works on the admin's own branch.

**Request Body:**
```json
{ "notes": "Room activated for draws" }
```

**Response 200:** Returns updated room object.

---

### `POST /api/gold-coin/rooms/:id/draws`
**Auth:** Yes — **branch_admin only**
**Description:** Runs the next monthly draw. Admin manually picks the winning (eliminated) slot.

**Request Body:**
```json
{
  "winningSlotId": "uuid",
  "drawDate": "2026-06-15",
  "notes": "Draw witnessed by all members"
}
```
| Field | Type | Required |
|-------|------|----------|
| `winningSlotId` | UUID | Yes — must be a `held` slot in this room |
| `drawDate` | string | No, YYYY-MM-DD, defaults to today |
| `notes` | string | No, max 500 |

**Response 200:** Returns draw result including winner details.

---

### `POST /api/gold-coin/rooms/:id/send-to-head`
**Auth:** Yes — **branch_admin only** (non-head branches)
**Description:** Transitions a `filling` room to `pending_combine`, sending it to the head branch inbox.

**Response 200:** Returns updated room.

---

### `POST /api/gold-coin/rooms/combine`
**Auth:** Yes — **Head-branch admin only**
**Description:** Combines multiple `pending_combine` rooms (must share the same `packageId`) into a single 16-slot combined room at the head branch.

**Request Body:**
```json
{
  "sourceRoomIds": ["uuid1", "uuid2"],
  "notes": "Combined from Vellore and Tiruvannamalai"
}
```
| Field | Type | Required |
|-------|------|----------|
| `sourceRoomIds` | UUID[] | Yes, 2–16 rooms, all same package |
| `notes` | string | No, max 500 |

**Response 201:** Returns the new combined room.

---

### `POST /api/gold-coin/rooms/:id/refund`
**Auth:** Yes — **Head-branch admin only**
**Description:** Refunds all slots in a room (marks room `expired`).

**Request Body:**
```json
{ "reason": "Members requested refund" }
```

**Response 200:** Returns refund result.

---

### `GET /api/gold-coin/summary`
**Auth:** Yes — All except `client`
**Description:** Returns Gold Coin scheme summary scoped by role:
- `branch_admin` → own branch summary
- `md` → org-wide summary
- `director`/`gm` → oversight branches
- `branch_manager`/`abm`/`sales_officer` → own referrals only

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalRooms": 15,
    "activeRooms": 8,
    "fillingRooms": 4,
    "completedRooms": 3,
    "totalSlotsSold": 200,
    "totalCollected": 200000
  }
}
```

---

# Module 13 — LSS Scheme (`/api/lss`)

## Overview
Identical lifecycle to Gold Coin but with **20 slots per room** instead of 16. Level-based payout structure.

All endpoints mirror Gold Coin exactly with the following differences:
- Rooms have **20 slots** max (not 16)
- Uses `planId` instead of `packageId`
- `GET /api/lss/plans` instead of `/packages`
- `ListRoomsQuerySchema` uses `planId` filter param

---

### `GET /api/lss/plans`
**Auth:** Yes — Any authenticated user
**Description:** Lists all active LSS plans.

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "LSS Plan Basic", "price": 2000, "totalSlots": 20 }
  ]
}
```

---

### `POST /api/lss/slots`
**Auth:** Yes — **branch_admin only**
**Request Body:** Same as Gold Coin slots but `planId` replaces `packageId`, `quantity` max is 20.

```json
{
  "planId": "uuid",
  "customerId": "uuid",
  "amountPaid": 2000,
  "quantity": 1,
  "paymentMode": "cash",
  "referrerId": "uuid",
  "notes": null
}
```

---

### All other `/api/lss/*` endpoints
Identical to the corresponding `/api/gold-coin/*` endpoints:

| LSS Endpoint | Equivalent Gold Coin Endpoint |
|---|---|
| `POST /lss/slots/:id/refund` | `POST /gold-coin/slots/:id/refund` |
| `GET /lss/rooms/awaiting-combine` | `GET /gold-coin/rooms/awaiting-combine` |
| `GET /lss/rooms` | `GET /gold-coin/rooms` (uses `planId` filter) |
| `GET /lss/rooms/:id` | `GET /gold-coin/rooms/:id` |
| `POST /lss/rooms/:id/activate` | `POST /gold-coin/rooms/:id/activate` |
| `POST /lss/rooms/:id/draws` | `POST /gold-coin/rooms/:id/draws` |
| `POST /lss/rooms/:id/send-to-head` | `POST /gold-coin/rooms/:id/send-to-head` |
| `POST /lss/rooms/combine` | `POST /gold-coin/rooms/combine` |
| `POST /lss/rooms/:id/refund` | `POST /gold-coin/rooms/:id/refund` |
| `GET /lss/summary` | `GET /gold-coin/summary` |

---

# Module 14 — Cross-Scheme Aggregate Dashboard (`/api/schemes`)

All endpoints restricted to `md` and `director` roles only.

### `GET /api/schemes/codes`
**Auth:** Yes — `md`, `director`
**Description:** Lists all registered scheme codes and display names.

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "schemeCode": "gold_scheme", "schemeName": "AVG Gold Project" },
    { "schemeCode": "trading_academy", "schemeName": "Trading Academy" },
    { "schemeCode": "gold_coin", "schemeName": "Gold Coin Scheme" },
    { "schemeCode": "lss", "schemeName": "LSS Scheme" }
  ]
}
```

---

### `GET /api/schemes/overview`
**Auth:** Yes — `md`, `director`
**Description:** Returns all schemes with branch-level breakdown and totals in a single call.

**Query Params:** `startDate`, `endDate` (YYYY-MM-DD, optional)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "schemes": [
      {
        "schemeCode": "gold_scheme",
        "schemeName": "AVG Gold Project",
        "totals": {
          "count": 150,
          "collected": 750000,
          "commission": 75000,
          "branchCount": 8
        },
        "byBranch": [
          {
            "branchId": "uuid",
            "branchName": "Tiruvannamalai",
            "count": 20,
            "collected": 100000,
            "commission": 10000
          }
        ]
      }
    ]
  }
}
```

---

### `GET /api/schemes/:code/branches`
**Auth:** Yes — `md`, `director`
**Description:** Same as overview but for a single scheme. Useful for refreshing one card.

**Path Param:** `code` — scheme code (e.g. `gold_scheme`)  
**Query Params:** `startDate`, `endDate` (optional)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "schemeCode": "gold_scheme",
    "totals": { "count": 150, "collected": 750000, "commission": 75000, "branchCount": 8 },
    "byBranch": [...]
  }
}
```

---

### `GET /api/schemes/:code/branches/:branchId/entries`
**Auth:** Yes — `md`, `director`
**Description:** Returns individual member/entry records for one scheme at one branch.

**Path Params:** `code` (scheme code), `branchId` (UUID)  
**Query Params:** `startDate`, `endDate` (optional)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "schemeCode": "gold_scheme",
    "branchId": "uuid",
    "entries": [
      {
        "id": "uuid",
        "customerName": "Name",
        "amount": 5000,
        "enrolledAt": "2026-01-01",
        "status": "active"
      }
    ]
  }
}
```

---

# WebSocket (Socket.io) — Developer Reference

The server uses Socket.io to push real-time confirmation events to connected clients after background jobs finish processing attendance and sign-off records. Because check-in and sign-off are queued asynchronously, the REST API responds immediately with `{ queued: true }` — the socket event is the actual confirmation that the record has been saved to the database.

---

## Connection

**URL:** `wss://<your-api-host>/socket.io`  
**Path:** `/socket.io`  
**Transport:** The server is configured with `polling` first, which then automatically upgrades to a WebSocket connection after the handshake. This is required because the backend runs behind Railway's reverse proxy.

### Authentication

The JWT must be passed inside the Socket.io **`auth` handshake object** as the field `token`. Do not put the token in URL query parameters or HTTP headers — the server reads it specifically from `socket.handshake.auth.token`.

If the token is missing or expired, the server rejects the connection immediately before it is established. The client will receive a `connect_error` event with the message `"Authentication required"` or `"Invalid or expired token"`. On token expiry, the app should refresh the JWT and reconnect.

Always call `socket.disconnect()` when the user logs out to release the server-side room.

---

## How the Server Targets Users

When a socket connects, the server automatically places it into a **private room** named after the authenticated user's UUID. All events are then emitted to that specific room rather than broadcast globally — meaning a client only receives events that belong to its own user.

When an **admin marks attendance on behalf of an employee**, the server emits the confirmation event to **both rooms** — the employee's room and the admin's room — so that both UIs refresh without any extra polling.

The same dual-delivery behaviour applies to `signoff:confirmed`.

---

## Server → Client Events

### `attendance:confirmed`

**Who receives it:**
- The employee whose attendance was recorded.
- The admin who triggered the action (if different from the employee).

**When it fires:** After the BullMQ worker successfully writes the attendance record to the database.

**Payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `userId` | UUID | The employee whose attendance was recorded |
| `date` | YYYY-MM-DD | The attendance date |
| `status` | string | `present`, `absent`, or `half_day` |
| `jobId` | string or null | Internal BullMQ job key, useful for debugging |
| `markedBy` | UUID or null | The admin who triggered the action; `null` for self check-in |

**What to do on receipt:** Refresh the attendance state for the matching `userId`. If your app is an admin panel, re-fetch the branch employee list to update the status row. If it's the employee's own screen, update the today status display.

---

### `signoff:confirmed`

**Who receives it:**
- The employee who signed off.
- The admin who triggered the sign-off on their behalf (if different).

**When it fires:** After the BullMQ worker writes the `check_out_time` to the attendance record.

**Payload fields:**

| Field | Type | Description |
|-------|------|-------------|
| `userId` | UUID | The employee who signed off |
| `date` | YYYY-MM-DD | The attendance date |
| `jobId` | string or null | Internal BullMQ job key |
| `signedOffBy` | UUID or null | Admin who triggered it; `null` for self sign-off |

**What to do on receipt:** Update the employee's today record to reflect the sign-off. Show a confirmation to the user. Admin views should refresh the employee row to display the check-out time.

---

## Connection Lifecycle Summary

| Phase | What Happens |
|-------|-------------|
| Connect | Client sends JWT in the `auth` object during handshake |
| Auth check | Server verifies the JWT synchronously before accepting the connection |
| Room join | Server places the socket into a private room named after the user's UUID |
| Event delivery | Server emits events to the user's room only |
| Disconnect | Server logs the disconnection; the room is vacated |
| Logout | App must explicitly call `socket.disconnect()` |

---

# AWS S3 File Upload — Developer Guide

The backend never accepts raw file bytes through the REST API. Instead it uses **AWS S3 Presigned URLs** — a pattern where the server generates a short-lived, pre-authorized URL and the client uploads the file **directly to S3**, bypassing the API server entirely. This avoids multipart form data and keeps the API fast.

---

## The Upload Flow (3 Steps)

### Step 1 — Request a presigned upload URL from the API

Call the appropriate upload-URL endpoint with the file's MIME type as a query parameter. The server generates a unique S3 key for the file, signs it with AWS credentials, and returns both the upload URL and the key.

| What you're uploading | Endpoint to call |
|----------------------|-----------------|
| Attendance check-in photo | `GET /api/attendance/upload-url?contentType=image/jpeg` |
| Money collection receipt (GPay) | `GET /api/money/upload-url?contentType=image/jpeg&mode=gpay` |
| Money collection receipt (Bank) | `GET /api/money/upload-url?contentType=image/jpeg&mode=bank_receipt` |
| Profile photo | `GET /api/auth/profile-upload-url?kind=photo&contentType=image/jpeg` |
| Profile document / proof | `GET /api/auth/profile-upload-url?kind=proof&contentType=application/pdf` |

The response contains:
- **`uploadUrl`** — the presigned S3 PUT URL (time-limited, used in Step 2)
- **`photoKey`** or **`fileKey`** — the S3 object key (permanent identifier, used in Step 3)

> **Attendance upload URLs expire in 300 seconds (5 minutes).** All other URLs use the default TTL configured in `S3_PRESIGN_EXPIRES` (default 3600 seconds). Always request the URL immediately before uploading.

---

### Step 2 — PUT the file directly to S3

Send an HTTP `PUT` request to the `uploadUrl` received in Step 1. The file bytes go in the request body.

**Rules that must be followed:**
- Use `PUT`, not `POST`.
- The `Content-Type` header must be **exactly the same MIME type** that was passed as `contentType` in Step 1. If they differ, S3 rejects the upload with a `403 SignatureDoesNotMatch` error.
- The body must be the **raw file bytes** — not base64-encoded, not wrapped in multipart/form-data, not JSON.
- Do **not** add an `Authorization` header. The presigned URL already embeds AWS credentials as query parameters. Adding your own auth header will cause the request to fail.

S3 returns HTTP `200` with an empty body on success.

---

### Step 3 — Submit the key to the API

Once S3 confirms the upload, call the relevant API endpoint and include the **key** (from Step 1) in the request body. The server saves the key to the database — it never stores the presigned URL itself.

| Action | API endpoint | Field name to send |
|--------|-------------|-------------------|
| Check in to attendance | `POST /api/attendance` | `photoKey` |
| Submit money collection | `POST /api/money` | `photoKey` |
| Update profile photo | `PATCH /api/auth/profile-assets` | `profilePhotoKey` |
| Add a profile document | `POST /api/users/me/documents` | `s3Key` |

---

## Displaying a Photo (Download Flow)

The presigned upload URL cannot be used to display images — it only authorises `PUT`. To display a stored photo, call the download URL endpoint. The server generates a new presigned `GET` URL for the given key and returns it.

| Photo type | Download URL endpoint |
|------------|----------------------|
| Attendance photo | `GET /api/attendance/photo-url?key=<key>` |
| Money receipt | `GET /api/money/photo-url?key=<key>` |

Use the returned URL directly as the image source. Do not cache it indefinitely — download URLs also expire (default 3600 seconds) and must be re-fetched when displayed.

---

## S3 Key Structure

The server generates the key automatically. Understanding the naming pattern helps with debugging:

| Context | Key Pattern |
|---------|-------------|
| Attendance photo | `attendance/{userId}-{timestamp}-{randomHex}.jpg` |
| Money receipt (GPay) | `money/gpay/{userId}/{timestamp}.jpg` |
| Money receipt (Bank transfer) | `money/bank_receipt/{userId}/{timestamp}.jpg` |
| Profile photo | `profile/photos/{userId}-{timestamp}.{ext}` |
| Profile document | `profile/proofs/{userId}-{timestamp}.{ext}` |

---

## Common Upload Errors

| Error | Cause | How to fix |
|-------|-------|------------|
| `403 SignatureDoesNotMatch` | The `Content-Type` header in the PUT does not match the `contentType` used when requesting the URL | Ensure both values are identical (e.g. both `image/jpeg`) |
| `403 AccessDenied` or `RequestExpired` | The presigned URL has expired | Request a new presigned URL and retry the upload |
| `400 EntityTooLarge` | The file exceeds the S3 bucket's maximum object size | Compress or resize the file before uploading; enforce a max of 25 MB on the client side |
| Upload succeeds but image does not display | The `uploadUrl` was saved instead of the `photoKey`/`fileKey` | Always save the key field from the Step 1 response, never the URL |
| API returns an error about a missing key | The `contentType` query parameter was omitted from the Step 1 request | Always include `?contentType=image/jpeg` (or the correct MIME type) when calling the upload URL endpoint |

---

# Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Server port (default `3001`) |
| `NODE_ENV` | Yes | `development` or `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Min 32 chars for production |
| `JWT_EXPIRES_IN` | No | Token expiry, default `8h` |
| `FRONTEND_URL` | Yes | Allowed CORS origin |
| `ALLOWED_ORIGINS` | No | Comma-separated extra origins |
| `AWS_ACCESS_KEY_ID` | Yes | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | S3 secret key |
| `AWS_REGION` | Yes | e.g. `ap-south-2` |
| `S3_BUCKET_NAME` | Yes | S3 bucket name |
| `S3_PRESIGN_EXPIRES` | No | Presigned URL TTL (seconds), default `3600` |

---

# Quick Role Permission Reference

> This table covers only the original modules (1–11). See **Updated Role Permission Reference** near the end of the document for the full matrix including all roles and new modules.

| Action | md | director | gm | branch_manager | abm | sales_officer | branch_admin | oa | client |
|--------|----|---------|----|----------------|-----|---------------|--------------|----|--------|
| Create user | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Create branch | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self check-in | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Admin mark attendance | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Submit collection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Verify collection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add gold member | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View scheme members | ✅ | ✅* | ✅* | ✅* | ✅* | ✅* | ✅ | ❌ | ❌ |
| Set salary | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Set commission rules | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gold Coin write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Schemes overview | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* Own referrals only (director/gm/branch_manager/abm/sales_officer see only entries they referred)

---

# Pagination Convention

All list endpoints return:
```json
{
  "success": true,
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```
Some endpoints embed `data` inside the top-level object; check individual endpoint docs.

Default page = `1`, default limit = `20`–`50` (varies per endpoint). Always include `page` and `limit` query params to control pagination.

---

*Document updated 2026-07-01 — includes all modules through migration 079.*

---

# Module 15 — Agila Chit Fund Scheme (`/api/chit`)

**Overview:** 20-member, 20-month chit fund. Month 1 payment goes to the company; months 2-19 one winner per month selected by admin; month 20 final member auto-wins. 5 package tiers. Groups can be combined from multiple branches at the head branch.

### `GET /api/chit/packages`
**Auth:** Yes — Reader roles  
**Description:** Lists all active Chit packages (price tiers).

**Response 200:**
```json
{ "success": true, "data": [{ "id": 1, "name": "Package 1", "fullAmount": 5000, "halfAmount": 2500 }] }
```

---

### `PATCH /api/chit/packages/:number`
**Auth:** Yes — `md`, `director`, `management`  
**Description:** Updates a package's amounts.

**Request Body:** `{ "fullAmount": 5000, "halfAmount": 2500 }`

**Response 200:** Returns updated package.

---

### `GET /api/chit/summary`
**Auth:** Yes — Reader roles  
**Description:** Returns chit fund summary stats. Referrer-only roles see own cards only.

**Query Params:** `startDate`, `endDate`, `branchId` (optional)

**Response 200:** `{ "success": true, "data": { "totalGroups": 5, "activeGroups": 4, "totalMembers": 80 } }`

---

### `GET /api/chit/groups`
**Auth:** Yes — Reader roles  
**Description:** Lists chit groups scoped by role/branch.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `status` | string | `active`, `completed` |
| `branchId` | UUID | Override branch (oversight roles) |
| `search` | string | Group name search |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 200 |

**Response 200:** Returns array of group objects with member count.

---

### `POST /api/chit/groups`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Creates a new chit group.

**Request Body:**
```json
{
  "groupName": "Group A",
  "packageNumber": 1,
  "startDate": "2026-06-01",
  "branchId": "uuid",
  "notes": "First group"
}
```

**Response 201:** Returns created group.

---

### `GET /api/chit/groups/:id`
**Auth:** Yes — Reader roles  
**Description:** Returns full group detail including members, payments and winner history.

**Response 200:** Full group object with nested members, payments, winners.

---

### `POST /api/chit/groups/:id/members`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Adds a member to a chit group. Max 20 members per group.

**Request Body:**
```json
{
  "customerId": "uuid",
  "referrerId": "uuid",
  "firstPaymentMode": "cash",
  "firstPaymentDate": "2026-06-01",
  "notes": null
}
```

**Response 201:** Returns created member record.

---

### `POST /api/chit/groups/:id/payments`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Records a monthly payment for a group (bulk — one row per paying member).

**Request Body:**
```json
{
  "monthNumber": 2,
  "payments": [
    { "memberId": "uuid", "amount": 5000, "paymentMode": "cash", "paymentDate": "2026-07-01" }
  ]
}
```

**Response 201:** Returns array of created payment records.

---

### `POST /api/chit/groups/:id/winners`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Selects the winner for a specific month (months 2-19). Month 20 winner is auto-selected.

**Request Body:**
```json
{
  "memberId": "uuid",
  "monthNumber": 3,
  "notes": "Winner selected at branch meeting"
}
```

**Response 201:** Returns winner record.

---

### `POST /api/chit/groups/:id/cancel-member`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Cancels a member's participation. Money is held until group completion.

**Request Body:** `{ "memberId": "uuid", "reason": "Member requested exit" }`

**Response 200:** Returns updated member.

---

### `POST /api/chit/groups/:groupId/members/:memberId/correct`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Corrects a member's enrollment details (referrer, notes, etc.).

**Response 200:** Returns updated member.

---

### `POST /api/chit/groups/:groupId/payments/:paymentId/correct`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Corrects a payment record (amount, mode, date).

**Response 200:** Returns corrected payment.

---

### `GET /api/chit/groups/awaiting-combine`
**Auth:** Yes — Head-branch admin, `md`, `director`  
**Description:** Lists groups ready to be combined at head branch.

**Response 200:** Array of pending-combine groups.

---

### `POST /api/chit/groups/combine`
**Auth:** Yes — Head-branch admin  
**Description:** Combines multiple single-branch groups into one head-branch group.

**Request Body:** `{ "sourceGroupIds": ["uuid1", "uuid2"], "notes": "Combined" }`

**Response 201:** Returns new combined group.

---

# Module 16 — Builders Scheme (`/api/builders`)

**Overview:** 6-package, 60-month individual investment scheme. Customer pays a lump sum, receives fixed monthly payouts for 50 months, then chooses House or Cash path for months 51-60.

### `GET /api/builders/packages`
**Auth:** Yes — Reader roles  
**Description:** Lists all Builders packages with investment amounts and payout rates.

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "packageNumber": 1,
      "name": "₹5L Package",
      "investmentAmount": 500000,
      "monthlyPayout": 9000,
      "cashFinalMonthly": 12000,
      "houseWorth": 700000
    }
  ]
}
```

---

### `PATCH /api/builders/packages/:number`
**Auth:** Yes — `md`, `director`, `management`  
**Description:** Updates package amounts (investment, payout rates).

**Request Body:** `{ "monthlyPayout": 9500, "cashFinalMonthly": 12500 }`

**Response 200:** Returns updated package config.

---

### `GET /api/builders/summary`
**Auth:** Yes — Reader roles  
**Description:** Returns builders scheme stats. Referrer-only roles see own referrals only.

**Query Params:** `startDate`, `endDate`, `branchId` (optional)

**Response 200:** `{ "success": true, "data": { "totalPlans": 10, "totalInvestment": 5000000, "activePlans": 8 } }`

---

### `GET /api/builders/plans`
**Auth:** Yes — Reader roles  
**Description:** Lists builders plans scoped by role/branch.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `status` | string | `cooling`, `active`, `decision_pending`, `house`, `cash`, `completed`, `cancelled` |
| `branchId` | UUID | Override branch |
| `search` | string | Customer name search |
| `referrerId` | UUID | Filter by referrer |
| `startDate` | string | YYYY-MM-DD |
| `endDate` | string | YYYY-MM-DD |
| `page` | number | Default 1 |
| `limit` | number | Default 50, max 200 |

**Response 200:** Returns paginated array of plan objects.

---

### `POST /api/builders/plans`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Enrolls a customer in a builders plan.

**Request Body:**
```json
{
  "customerId": "uuid",
  "packageNumber": 1,
  "referrerId": "uuid",
  "lumpSumDate": "2026-06-01",
  "lumpSumMode": "bank_receipt",
  "branchId": "uuid",
  "notes": null
}
```

**Response 201:** Returns created plan + incentive distribution result.

---

### `GET /api/builders/plans/:id`
**Auth:** Yes — Reader roles  
**Description:** Returns full plan detail including all payout records.

**Response 200:** Full plan object with nested `payouts` array.

---

### `POST /api/builders/plans/:id/payouts`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Records a monthly payout disbursement to the customer.

**Request Body:**
```json
{
  "monthNumber": 1,
  "amount": 9000,
  "paymentDate": "2026-08-01",
  "paymentMode": "cash",
  "notes": null
}
```

**Response 201:** Returns created payout record.

---

### `POST /api/builders/plans/:id/choose-reward`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Sets the customer's reward choice at month 50 (`house` or `cash`).

**Request Body:** `{ "rewardChoice": "cash", "landProvided": false }`

**Response 200:** Returns updated plan with new status.

---

### `POST /api/builders/plans/:id/change-reward`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Corrects a previously submitted reward choice (before month 51 payout).

**Request Body:** `{ "rewardChoice": "house", "landProvided": true }`

**Response 200:** Returns updated plan.

---

### `POST /api/builders/plans/:planId/correct`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Corrects enrollment-level details (referrer, dates, notes).

**Response 200:** Returns corrected plan.

---

### `POST /api/builders/plans/:planId/payouts/:payoutId/correct`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Corrects a payout record (amount, mode, date).

**Response 200:** Returns corrected payout.

---

### `GET /api/builders/incentive-rules`
**Auth:** Yes — `md`, `director`  
**Description:** Lists commission rules specific to the builders scheme.

**Response 200:** Array of rule objects `{ role, rateType, amount }`.

---

### `PUT /api/builders/incentive-rules`
**Auth:** Yes — `md`, `director`  
**Description:** Sets a commission rule for a role.

**Request Body:** `{ "role": "sales_officer", "rateType": "fixed", "amount": 5000 }`

**Response 200:** Returns updated rule.

---

# Module 17 — Land Scheme (`/api/land`)

**Overview:** Land plot sales management. MD manages sites and plots; branch admins handle customer bookings. Lifecycle: `booked → advance_paid → full_paid → completed`. Full payment triggers a 60-month buyback bonus schedule.

### `GET /api/land/sites`
**Auth:** Yes — Reader roles  
**Description:** Lists land sites.

**Query Params:** `status` (`active`, `inactive`), `page`, `limit`

**Response 200:** Returns array of site objects.

---

### `POST /api/land/sites`
**Auth:** Yes — `md`, `management`  
**Description:** Creates a new land site.

**Request Body:**
```json
{
  "name": "Green Valley",
  "layoutName": "Phase 1",
  "location": "Tiruvannamalai",
  "address": "NH-66, Km 23",
  "state": "Tamil Nadu",
  "loanEnabled": false
}
```

**Response 201:** Returns created site.

---

### `PATCH /api/land/sites/:id`
**Auth:** Yes — `md`, `management`  
**Description:** Updates a site's details or status.

**Response 200:** Returns updated site.

---

### `GET /api/land/sites/:siteId/plots`
**Auth:** Yes — Reader roles  
**Description:** Lists plots in a site.

**Query Params:** `status` (`available`, `booked`, `cancelled`, `completed`), `page`, `limit`

**Response 200:** Returns array of plot objects.

---

### `POST /api/land/sites/:siteId/plots`
**Auth:** Yes — `md`, `management`  
**Description:** Adds a plot to a site.

**Request Body:**
```json
{
  "siteNumber": "81A",
  "areaSqft": 1200,
  "landCost": 600000,
  "buybackBonusMonthly": 5000
}
```

**Response 201:** Returns created plot.

---

### `PATCH /api/land/sites/:siteId/plots/:plotId`
**Auth:** Yes — `md`, `management`  
**Description:** Updates a plot's details or pricing.

**Response 200:** Returns updated plot.

---

### `GET /api/land/customers`
**Auth:** Yes — Reader roles  
**Description:** Lists land customers for the caller's branch.

**Query Params:** `search`, `branchId`, `page`, `limit`

**Response 200:** Returns array of land customer objects.

---

### `POST /api/land/customers`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Creates a land customer record.

**Request Body:**
```json
{
  "customerRef": "TVM-L-001",
  "name": "Ravi Kumar",
  "phone": "9876543210",
  "address": "123 Street",
  "email": "ravi@example.com",
  "idProof": "AADHAR-XXXX",
  "branchId": "uuid"
}
```

**Response 201:** Returns created land customer.

---

### `GET /api/land/bookings`
**Auth:** Yes — Reader roles  
**Description:** Lists land bookings scoped by role/branch.

**Query Params:** `status`, `siteId`, `branchId`, `referrerId`, `search`, `page`, `limit`

**Response 200:** Returns paginated array of booking objects.

---

### `POST /api/land/bookings`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Creates a new plot booking.

**Request Body:**
```json
{
  "plotId": "uuid",
  "landCustomerId": "uuid",
  "referrerId": "uuid",
  "bookingDate": "2026-06-01",
  "bookingAmount": 10000,
  "paymentMode": "cash",
  "branchId": "uuid",
  "notes": null
}
```

**Response 201:** Returns created booking + incentives if applicable.

---

### `GET /api/land/bookings/:id`
**Auth:** Yes — Reader roles  
**Description:** Returns full booking detail including advance payments, buyback schedule, and audit log.

**Response 200:** Full booking object with nested records.

---

### `POST /api/land/bookings/:id/advance`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Records an advance payment toward a booking.

**Request Body:**
```json
{
  "amount": 50000,
  "paymentDate": "2026-06-15",
  "paymentMode": "bank_receipt",
  "notes": null
}
```

**Response 201:** Returns updated booking + payment record.

---

### `POST /api/land/bookings/:id/full-payment`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Records the final full payment. Triggers creation of the 60-month buyback bonus schedule and incentive distribution.

**Request Body:**
```json
{
  "amount": 540000,
  "paymentDate": "2026-07-01",
  "paymentMode": "bank_receipt",
  "notes": null
}
```

**Response 201:** Returns booking, buyback schedule, and incentive results.

---

### `POST /api/land/bookings/:id/buyback/:payoutId/pay`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Marks a buyback bonus month as paid.

**Request Body:** `{ "paymentDate": "2026-08-01", "paymentMode": "cash" }`

**Response 200:** Returns updated payout row.

---

### `POST /api/land/bookings/:id/cancel`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Cancels a booking and records the refund.

**Request Body:** `{ "reason": "Customer changed mind" }`

**Response 200:** Returns cancelled booking.

---

---

# Module 18 — Pending Enrollments (`/api/pending-enrollments`)

**Overview:** Staging layer for partial / installment enrollments. A customer pays a deposit; subsequent part-payments accumulate until the full required amount is reached, at which point the scheme entity is auto-created. Applies to: `gold_scheme`, `trading_academy`, `builders_scheme`, `agila_chit_scheme`, `gold_coin_scheme`, `lss_scheme`.

### `POST /api/pending-enrollments`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Opens a pending enrollment with an initial deposit.

**Request Body:**
```json
{
  "schemeCode": "gold_scheme",
  "customerId": "uuid",
  "referrerId": "uuid",
  "requiredAmount": 5000,
  "branchId": "uuid",
  "payload": { ... },
  "firstPayment": {
    "amount": 1000,
    "paymentMode": "cash",
    "paidDate": "2026-06-01"
  }
}
```
| Field | Type | Notes |
|-------|------|-------|
| `schemeCode` | string | One of the 6 supported schemes |
| `requiredAmount` | number | Full scheme enrollment cost |
| `payload` | object | Scheme-specific enrollment data (replayed at completion) |
| `firstPayment` | object | Initial deposit |

**Response 201:** Returns created pending enrollment.

---

### `POST /api/pending-enrollments/:id/payments`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Records a subsequent part-payment. If `amount_paid` reaches `required_amount`, the scheme entity is auto-created.

**Request Body:**
```json
{
  "amount": 2000,
  "paymentMode": "gpay",
  "paidDate": "2026-06-15",
  "branchId": "uuid"
}
```

**Response 201:** Returns updated pending enrollment (status may flip to `completed`).

---

### `POST /api/pending-enrollments/:id/cancel`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Abandons a pending enrollment (status → `cancelled`).

**Response 200:** Returns cancelled enrollment.

---

### `POST /api/pending-enrollments/:id/retry`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Retries a failed completion (`completion_failed` status). Replays the scheme create function.

**Response 200:** Returns enrollment with updated status.

---

### `GET /api/pending-enrollments`
**Auth:** Yes — Reader roles  
**Description:** Lists pending enrollments for a branch.

**Query Params:**
| Param | Type | Notes |
|-------|------|-------|
| `schemeCode` | string | Filter by scheme |
| `status` | string | `collecting`, `completing`, `completed`, `cancelled`, `completion_failed` |
| `branchId` | UUID | Override branch |
| `page` | number | Default 1 |
| `limit` | number | Default 50 |

**Response 200:** Returns paginated list.

---

### `GET /api/pending-enrollments/:id`
**Auth:** Yes — Reader roles  
**Description:** Returns a single pending enrollment with its full installment ledger.

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "schemeCode": "gold_scheme",
    "status": "collecting",
    "requiredAmount": 5000,
    "amountPaid": 1000,
    "customer": { "id": "uuid", "name": "Suresh" },
    "payments": [
      { "id": "uuid", "amount": 1000, "paidDate": "2026-06-01", "paymentMode": "cash" }
    ]
  }
}
```

---

# Module 19 — App Settings (`/api/settings`)

All settings are key-value feature toggles stored in `app_settings`. Only `management` role can write; any authenticated user can read.

### `GET /api/settings/backdated-entry`
**Auth:** Yes — Any authenticated user  
**Description:** Returns whether backdated scheme entry is permitted.

**Response 200:** `{ "success": true, "data": { "enabled": false } }`

---

### `PUT /api/settings/backdated-entry`
**Auth:** Yes — `management` only  
**Description:** Enables or disables backdated scheme entries.

**Request Body:** `{ "enabled": true }`

**Response 200:** Returns updated setting.

---

### `GET /api/settings/whatsapp-messages`
**Auth:** Yes — Any authenticated user  
**Description:** Returns whether WhatsApp customer messaging is active.

**Response 200:** `{ "success": true, "data": { "enabled": false } }`

---

### `PUT /api/settings/whatsapp-messages`
**Auth:** Yes — `management` only  
**Description:** Enables or disables WhatsApp messaging.

**Request Body:** `{ "enabled": true }`

**Response 200:** Returns updated setting.

---

### `GET /api/settings/lss-eligibility-bypass`
**Auth:** Yes — Any authenticated user  
**Description:** Returns whether the 30-day LSS draw eligibility wait is bypassed.

**Response 200:** `{ "success": true, "data": { "enabled": false } }`

---

### `PUT /api/settings/lss-eligibility-bypass`
**Auth:** Yes — `management` only  
**Description:** Bypasses or restores the LSS eligibility wait.

**Request Body:** `{ "enabled": true }`

**Response 200:** Returns updated setting.

---

### `GET /api/settings/gold-coin-eligibility-bypass`
**Auth:** Yes — Any authenticated user  
**Description:** Returns whether the 30-day Gold Coin draw eligibility wait is bypassed.

**Response 200:** `{ "success": true, "data": { "enabled": false } }`

---

### `PUT /api/settings/gold-coin-eligibility-bypass`
**Auth:** Yes — `management` only  
**Description:** Bypasses or restores the Gold Coin eligibility wait.

**Request Body:** `{ "enabled": true }`

**Response 200:** Returns updated setting.

---

### `GET /api/settings/daily-collection-reconciliation`
**Auth:** Yes — Any authenticated user  
**Description:** Returns whether the daily collection reconciliation workflow is enabled.

**Response 200:** `{ "success": true, "data": { "enabled": false } }`

---

### `PUT /api/settings/daily-collection-reconciliation`
**Auth:** Yes — `management` only  
**Description:** Enables or disables the daily reconciliation requirement.

**Request Body:** `{ "enabled": true }`

**Response 200:** Returns updated setting.

---

# Module 20 — Daily Collection Reconciliation (`/api/reconciliation`)

**Overview:** When enabled via settings, branch admins must submit a daily summary of expected scheme collections before any scheme writes are allowed. Management can view and edit summaries for all branches.

### `POST /api/reconciliation/summary`
**Auth:** Yes — `branch_admin`, `management`  
**Description:** Branch admin declares today's expected amounts per scheme. Idempotent per (branch, date).

**Request Body:**
```json
{
  "branchId": "uuid",
  "lines": [
    { "schemeCode": "gold_scheme", "expectedAmount": 25000 },
    { "schemeCode": "trading_academy", "expectedAmount": 15000 }
  ]
}
```
> `branchId` required for management role; ignored for branch_admin (taken from JWT).

**Response 201:** Returns created summary record.

---

### `GET /api/reconciliation/summary/today`
**Auth:** Yes — `branch_admin`, `management`, `md`, `director`  
**Description:** Checks whether today's summary has been submitted for the caller's branch.

**Query Params:** `branchId` (for management roles)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "submitted": true,
    "summary": {
      "id": "uuid",
      "businessDate": "2026-07-01",
      "submittedAt": "2026-07-01T08:30:00Z",
      "lines": [{ "schemeCode": "gold_scheme", "expectedAmount": 25000 }]
    }
  }
}
```

---

### `PUT /api/reconciliation/summary/:id`
**Auth:** Yes — `management` only  
**Description:** Edits a submitted summary's expected amounts.

**Request Body:**
```json
{
  "branchId": "uuid",
  "lines": [
    { "schemeCode": "gold_scheme", "expectedAmount": 30000 }
  ]
}
```

**Response 200:** `{ "success": true, "data": { "updated": true } }`

---

### `GET /api/reconciliation/branch/:branchId`
**Auth:** Yes — `branch_admin` (own branch), `md`, `director`, `management`  
**Description:** Returns the live reconciliation panel for a branch on a given date — declared amounts vs actual collections.

**Query Params:** `businessDate` (YYYY-MM-DD, defaults to today IST)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "branchId": "uuid",
    "businessDate": "2026-07-01",
    "summarySubmitted": true,
    "lines": [
      {
        "schemeCode": "gold_scheme",
        "expectedAmount": 25000,
        "actualAmount": 22000,
        "variance": -3000
      }
    ]
  }
}
```

---

### `GET /api/reconciliation/overview`
**Auth:** Yes — `md`, `director`, `management`  
**Description:** Management dashboard showing all branches' reconciliation status for a date.

**Query Params:** `businessDate` (YYYY-MM-DD, defaults to today IST)

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "branchId": "uuid",
      "branchName": "Tiruvannamalai",
      "summarySubmitted": true,
      "status": "reconciled",
      "totalExpected": 40000,
      "totalActual": 38000,
      "variance": -2000
    }
  ]
}
```

---

# Module 21 — WhatsApp Webhooks (`/webhooks`)

These endpoints are **public** (no JWT) and verified via HMAC-SHA256 signed by Meta's app secret.

### `GET /webhooks/whatsapp`
**Auth:** None (Meta webhook verification)  
**Description:** Verification challenge during webhook registration in Meta App Dashboard. Responds with `hub.challenge` when `hub.verify_token` matches `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

**Query Params:** `hub.mode`, `hub.verify_token`, `hub.challenge`

**Response 200:** Raw string (the challenge value).

---

### `POST /webhooks/whatsapp`
**Auth:** None — HMAC-SHA256 signature check via `x-hub-signature-256` header  
**Description:** Receives delivery receipts from Meta (`sent`, `delivered`, `read`, `failed`). Updates `whatsapp_notifications` table. Always returns 200 so Meta doesn't retry.

**Response 200:** `{ "success": true }`

---

---

# Database Schema Reference

> All timestamps are `TIMESTAMPTZ`. All IDs are `UUID`. Foreign keys are listed for each table.

---

## Core Tables

### `users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(200) | |
| `email` | VARCHAR(200) UNIQUE | |
| `password_hash` | TEXT | bcrypt |
| `role` | VARCHAR(20) | `md`, `director`, `gm`, `branch_manager`, `abm`, `sales_officer`, `client`, `branch_admin`, `oa`, `management` |
| `manager_id` | UUID → users | Nullable, builds org tree |
| `branch_id` | UUID → branches | Nullable |
| `has_smartphone` | BOOLEAN | Default true |
| `is_active` | BOOLEAN | Default true |
| `profile_photo_key` | TEXT | S3 key |
| `profile_proof_key` | TEXT | S3 key |
| `created_at` | TIMESTAMPTZ | |

### `branches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(200) | |
| `gm_id` | UUID → users | Nullable |
| `admin_id` | UUID → users | Nullable |
| `shift_start` | TIME | Default 09:00 |
| `shift_end` | TIME | Default 18:00 |
| `timezone` | VARCHAR(50) | Default `Asia/Kolkata` |
| `is_active` | BOOLEAN | Default true |
| `is_head_branch` | BOOLEAN | Default false — unlocks combine/refund |
| `geofence_lat` | DECIMAL | Nullable |
| `geofence_lng` | DECIMAL | Nullable |
| `geofence_radius_m` | INTEGER | Nullable |
| `created_at` | TIMESTAMPTZ | |

### `user_oversight_branches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → users ON DELETE CASCADE | |
| `branch_id` | UUID → branches | |

---

## Attendance Tables

### `attendance`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → users | |
| `branch_id` | UUID → branches | |
| `date` | DATE | |
| `mode` | VARCHAR(10) | `office`, `field` |
| `status` | VARCHAR(10) | `present`, `absent`, `half_day` |
| `check_in_time` | TIMESTAMPTZ | |
| `check_out_time` | TIMESTAMPTZ | |
| `check_in_lat/lng` | DECIMAL(9,6) | |
| `check_out_lat/lng` | DECIMAL(9,6) | |
| `photo_key` | TEXT | S3 key |
| `field_note` | TEXT | |
| `is_corrected` | BOOLEAN | |
| `corrected_by` | UUID → users | |
| `correction_note` | TEXT | |
| `corrected_at` | TIMESTAMPTZ | |
| `marked_by` | UUID → users | |
| `submitted_at` | TIMESTAMPTZ | |
| **UNIQUE** | `(user_id, date)` | |

### `attendance_audit`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `attendance_id` | UUID → attendance | |
| `changed_by` | UUID → users | |
| `change_type` | VARCHAR(20) | |
| `old_data` | JSONB | |
| `new_data` | JSONB | |
| `changed_at` | TIMESTAMPTZ | |
> UPDATE/DELETE revoked — immutable audit trail.

---

## Money & Transaction Tables

### `projects`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(200) UNIQUE | |
| `code` | VARCHAR(50) UNIQUE | Stable scheme code |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### `money_collections`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → users | Submitter |
| `project_id` | UUID → projects | |
| `amount` | NUMERIC(15,2) | Positive |
| `mode` | VARCHAR(20) | `cash`, `gpay`, `bank_receipt`, `cash_transfer` |
| `client_name` | VARCHAR(200) | |
| `client_phone` | VARCHAR(20) | |
| `photo_key` | TEXT | S3 key |
| `assigned_verifier_id` | UUID → users | |
| `status` | VARCHAR(20) | `pending`, `approved`, `rejected` |
| `rejection_note` | TEXT | |
| `verified_at` | TIMESTAMPTZ | |
| `is_forwarded` | BOOLEAN | |
| `source_collection_ids` | UUID[] | For `cash_transfer` rows |
| `collection_date` | DATE | Override date |
| `reference_number` | VARCHAR(100) | |
| `override_branch_id` | UUID → branches | MD-only override |
| `idempotency_key` | UUID UNIQUE | |
| `submitted_at` | TIMESTAMPTZ | |

### `transactions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `sender_id` | UUID → users | |
| `receiver_id` | UUID → users | Must be sender's direct manager |
| `amount` | NUMERIC(15,2) | |
| `category` | VARCHAR(30) | `expense`, `advance`, `reimbursement`, `collection`, `other` |
| `status` | VARCHAR(30) | `pending_acknowledgment`, `acknowledged`, `rejected`, `flagged` |
| `note` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### `transaction_audit`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `transaction_id` | UUID → transactions | |
| `changed_by` | UUID → users | |
| `change_type` | VARCHAR(20) | |
| `old_data` | JSONB | |
| `new_data` | JSONB | |
| `changed_at` | TIMESTAMPTZ | |

---

## Scheme Tables

### `customers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `customer_code` | VARCHAR(20) UNIQUE | Auto-generated per branch |
| `branch_id` | UUID → branches | |
| `name` | VARCHAR(255) | |
| `phone` | VARCHAR(20) | |
| `address` | TEXT | |
| `notes` | TEXT | |
| `has_whatsapp` | BOOLEAN | Default false |
| `created_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `gold_scheme_members`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `branch_id` | UUID → branches | |
| `chit_number` | VARCHAR(20) | UNIQUE per branch |
| `customer_id` | UUID → customers | |
| `referrer_id` | UUID → users | Nullable |
| `referrer_name` | VARCHAR(200) | Denormalised |
| `monthly_amount` | NUMERIC(12,2) | |
| `start_date` | DATE | |
| `total_months` | INTEGER | Default 12 |
| `status` | VARCHAR(20) | `active`, `completed`, `withdrawn` |
| `notes` | TEXT | |
| `entered_by` | UUID → users | |
| `pending_enrollment_id` | UUID → pending_enrollments UNIQUE | Nullable |
| `created_at` | TIMESTAMPTZ | |

### `gold_scheme_payments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `member_id` | UUID → gold_scheme_members | |
| `month_number` | INTEGER | 1–60 |
| `paid_date` | DATE | |
| `amount` | NUMERIC(12,2) | |
| `payment_mode` | VARCHAR(20) | `cash`, `gpay`, `bank_receipt` |
| `notes` | TEXT | |
| `entered_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `trading_academy_members`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `branch_id` | UUID → branches | |
| `customer_id` | UUID → customers | |
| `enrolled_by` | UUID → users | The SO who brought the deal |
| `entered_by` | UUID → users | |
| `amount` | NUMERIC(12,2) | |
| `enrollment_date` | DATE | |
| `payment_mode` | VARCHAR(20) | |
| `notes` | TEXT | |
| `pending_enrollment_id` | UUID → pending_enrollments UNIQUE | Nullable |
| `created_at` | TIMESTAMPTZ | |

### `gold_coin_packages`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(100) | |
| `price` | NUMERIC(12,2) UNIQUE | |
| `gold_grams` | NUMERIC(8,3) | |
| `is_active` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### `gold_coin_rooms`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `package_id` | UUID → gold_coin_packages | |
| `branch_id` | UUID → branches | |
| `room_number` | INTEGER | UNIQUE per (package, branch) |
| `is_combined` | BOOLEAN | |
| `status` | VARCHAR(20) | `filling`, `pending_combine`, `combined_into`, `expired`, `active`, `completed` |
| `fill_deadline` | TIMESTAMPTZ | |
| `activated_at` | TIMESTAMPTZ | |
| `activated_by` | UUID → users | |
| `first_draw_date` | DATE | |
| `completed_at` | TIMESTAMPTZ | |
| `combined_into_room_id` | UUID → gold_coin_rooms | Self-referencing |
| `notes` | TEXT | |
| `created_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `gold_coin_slots`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `room_id` | UUID → gold_coin_rooms | |
| `slot_number` | INTEGER 1–16 | UNIQUE per room |
| `customer_id` | UUID → customers | |
| `branch_id` | UUID → branches | |
| `amount_paid` | NUMERIC(12,2) | |
| `payment_mode` | VARCHAR(20) | |
| `referrer_id` | UUID → users | |
| `status` | VARCHAR(15) | `held`, `won`, `refunded` |
| `won_in_draw_id` | UUID → gold_coin_draws | |
| `notes` | TEXT | |
| `entered_by` | UUID → users | |
| `pending_enrollment_id` | UUID → pending_enrollments UNIQUE | |
| `created_at` | TIMESTAMPTZ | |

### `gold_coin_draws`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `room_id` | UUID → gold_coin_rooms | |
| `draw_number` | INTEGER 1–16 | UNIQUE per room |
| `draw_date` | DATE | |
| `winning_slot_id` | UUID → gold_coin_slots UNIQUE | |
| `drawn_by` | UUID → users | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### `lss_plans`
Same structure as `gold_coin_packages` but 5 price tiers.

### `lss_rooms`
Same structure as `gold_coin_rooms` but `plan_id` instead of `package_id`, and up to **20 slots**.

### `lss_slots`
Same structure as `gold_coin_slots` but `slot_number` range 1–20.

### `lss_draws`
Same structure as `gold_coin_draws` but also stores `payout_amount` (denormalised formula result).

### `agila_chit_groups`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `branch_id` | UUID → branches | |
| `group_name` | VARCHAR(100) | UNIQUE per branch |
| `package_number` | INTEGER 1–5 | |
| `full_amount` | NUMERIC(12,2) | Months 1–10 |
| `half_amount` | NUMERIC(12,2) | Months 11–20 |
| `start_date` | DATE | |
| `current_month` | INTEGER 2–21 | Next month awaiting winner |
| `status` | VARCHAR(20) | `active`, `completed` |
| `is_combined` | BOOLEAN | Head-branch combined group |
| `notes` | TEXT | |
| `created_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `agila_chit_members`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `group_id` | UUID → agila_chit_groups | |
| `customer_id` | UUID → customers | UNIQUE per group |
| `referrer_id` | UUID → users | Nullable |
| `status` | VARCHAR(20) | `active`, `cancelled` |
| `has_won` | BOOLEAN | |
| `won_month` | INTEGER 2–20 | |
| `winner_amount` | NUMERIC(12,2) | |
| `paying_half` | BOOLEAN | Flips when won before month 11 |
| `pending_enrollment_id` | UUID → pending_enrollments UNIQUE | |
| `entered_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `agila_chit_payments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `group_id` | UUID → agila_chit_groups | |
| `member_id` | UUID → agila_chit_members | UNIQUE per (member, month) |
| `month_number` | INTEGER 1–20 | |
| `amount` | NUMERIC(12,2) | |
| `payment_date` | DATE | |
| `payment_mode` | VARCHAR(20) | |
| `entered_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `agila_chit_winners`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `group_id` | UUID → agila_chit_groups | UNIQUE per (group, month) |
| `member_id` | UUID → agila_chit_members | UNIQUE per (member, group) |
| `month_number` | INTEGER 2–20 | |
| `winner_amount` | NUMERIC(12,2) | |
| `selected_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `builders_plans`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `branch_id` | UUID → branches | |
| `customer_id` | UUID → customers | |
| `package_number` | INTEGER 1–6 | |
| `investment_amount` | NUMERIC(12,2) | |
| `monthly_payout` | NUMERIC(12,2) | M1-50 fixed |
| `cash_final_monthly` | NUMERIC(12,2) | M51-60 cash path |
| `house_worth` | NUMERIC(12,2) | House path value |
| `lump_sum_date` | DATE | |
| `lump_sum_mode` | VARCHAR(20) | |
| `cooling_end_date` | DATE | lump_sum_date + 60d |
| `payout_start_date` | DATE | |
| `current_month` | INTEGER 0–60 | Last recorded payout month |
| `reward_choice` | VARCHAR(10) | `house`, `cash` — set at month 50 |
| `status` | VARCHAR(20) | `cooling`, `active`, `decision_pending`, `house`, `cash`, `completed`, `cancelled` |
| `referrer_id` | UUID → users | |
| `pending_enrollment_id` | UUID → pending_enrollments UNIQUE | |
| `entered_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `builders_payouts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `plan_id` | UUID → builders_plans | |
| `month_number` | INTEGER 1–60 | |
| `amount` | NUMERIC(12,2) | |
| `payment_date` | DATE | |
| `payment_mode` | VARCHAR(20) | |
| `entered_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

---

## Land Tables

### `land_sites`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(200) | |
| `layout_name` | VARCHAR(200) | |
| `location` | TEXT | |
| `address` | TEXT | |
| `state` | VARCHAR(100) | |
| `loan_enabled` | BOOLEAN | Default false |
| `status` | VARCHAR(20) | `active`, `inactive` |
| `created_by` | UUID → users | |
| `updated_by` | UUID → users | |
| `created_at / updated_at` | TIMESTAMPTZ | |

### `land_plots`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `site_id` | UUID → land_sites | |
| `site_number` | VARCHAR(50) | UNIQUE per site |
| `area_sqft` | NUMERIC(12,2) | |
| `land_cost` | NUMERIC(14,2) | |
| `buyback_bonus_monthly` | NUMERIC(12,2) | |
| `status` | VARCHAR(20) | `available`, `booked`, `cancelled`, `completed` |
| `created_by / updated_by` | UUID → users | |
| `created_at / updated_at` | TIMESTAMPTZ | |

### `land_customers`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `customer_ref` | VARCHAR(50) UNIQUE | Manual ref |
| `branch_id` | UUID → branches | |
| `name` | VARCHAR(255) | |
| `phone` | VARCHAR(20) | |
| `address` | TEXT | |
| `id_proof` | TEXT | |
| `email` | VARCHAR(255) | |
| `created_by / updated_by` | UUID → users | |
| `created_at / updated_at` | TIMESTAMPTZ | |

### `land_bookings`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `plot_id` | UUID → land_plots | |
| `land_customer_id` | UUID → land_customers | |
| `branch_id` | UUID → branches | |
| `referrer_id` | UUID → users | |
| `booking_date` | DATE | |
| `booking_amount` | NUMERIC(14,2) | |
| `advance_amount` | NUMERIC(14,2) | |
| `full_payment_amount` | NUMERIC(14,2) | |
| `status` | VARCHAR(20) | `booked`, `advance_paid`, `full_paid`, `completed`, `cancelled` |
| `payment_mode` | VARCHAR(20) | |
| `notes` | TEXT | |
| `entered_by` | UUID → users | |
| `created_at / updated_at` | TIMESTAMPTZ | |

### `land_buyback_payouts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `booking_id` | UUID → land_bookings | |
| `month_number` | INTEGER 1–60 | |
| `amount` | NUMERIC(12,2) | |
| `due_date` | DATE | |
| `paid_date` | DATE | |
| `payment_mode` | VARCHAR(20) | |
| `status` | VARCHAR(20) | `pending`, `paid` |
| `paid_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

### `land_audit_log`
Append-only audit trail for all land booking state changes.

---

## Incentive & Salary Tables

### `employee_incentives`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → users | |
| `amount` | NUMERIC(12,2) | |
| `source_type` | VARCHAR(30) | `collection`, `scheme`, `direct_cash`, `other` |
| `scheme_code` | VARCHAR(50) | Scheme identifier |
| `payment_event` | VARCHAR(50) | `enrollment`, `renewal`, `monthly` |
| `source_id` | UUID | Polymorphic pointer |
| `source_description` | TEXT | Denormalised |
| `credited_by` | UUID → users | |
| `notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |

### `scheme_commission_rules`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `project_id` | UUID → projects | |
| `role` | VARCHAR(30) | |
| `rate_type` | VARCHAR(10) | `fixed`, `percent` |
| `amount` | NUMERIC(12,2) | |
| `payment_event` | VARCHAR(50) | |
| UNIQUE | `(project_id, role, payment_event)` | |

### `employee_salaries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID → users | |
| `base_salary` | NUMERIC(12,2) | |
| `effective_from` | DATE | |
| `notes` | TEXT | |
| `set_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

---

## Notification & Settings Tables

### `whatsapp_notifications`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `scheme_code` | VARCHAR(50) | |
| `event` | VARCHAR(20) | `enrollment`, `renewal` |
| `source_id` | UUID | UNIQUE per (scheme_code, event, source_id) |
| `customer_id` | UUID → customers | |
| `branch_id` | UUID → branches | |
| `template_name` | VARCHAR(100) | |
| `template_params` | JSONB | |
| `status` | VARCHAR(20) | `pending`, `sending`, `sent`, `failed`, `skipped` |
| `skip_reason` | TEXT | |
| `provider_message_id` | VARCHAR(255) | WAMID from Meta |
| `last_error` | TEXT | |
| `attempts` | INT | |
| `delivered_at` | TIMESTAMPTZ | |
| `read_at` | TIMESTAMPTZ | |
| `sent_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

### `app_settings`
| Column | Type | Notes |
|--------|------|-------|
| `key` | TEXT PK | |
| `value` | JSONB | |
| `updated_by` | UUID → users | |
| `updated_at` | TIMESTAMPTZ | |

**Known keys:**
| Key | Default | Description |
|-----|---------|-------------|
| `backdated_entry_enabled` | `false` | Allow scheme entries with past dates |
| `whatsapp_messages_enabled` | `false` | Enable WhatsApp customer notifications |
| `lss_eligibility_bypass` | `false` | Skip 30-day LSS draw wait |
| `gold_coin_eligibility_bypass` | `false` | Skip 30-day Gold Coin draw wait |
| `daily_collection_reconciliation_enabled` | `false` | Enforce daily collection summary before scheme writes |

### `daily_collection_summaries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `branch_id` | UUID → branches | UNIQUE per (branch, business_date) |
| `business_date` | DATE | |
| `submitted_by` | UUID → users | |
| `submitted_at` | TIMESTAMPTZ | |
| `updated_by` | UUID → users | |
| `updated_at` | TIMESTAMPTZ | |

### `daily_collection_summary_lines`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `summary_id` | UUID → daily_collection_summaries ON DELETE CASCADE | |
| `scheme_code` | TEXT | |
| `expected_amount` | NUMERIC(12,2) | Default 0 |
| UNIQUE | `(summary_id, scheme_code)` | |

---

## Pending Enrollment Tables

### `pending_enrollments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `scheme_code` | TEXT | One of 6 supported schemes |
| `branch_id` | UUID → branches | |
| `customer_id` | UUID → customers | |
| `referrer_id` | UUID → users | Nullable |
| `required_amount` | NUMERIC(12,2) | Full cost |
| `amount_paid` | NUMERIC(12,2) | Running total |
| `status` | TEXT | `collecting`, `completing`, `completed`, `cancelled`, `completion_failed` |
| `payload` | JSONB | Scheme create-fn params |
| `created_entity_id` | UUID | Set on completion |
| `failure_reason` | TEXT | Set on `completion_failed` |
| `entered_by` | UUID → users | |
| `created_at / updated_at` | TIMESTAMPTZ | |

### `pending_enrollment_payments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `pending_enrollment_id` | UUID → pending_enrollments ON DELETE CASCADE | |
| `amount` | NUMERIC(12,2) | |
| `payment_mode` | VARCHAR(20) | `cash`, `gpay`, `bank_receipt`, `cash_bank` |
| `cash_amount` | NUMERIC(12,2) | For cash_bank split |
| `bank_amount` | NUMERIC(12,2) | For cash_bank split |
| `proof_key` | TEXT[] | S3 keys |
| `transaction_id` | TEXT[] | |
| `paid_date` | DATE | |
| `entered_by` | UUID → users | |
| `created_at` | TIMESTAMPTZ | |

---

## Scheme Corrections & Audit

### `scheme_corrections_audit`
Append-only log of every correction made to any scheme record (gold, trading academy, builders, chit, land, LSS, Gold Coin).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `scheme_code` | VARCHAR(50) | |
| `record_type` | VARCHAR(50) | `member`, `payment`, `slot`, etc. |
| `record_id` | UUID | Polymorphic target |
| `actor_id` | UUID → users | Who made the correction |
| `old_data` | JSONB | |
| `new_data` | JSONB | |
| `is_void` | BOOLEAN | Whether correction voids the record |
| `is_delete` | BOOLEAN | Whether correction deletes the record |
| `created_at` | TIMESTAMPTZ | |

---

# Updated Role Permission Reference

| Action | md | director | gm | branch_manager | abm | sales_officer | branch_admin | management | oa | client |
|--------|----|---------|----|----------------|-----|---------------|--------------|------------|----|--------|
| Create user | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Create branch | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self check-in | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| Admin mark attendance | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Submit collection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Verify collection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Write any scheme | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View scheme members | ✅ | ✅* | ✅* | ✅* | ✅* | ✅* | ✅ | ✅ | ❌ | ❌ |
| Configure packages/plans | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Set salary | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Set commission rules | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Gold Coin / LSS write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Chit / Builders write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Land bookings write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Land sites/plots write | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Correct any scheme record | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Schemes overview | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Reconciliation submit | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Reconciliation overview | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Toggle app settings | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Pending enrollments write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |

\* Own referrals only (director/gm/bm/abm/so see only entries they personally referred)

**Role quick guide:**
- `md` — full read + site/plot creation + salary write + schemes overview
- `director` — read oversight branches + schemes overview + salary write + commission rules
- `gm` — read oversight branches + create users + admin-mark attendance + commission rules (via MD delegation)
- `branch_manager / abm / sales_officer` — read own referrals only
- `branch_admin` — full branch write (scheme entries, corrections, reconciliation)
- `management` — control-center superuser: all scheme writes + configure packages + toggle settings (never marks own attendance)
- `oa` — attendance only (self check-in), no scheme access
- `client` — no access

---

# Updated Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Yes | Server port (default `3001`) |
| `NODE_ENV` | Yes | `development` or `production` |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | Min 32 chars for production |
| `JWT_EXPIRES_IN` | No | Token expiry, default `8h` |
| `FRONTEND_URL` | Yes | Allowed CORS origin |
| `ALLOWED_ORIGINS` | No | Comma-separated extra origins |
| `AWS_ACCESS_KEY_ID` | Yes | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | S3 secret key |
| `AWS_REGION` | Yes | e.g. `ap-south-2` |
| `S3_BUCKET_NAME` | Yes | S3 bucket name |
| `S3_PRESIGN_EXPIRES` | No | Presigned URL TTL (seconds), default `3600` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | No | Meta webhook verification token |
| `WHATSAPP_WEBHOOK_SECRET` | No | Meta app secret for HMAC verification |
| `WHATSAPP_ACCESS_TOKEN` | No | Meta Graph API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | No | Meta sender phone number ID |

---

*Document updated 2026-07-01 — Employee Management System API v2.0 (migrations 001–079)*
