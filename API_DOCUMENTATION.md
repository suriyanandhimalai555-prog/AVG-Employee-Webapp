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

# WebSocket (Socket.io)

**Connection URL:** `wss://<your-api-host>/socket.io`  
**Transport:** Polling first (auto-upgrades to WebSocket)

## Authentication
Pass the JWT in the Socket.io handshake `auth` object:
```javascript
const socket = io('https://api.yourdomain.com', {
  path: '/socket.io',
  auth: { token: 'your_jwt_token' },
  transports: ['polling', 'websocket']
});
```
Connection is rejected immediately if the token is missing or expired.

## Events

### `attendance:confirmed`
Emitted to the **employee** and **admin** (if different) after an attendance job processes successfully.

**Payload:**
```json
{
  "userId": "uuid",
  "date": "2026-05-30",
  "status": "present",
  "jobId": "uuid",
  "markedBy": "uuid-or-null"
}
```

---

### `signoff:confirmed`
Emitted to the **employee** and **admin** (if different) after a sign-off job processes successfully.

**Payload:**
```json
{
  "userId": "uuid",
  "date": "2026-05-30",
  "jobId": "uuid",
  "signedOffBy": "uuid-or-null"
}
```

---

## Socket.io Client Example (JavaScript)

```javascript
import { io } from 'socket.io-client';

const socket = io('https://api.yourdomain.com', {
  path: '/socket.io',
  auth: { token: localStorage.getItem('authToken') },
  transports: ['polling', 'websocket'],
});

socket.on('connect', () => {
  console.log('Connected to real-time server');
});

socket.on('attendance:confirmed', (data) => {
  console.log('Attendance confirmed:', data);
  // Refresh UI
});

socket.on('signoff:confirmed', (data) => {
  console.log('Sign-off confirmed:', data);
});

socket.on('connect_error', (err) => {
  console.error('Socket connection error:', err.message);
});
```

---

# AWS S3 File Upload Pattern

Used for attendance photos, money collection receipts, and profile assets.

## Step-by-Step
1. **Get presigned URL** from the relevant endpoint:
   - Attendance photo: `GET /api/attendance/upload-url?contentType=image/jpeg`
   - Money receipt: `GET /api/money/upload-url?contentType=image/jpeg&mode=gpay`
   - Profile photo: `GET /api/auth/profile-upload-url?kind=photo&contentType=image/jpeg`

2. **Upload file** via HTTP PUT directly to `uploadUrl` with matching `Content-Type`:
   ```
   PUT <uploadUrl>
   Content-Type: image/jpeg
   Body: <raw file bytes>
   ```

3. **Submit the key** in the relevant API call body:
   - `POST /api/attendance` → `photoKey`
   - `POST /api/money` → `photoKey`
   - `PATCH /api/auth/profile-assets` → `profilePhotoKey`

4. **View a photo** via the download URL endpoints:
   - `GET /api/attendance/photo-url?key=<key>`
   - `GET /api/money/photo-url?key=<key>`

**Note:** Presigned URLs expire after **3600 seconds** (1 hour). Regenerate if expired.

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

| Action | md | director | gm | branch_manager | abm | sales_officer | branch_admin | oa | client |
|--------|----|---------|----|----------------|-----|---------------|--------------|----|--------|
| Create user | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create branch | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Self check-in | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Admin mark attendance | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Submit collection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Verify collection | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Add gold member | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| View gold members | ✅ | ✅ | ✅ | ✅* | ✅* | ✅* | ✅ | ❌ | ❌ |
| Set salary | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Set commission rules | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Gold Coin write | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Schemes overview | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* Own referrals only

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

*Document generated from source code — Employee Management System API v1.0*
