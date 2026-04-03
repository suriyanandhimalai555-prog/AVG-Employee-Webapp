// src/modules/attendance/attendance.service.ts
import { Pool } from 'pg';
import Redis from 'ioredis';
// Import S3 utilities for generating photo upload URLs, unique keys, and download URLs
import { generateUploadUrl, generatePhotoKey, generateDownloadUrl } from '../../config/s3';
// Import the queue function that pushes attendance jobs to the background worker
import { addAttendanceJob } from './attendance.queue';
// Import hierarchy helpers for subordinate and oversight-branch scope resolution
import { getSubtreeIds, getOversightScopeIds } from '../../shared/hierarchy';
// Import permission assertion functions that throw ForbiddenError on failure
import {
  assertCanMarkAttendance,
  assertCanCorrectAttendance,
  assertCanManageSmartphone,
} from '../../shared/permissions';
// Import custom error classes for structured HTTP error responses
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
import {
  resolveBranchAdminBranchId,
  resolveEmployeeDashboardScope,
} from '../../shared/attendance-scope';
// Import the timezone-aware date helper so all "today" values use IST, not server UTC
import { getCompanyToday } from '../../shared/date';
// Import the TypeScript types inferred from the Zod schemas for type-safe function parameters
import type {
  SubmitAttendanceInput,
  AdminMarkInput,
  CorrectionInput,
  GetAttendanceQuery,
  UserHistoryQuery,
} from './attendance.schema';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATTENDANCE SERVICE IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Export an object containing all pure business logic for attendance.
// All functions now accept 'db' and 'redis' as arguments to support Dependency Injection.
export const AttendanceService = {
  
  // Generate a presigned URL mapping mapped to an AWS GET command to yield secure time-sensitive picture access
  async getPresignedDownloadUrl(photoKey: string) {
    // Generate the URL directly using the S3 utility wrapper handling AWS Signature V4
    const downloadUrl = await generateDownloadUrl(photoKey);
    return { downloadUrl };
  },

  // ─── SUBMIT ATTENDANCE (Employee) ───
  
  async submitAttendance(
    db: Pool,
    redis: Redis,
    userId: string,
    role: string,
    branchId: string,
    payload: SubmitAttendanceInput
  ): Promise<{ queued: boolean; jobId: string }> {
    // Step 1: Permission check — throws ForbiddenError if the role is 'client'
    assertCanMarkAttendance(role as any);

    // Step 2: Smartphone check — query the database to see if the user has a smartphone
    const userResult = await db.query(
      'SELECT has_smartphone FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    if (userResult.rows[0].has_smartphone === false) {
      throw new ForbiddenError(
        'You do not have smartphone access. Ask your branch admin to mark your attendance.'
      );
    }

    // Step 3: Duplicate check using Redis atomic SET with NX — use IST date, not UTC
    const today = getCompanyToday();
    const dupeKey = `att:${userId}:${today}`;

    const result = await redis.set(dupeKey, '1', 'EX', 86400, 'NX');

    if (result === null) {
      throw new ConflictError('Attendance already marked for today');
    }

    // Step 4: Build and queue job
    const jobData = {
      userId,
      branchId,
      date: today,
      mode: payload.mode,
      status: 'present' as const,
      checkInTime: new Date().toISOString(),
      checkInLat: payload.checkInLat,
      checkInLng: payload.checkInLng,
      photoKey: payload.photoKey,
      fieldNote: payload.fieldNote,
      markedBy: userId,
      markedByAdmin: false,
    };

    await addAttendanceJob(jobData);

    return { queued: true, jobId: dupeKey };
  },

  // ─── ADMIN MARK ATTENDANCE (Branch Admin) ───
  
  async adminMark(
    db: Pool,
    redis: Redis,
    adminId: string,
    adminRole: string,
    adminBranchId: string | null,
    payload: AdminMarkInput
  ): Promise<{ queued: boolean; jobId: string }> {
    // Pass the actual caller role so the permission check is accurate for gm/md/branch_admin
    assertCanCorrectAttendance(adminRole as any);

    const targetResult = await db.query(
      'SELECT id, branch_id, has_smartphone, role FROM users WHERE id = $1 AND is_active = true',
      [payload.targetUserId]
    );

    if (targetResult.rows.length === 0) {
      throw new NotFoundError('Employee not found');
    }

    const targetUser = targetResult.rows[0];

    if (adminRole === 'md') {
      // MD may mark any branch
    } else if (adminRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(db, adminId, adminBranchId);
      if (targetUser.branch_id !== branchId) {
        throw new ForbiddenError('You can only mark attendance for employees in your branch');
      }
    } else if (adminBranchId) {
      if (targetUser.branch_id !== adminBranchId) {
        throw new ForbiddenError('You can only mark attendance for employees in your branch');
      }
    } else {
      const subtree = await getSubtreeIds(adminId);
      if (!subtree.includes(targetUser.id)) {
        throw new ForbiddenError('You can only mark attendance for people in your reporting line');
      }
    }

    if (targetUser.role === 'client') {
      throw new ForbiddenError('Clients do not have attendance');
    }

    const attendanceBranchId = targetUser.branch_id ?? adminBranchId;
    if (!attendanceBranchId) {
      throw new ForbiddenError('Employee has no branch assignment');
    }

    const today = getCompanyToday();
    const dupeKey = `att:${payload.targetUserId}:${today}`;

    const result = await redis.set(dupeKey, '1', 'EX', 86400, 'NX');

    if (result === null) {
      throw new ConflictError('Attendance already marked for this employee today');
    }

    const jobData = {
      userId: payload.targetUserId,
      branchId: attendanceBranchId,
      date: today,
      mode: payload.mode ?? 'office',
      status: payload.status,
      checkInTime: new Date().toISOString(),
      photoKey: payload.photoKey,
      fieldNote: payload.fieldNote,
      markedBy: adminId,
      markedByAdmin: true,
      targetUserId: payload.targetUserId,
    };

    await addAttendanceJob(jobData);

    return { queued: true, jobId: dupeKey };
  },

  // ─── CORRECT ATTENDANCE (Branch Admin) ───
  
  async correctAttendance(
    db: Pool,
    redis: Redis,
    adminId: string,
    adminRole: string,
    adminBranchId: string | null,
    attendanceId: string,
    payload: CorrectionInput
  ): Promise<{ success: boolean }> {
    const recordResult = await db.query(
      `SELECT a.*, u.branch_id, a.user_id AS subject_user_id
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [attendanceId]
    );

    if (recordResult.rows.length === 0) {
      throw new NotFoundError('Attendance record not found');
    }

    const record = recordResult.rows[0];

    if (adminRole === 'md') {
      // MD may correct any branch
    } else if (adminRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(db, adminId, adminBranchId);
      if (record.branch_id !== branchId) {
        throw new ForbiddenError('You can only correct attendance records in your branch');
      }
    } else if (adminBranchId) {
      if (record.branch_id !== adminBranchId) {
        throw new ForbiddenError('You can only correct attendance records in your branch');
      }
    } else {
      const subtree = await getSubtreeIds(adminId);
      if (!subtree.includes(record.subject_user_id)) {
        throw new ForbiddenError('You can only correct attendance for people in your reporting line');
      }
    }

    // Save audit log — store old data as plain JSON
    await db.query(
      `INSERT INTO attendance_audit (
        attendance_id, changed_by, change_type, old_data, new_data
      ) VALUES (
        $1, $2, 'correction',
        (SELECT row_to_json(a) FROM attendance a WHERE a.id = $1),
        $3::jsonb
      )`,
      [attendanceId, adminId, JSON.stringify(payload)]
    );

    // Update status
    await db.query(
      `UPDATE attendance SET
        status = $1,
        is_corrected = true,
        corrected_by = $2,
        correction_note = $3,
        corrected_at = NOW()
      WHERE id = $4`,
      [payload.newStatus, adminId, payload.correctionNote, attendanceId]
    );

    // Bust cache — record.date is always a raw YYYY-MM-DD string since pg type 1082 is overridden
    await redis.del(`att:${record.user_id}:${record.date}`);

    return { success: true };
  },

  // ─── LIST ATTENDANCE (Dashboard) ───
  
  async getAttendanceList(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    requesterBranchId: string | null,
    query: GetAttendanceQuery
  ): Promise<{ data: any[]; pagination: object }> {
    let scopeUserIds: string[];

    if (requesterRole === 'md') {
      const allResult = await db.query(
        `SELECT id FROM users WHERE role != 'md' AND is_active = true`
      );
      scopeUserIds = allResult.rows.map((r: any) => r.id);
    } else if (requesterRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(
        db,
        requesterId,
        requesterBranchId
      );
      const branchUsers = await db.query(
        'SELECT id FROM users WHERE branch_id = $1 AND is_active = true',
        [branchId]
      );
      scopeUserIds = branchUsers.rows.map((row: any) => row.id);
    } else if (requesterRole === 'director' || requesterRole === 'gm') {
      scopeUserIds = await getOversightScopeIds(db, requesterId);
    } else {
      scopeUserIds = await getSubtreeIds(requesterId);
    }

    const params: any[] = [scopeUserIds];
    let paramIndex = 2;

    let sql = `
      SELECT
        a.*,
        u.name AS user_name,
        u.role AS user_role,
        u.has_smartphone,
        b.name AS branch_name
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      JOIN branches b ON a.branch_id = b.id
      WHERE a.user_id = ANY($1)
    `;

    if (query.date) {
      sql += ` AND a.date = $${paramIndex}`;
      params.push(query.date);
      paramIndex++;
    }

    if (query.branchId) {
      sql += ` AND a.branch_id = $${paramIndex}`;
      params.push(query.branchId);
      paramIndex++;
    }

    if (query.status) {
      sql += ` AND a.status = $${paramIndex}`;
      params.push(query.status);
      paramIndex++;
    }

    const countSql = `SELECT COUNT(*) FROM (${sql}) AS filtered`;
    const countResult = await db.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    sql += ` ORDER BY a.submitted_at DESC`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(query.limit);
    params.push((query.page - 1) * query.limit);

    const dataResult = await db.query(sql, params);

    return {
      data: dataResult.rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  },

  // ─── USER HISTORY ───
  
  async getUserHistory(
    db: Pool,
    requesterId: string,
    targetUserId: string,
    query: UserHistoryQuery
  ): Promise<any[]> {
    if (requesterId !== targetUserId) {
      const subtreeIds = await getSubtreeIds(requesterId);
      if (!subtreeIds.includes(targetUserId)) {
        throw new ForbiddenError('You do not have access to this employee record');
      }
    }

    const result = await db.query(
      `SELECT a.*, b.name AS branch_name
       FROM attendance a
       JOIN branches b ON a.branch_id = b.id
       WHERE a.user_id = $1
         AND EXTRACT(MONTH FROM a.date) = $2
         AND EXTRACT(YEAR FROM a.date) = $3
       ORDER BY a.date ASC`,
      [targetUserId, query.month, query.year]
    );

    return result.rows;
  },

  // ─── SUMMARY (Statistics) ───
  
  async getAttendanceSummary(
    db: Pool,
    redis: Redis,
    requesterId: string,
    requesterRole: string,
    requesterBranchId: string | null,
    date: string
  ): Promise<object> {
    let scopeUserIds: string[];

    if (requesterRole === 'md') {
      // MD sees the entire organisation — skip the subtree CTE entirely
      const allResult = await db.query(
        `SELECT id FROM users WHERE role != 'md' AND is_active = true`
      );
      scopeUserIds = allResult.rows.map((r: any) => r.id);
    } else if (requesterRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(
        db,
        requesterId,
        requesterBranchId
      );
      const branchUsers = await db.query(
        'SELECT id FROM users WHERE branch_id = $1 AND is_active = true',
        [branchId]
      );
      scopeUserIds = branchUsers.rows.map((row: any) => row.id);
    } else if (requesterRole === 'director' || requesterRole === 'gm') {
      // Director / GM see their subtree + all users in oversight branches
      scopeUserIds = await getOversightScopeIds(db, requesterId);
    } else {
      scopeUserIds = await getSubtreeIds(requesterId);
    }

    // Round 1: fetch filtered user list, requester's today record, and monthly stats in parallel.
    // today and myMonth only depend on requesterId/date — independent of scopeUserIds.
    const fetchToday = requesterRole !== 'branch_admin';
    const fetchMyMonth = requesterRole !== 'branch_admin' && requesterRole !== 'md';

    const [filterResult, rawTodayResult, rawMonthResult] = await Promise.all([
      db.query(
        `SELECT id FROM users WHERE id = ANY($1) AND role != 'md' AND is_active = true`,
        [scopeUserIds]
      ),
      fetchToday
        ? db.query(
            `SELECT id, status, mode, check_in_time, field_note, check_in_lat, check_in_lng
             FROM attendance WHERE user_id = $1 AND date = $2`,
            [requesterId, date]
          )
        : Promise.resolve(null),
      fetchMyMonth
        ? db.query(
            `SELECT
               COUNT(CASE WHEN status = 'present'  THEN 1 END)::int AS present,
               COUNT(CASE WHEN status = 'absent'   THEN 1 END)::int AS absent,
               COUNT(CASE WHEN mode   = 'field'    THEN 1 END)::int AS field
             FROM attendance
             WHERE user_id = $1
               AND date >= date_trunc('month', $2::date)
               AND date <  date_trunc('month', $2::date) + interval '1 month'`,
            [requesterId, date]
          )
        : Promise.resolve(null),
    ]);

    const filteredIds = filterResult.rows.map((r: any) => r.id);
    const totalEmployees = filteredIds.length;

    // Build today's record — check Redis if DB has no row yet (job may still be in queue)
    let today: any = null;
    if (fetchToday) {
      if (rawTodayResult && rawTodayResult.rows.length > 0) {
        today = rawTodayResult.rows[0];
      } else {
        // Fallback: if Redis dedupe key exists, the job is queued but not yet persisted
        const queued = await redis.exists(`att:${requesterId}:${date}`);
        if (queued) {
          today = { status: 'present', mode: 'pending', queued: true };
        }
      }
    }

    // Monthly aggregate for the requester's own record.
    // Used by the "Your Month at a Glance" stats grid on the employee home tab.
    // Not computed for branch_admin (they don't have their own attendance record in this context).
    const myMonth: { present: number; absent: number; field: number } | null =
      fetchMyMonth && rawMonthResult ? rawMonthResult.rows[0] : null;

    // Round 2: fetch attendance stats and per-branch breakdown in parallel.
    // Both depend on filteredIds from Round 1.
    const fetchBranchStats = ['gm', 'director', 'md'].includes(requesterRole) && filteredIds.length > 0;

    const [attendanceResult, branchStatsResult] = await Promise.all([
      db.query(
        `SELECT status, mode, COUNT(*)::int AS count
         FROM attendance
         WHERE user_id = ANY($1) AND date = $2
         GROUP BY status, mode`,
        [filteredIds, date]
      ),
      fetchBranchStats
        ? db.query(
            `SELECT
               b.id,
               b.name,
               COUNT(u.id)::int                                          AS total,
               COUNT(CASE WHEN a.status = 'present' THEN 1 END)::int    AS present
             FROM users u
             JOIN branches b ON u.branch_id = b.id
             LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $2
             WHERE u.id = ANY($1::uuid[])
             GROUP BY b.id, b.name
             ORDER BY b.name`,
            [filteredIds, date]
          )
        : Promise.resolve(null),
    ]);

    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let field = 0;
    let office = 0;
    let totalMarked = 0;

    for (const row of attendanceResult.rows) {
      totalMarked += row.count;
      if (row.status === 'present') present += row.count;
      if (row.status === 'absent') absent += row.count;
      if (row.status === 'half_day') halfDay += row.count;
      if (row.mode === 'field') field += row.count;
      if (row.mode === 'office') office += row.count;
    }

    // Per-branch breakdown — only meaningful for roles that oversee multiple branches
    const branches: any[] = fetchBranchStats && branchStatsResult
      ? branchStatsResult.rows.map((r: any) => ({
          id: r.id,
          name: r.name,
          total: r.total,
          present: r.present,
          // Round to nearest integer; shown as "74%" in the UI
          presentPercent: r.total > 0 ? Math.round((r.present / r.total) * 100) : 0,
        }))
      : [];

    return {
      date,
      total: totalEmployees,
      present,
      absent,
      halfDay,
      field,
      office,
      notMarked: totalEmployees - totalMarked,
      today,
      branches,
      myMonth,
    };
  },

  // ─── BRANCH EMPLOYEES (Admin Dashboard) ───
  
  async getBranchEmployees(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    branchId: string | null,
    filters: {
      search?: string;
      filterBranchId?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }> {
    const todayStr = getCompanyToday();
    const page = Math.max(1, filters.page ?? 1);
    // Branch-scoped callers (branch_admin) typically have ≤100 staff — allow up to 200
    const limit = Math.min(200, Math.max(1, filters.limit ?? 50));

    const scope = await resolveEmployeeDashboardScope(db, {
      id: requesterId,
      role: requesterRole,
      branchId,
    });

    if (scope.kind === 'subtree' && scope.userIds.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }

    let baseWhere = `WHERE u.is_active = true AND u.role != 'md'`;
    const params: any[] = [todayStr];
    let paramIndex = 2;

    if (scope.kind === 'branch') {
      baseWhere += ` AND u.branch_id = $${paramIndex++}`;
      params.push(scope.branchId);
    } else if (scope.kind === 'subtree') {
      baseWhere += ` AND u.id = ANY($${paramIndex++}::uuid[])`;
      params.push(scope.userIds);
    } else {
      // global_exclude_md — already excluded above
      baseWhere += ` AND u.branch_id IS NOT NULL`;
    }

    // Optional drill-down: MD/Director viewing one specific branch from the branch list
    if (filters.filterBranchId) {
      baseWhere += ` AND u.branch_id = $${paramIndex++}`;
      params.push(filters.filterBranchId);
    }

    // Full-text search on name or email
    if (filters.search?.trim()) {
      baseWhere += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${filters.search.trim()}%`);
      paramIndex++;
    }

    const selectSql = `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        u.has_smartphone,
        u.branch_id AS employee_branch_id,
        a.id        AS attendance_id,
        a.status,
        a.mode,
        a.check_in_time,
        a.field_note,
        a.is_corrected,
        a.photo_key,
        a.check_in_lat,
        a.check_in_lng,
        b.name      AS branch_name
      FROM users u
      LEFT JOIN attendance a ON a.user_id = u.id AND a.date = $1
      LEFT JOIN branches b   ON u.branch_id = b.id
      ${baseWhere}
    `;

    // Count and data fetched in parallel — both use the same WHERE clause
    const [countResult, dataResult] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM (${selectSql}) AS _c`, params),
      db.query(
        `${selectSql}
         ORDER BY CASE WHEN a.id IS NULL THEN 0 ELSE 1 END, u.name ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, (page - 1) * limit]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // ─── S3 PRESIGNED URL ───
  
  async getPresignedUploadUrl(userId: string, contentType: string): Promise<{ uploadUrl: string; photoKey: string; expiresIn: number }> {
    const photoKey = generatePhotoKey(userId);
    // Pass contentType so S3 stores the object with the correct MIME type
    const uploadUrl = await generateUploadUrl(photoKey, contentType);
    return { uploadUrl, photoKey, expiresIn: 300 };
  },

  // ─── SMARTPHONE ACCESS ───
  
  async updateSmartphoneStatus(
    db: Pool,
    redis: Redis,
    adminId: string,
    adminBranchId: string | null | undefined,
    targetUserId: string,
    hasSmartphone: boolean
  ): Promise<{ success: boolean }> {
    const branchId = await resolveBranchAdminBranchId(db, adminId, adminBranchId);

    const userResult = await db.query(
      'SELECT id, branch_id FROM users WHERE id = $1 AND is_active = true',
      [targetUserId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('Employee not found');
    }

    const user = userResult.rows[0];

    if (user.branch_id !== branchId) {
      throw new ForbiddenError('You can only manage employees in your branch');
    }

    await db.query(
      'UPDATE users SET has_smartphone = $1 WHERE id = $2',
      [hasSmartphone, targetUserId]
    );

    if (hasSmartphone) {
      const today = getCompanyToday();
      await redis.del(`att:${targetUserId}:${today}`);
    }

    return { success: true };
  },
};
