// src/modules/attendance/attendance.service.ts
import { Pool } from 'pg';
import Redis from 'ioredis';
import { populateAvatarUrls } from '../../shared/avatar.util';
// Import S3 utilities for generating photo upload URLs, unique keys, and download URLs
import { generateUploadUrl, generatePhotoKey, generateDownloadUrl } from '../../config/s3';
// Import the queue functions that push attendance and sign-off jobs to the background worker
import { addAttendanceJob, addSignOffJob } from './attendance.queue';
// Import hierarchy helpers for subordinate checks in admin actions
import { getSubtreeIds } from '../../shared/hierarchy';
// Import permission assertion functions that throw ForbiddenError on failure
import {
  assertCanMarkAttendance,
  assertCanCorrectAttendance,
  assertCanManageSmartphone,
} from '../../shared/permissions';
// Import custom error classes for structured HTTP error responses
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import {
  resolveBranchAdminBranchId,
} from '../../shared/attendance-scope';
import { getHierarchyVisibleUserIds } from '../../shared/hierarchy-visibility';
// Import the timezone-aware date helper so all "today" values use IST, not server UTC
import { getCompanyToday } from '../../shared/date';
// Import the TypeScript types inferred from the Zod schemas for type-safe function parameters
import type {
  SubmitAttendanceInput,
  AdminMarkInput,
  CorrectionInput,
  GetAttendanceQuery,
  UserHistoryQuery,
  SignOffInput,
  AdminSignOffInput,
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
    branchId: string | null,
    payload: SubmitAttendanceInput
  ): Promise<{ queued: boolean; jobId: string }> {
    // Step 1: Permission check — throws ForbiddenError if the role is 'client'
    assertCanMarkAttendance(role as any);

    // Step 2: Smartphone + branch check — one query covers both
    // Directors/GMs have no branch_id in users table; attendance.branch_id is nullable,
    // so their records are stored with branch_id = NULL (global scope, no branch leakage).
    const userResult = await db.query(
      'SELECT has_smartphone, branch_id FROM users WHERE id = $1',
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

    // Prefer JWT branchId → users.branch_id → first oversight branch (director/gm path).
    // If none is found, branch_id stays NULL — valid for Directors/GMs who operate globally.
    let resolvedBranchId: string | null = branchId ?? userResult.rows[0].branch_id ?? null;
    if (!resolvedBranchId) {
      const oversightResult = await db.query(
        'SELECT branch_id FROM user_oversight_branches WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      resolvedBranchId = oversightResult.rows[0]?.branch_id ?? null;
    }

    // Step 3: Duplicate check using Redis atomic SET with NX — use IST date, not UTC
    const today = getCompanyToday();
    const dupeKey = `att:${userId}:${today}`;

    const result = await redis.set(dupeKey, '1', 'EX', 86400, 'NX');

    if (result === null) {
      throw new ConflictError('Attendance already marked for today');
    }

    // Step 4: Build and queue job — use resolvedBranchId so the worker INSERT never hits NOT NULL
    const jobData = {
      userId,
      branchId: resolvedBranchId,
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
    const scopeUserIds = await getHierarchyVisibleUserIds(db, {
      id: requesterId,
      role: requesterRole,
      branchId: requesterBranchId,
    }, {
      includeSelf: requesterRole === 'sales_officer',
      allowAbmBranchFallback: true,
    });

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
      LEFT JOIN branches b ON a.branch_id = b.id
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
    requesterRole: string,
    requesterBranchId: string | null,
    targetUserId: string,
    query: UserHistoryQuery
  ): Promise<any[]> {
    // Permission check — only run when the viewer is not looking at their own record
    if (requesterId !== targetUserId) {
      if (requesterRole === 'md') {
        // MD can view any employee record — no subtree query needed
      } else if (requesterRole === 'branch_admin') {
        // Branch admin can view employees in their own branch only
        const branchId = await resolveBranchAdminBranchId(db, requesterId, requesterBranchId);
        const targetResult = await db.query<{ branch_id: string }>(
          'SELECT branch_id FROM users WHERE id = $1 AND is_active = true',
          [targetUserId]
        );
        if (
          targetResult.rows.length === 0 ||
          targetResult.rows[0].branch_id !== branchId
        ) {
          throw new ForbiddenError('You do not have access to this employee record');
        }
      } else if (requesterRole === 'director' || requesterRole === 'gm') {
        const scopeIds = await getHierarchyVisibleUserIds(db, {
          id: requesterId,
          role: requesterRole,
          branchId: requesterBranchId,
        }, {
          includeSelf: false,
          allowAbmBranchFallback: true,
        });
        if (!scopeIds.includes(targetUserId)) {
          throw new ForbiddenError('You do not have access to this employee record');
        }
      } else {
        const scopeUserIds = await getHierarchyVisibleUserIds(db, {
          id: requesterId,
          role: requesterRole,
          branchId: requesterBranchId,
        }, {
          includeSelf: false,
          allowAbmBranchFallback: true,
        });
        const allowed = scopeUserIds.includes(targetUserId);
        if (!allowed) {
          throw new ForbiddenError('You do not have access to this employee record');
        }
      }
    }

    const result = await db.query(
      `SELECT a.*, a.check_out_time, a.check_out_lat, a.check_out_lng, b.name AS branch_name
       FROM attendance a
       LEFT JOIN branches b ON a.branch_id = b.id
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
    const scopeUserIds = await getHierarchyVisibleUserIds(db, {
      id: requesterId,
      role: requesterRole,
      branchId: requesterBranchId,
    }, {
      includeSelf: requesterRole === 'sales_officer',
      allowAbmBranchFallback: true,
    });

    // Round 1: fetch filtered user list, requester's today record, and monthly stats in parallel.
    // today and myMonth only depend on requesterId/date — independent of scopeUserIds.
    const fetchToday = requesterRole !== 'branch_admin';
    const fetchMyMonth = requesterRole !== 'branch_admin' && requesterRole !== 'md';

    const [filterResult, rawTodayResult, rawMonthResult] = await Promise.all([
      db.query(
        `SELECT id
         FROM users
         WHERE id = ANY($1)
           AND role NOT IN ('md', 'client')
           AND is_active = true`,
        [scopeUserIds]
      ),
      fetchToday
        ? db.query(
            `SELECT id, status, mode, check_in_time, field_note, check_in_lat, check_in_lng,
                    check_out_time, check_out_lat, check_out_lng
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
    // True when today's job is queued in Redis but not yet persisted to the DB by the worker.
    // Used below to tentatively adjust myMonth so the UI reflects the pending submission.
    let pendingToday = false;
    if (fetchToday) {
      if (rawTodayResult && rawTodayResult.rows.length > 0) {
        today = rawTodayResult.rows[0];
        // Auto-absent creates a DB record with status='absent' before the worker processes
        // the real check-in. If the Redis dupe key still exists the employee's job is still
        // in the BullMQ queue — surface it as pending so the UI doesn't show "Not Marked Yet"
        // and the employee doesn't get a confusing 409 ConflictError if they try to re-submit.
        if (today.status === 'absent') {
          const queued = await redis.exists(`att:${requesterId}:${date}`);
          if (queued) {
            today = { status: 'present', mode: 'pending', queued: true };
          }
        } else if (today.check_out_time === null) {
          // If no DB check_out_time yet, check if a sign-off job is queued in Redis
          const signoffQueued = await redis.exists(`signoff:${requesterId}:${date}`);
          if (signoffQueued) {
            // Optimistically mark sign-off as pending so the UI shows "signing off..."
            today = { ...today, signOffPending: true };
          }
        }
      } else {
        // Fallback: if Redis dedupe key exists, the job is queued but not yet persisted
        const queued = await redis.exists(`att:${requesterId}:${date}`);
        if (queued) {
          today = { status: 'present', mode: 'pending', queued: true };
          pendingToday = true;
        }
      }
    }

    // Monthly aggregate for the requester's own record.
    // Used by the "Your Month at a Glance" stats grid on the employee home tab.
    // Not computed for branch_admin (they don't have their own attendance record in this context).
    let myMonth: { present: number; absent: number; field: number } | null =
      fetchMyMonth && rawMonthResult ? rawMonthResult.rows[0] : null;

    // If today's job is pending in Redis but not yet in the DB, the monthly DB query
    // doesn't include today's submission yet. Tentatively add +1 to present so the
    // "Your Month at a Glance" stats update immediately after the user submits —
    // before the worker writes to the DB and the socket/fallback triggers a refetch.
    if (myMonth && pendingToday) {
      myMonth = { ...myMonth, present: myMonth.present + 1 };
    }

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

  // ─── GET BRANCH EMPLOYEES ───
  async getBranchEmployees(
    db: Pool,
    redis: Redis,
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
    let baseWhere = `WHERE u.is_active = true AND u.role NOT IN ('md', 'client')`;
    const params: any[] = [todayStr];
    let paramIndex = 2;

    // Branch admin is outside hierarchy visibility; always scope by their resolved branch.
    if (requesterRole === 'branch_admin') {
      const resolvedBranchId = await resolveBranchAdminBranchId(db, requesterId, branchId);
      baseWhere += ` AND u.branch_id = $${paramIndex++}`;
      params.push(resolvedBranchId);
    } else {
      const scopeUserIds = await getHierarchyVisibleUserIds(db, {
        id: requesterId,
        role: requesterRole,
        branchId,
      }, {
        includeSelf: false,
        allowAbmBranchFallback: true,
      });

      if (scopeUserIds.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }

      baseWhere += ` AND u.id = ANY($${paramIndex++}::uuid[])`;
      params.push(scopeUserIds);
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
        u.profile_photo_key,
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
        a.check_out_time,
        a.check_out_lat,
        a.check_out_lng,
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
    const employees = dataResult.rows;

    await populateAvatarUrls(redis, employees, e => e.profile_photo_key, (e, url) => e.profilePhotoUrl = url);
    employees.forEach(e => delete e.profile_photo_key);

    return {
      data: employees,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },

  // ─── SIGN OFF (Employee self clock-out) ───

  async signOff(
    db: Pool,
    redis: Redis,
    userId: string,
    role: string,
    payload: SignOffInput
  ): Promise<{ queued: boolean; jobId: string }> {
    // Step 1: Permission check — MD and client do not mark attendance
    assertCanMarkAttendance(role as any);

    // Step 2: Smartphone check — only employees with smartphones sign off themselves
    const userResult = await db.query(
      'SELECT has_smartphone FROM users WHERE id = $1',
      [userId]
    );
    if (userResult.rows.length === 0) throw new NotFoundError('User not found');
    if (userResult.rows[0].has_smartphone === false) {
      throw new ForbiddenError(
        'You do not have smartphone access. Ask your branch admin to sign off for you.'
      );
    }

    const today = getCompanyToday();

    // Step 3: Prerequisite check — must have checked in before signing off
    const attendanceResult = await db.query(
      'SELECT id, check_out_time FROM attendance WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    if (attendanceResult.rows.length === 0) {
      // No DB row — inspect the Redis dupe key to determine what happened
      const dupeKey = `att:${userId}:${today}`;
      const ttl = await redis.ttl(dupeKey);

      if (ttl > 0) {
        // TTL counts down from 86400. Age = 86400 - ttl.
        // If < 60s old the worker is still processing — ask them to wait.
        // If >= 60s old the worker failed (exhausted retries, crashed, etc.) —
        // clear the stale key so the user can re-check in fresh.
        const ageSeconds = 86400 - ttl;
        if (ageSeconds < 60) {
          throw new ConflictError('Check-in is still processing. Please try signing off shortly.');
        }
        await redis.del(dupeKey);
        throw new ConflictError(
          'Your check-in could not be processed by the server. Please check in again.'
        );
      }

      throw new ValidationError('You must check in before signing off.');
    }

    // DB row exists — check if already signed off
    if (attendanceResult.rows[0].check_out_time !== null) {
      throw new ConflictError('You have already signed off for today.');
    }

    // Step 4: Redis dupe guard — SET signoff:{userId}:{date} NX EX 86400
    const dupeKey = `signoff:${userId}:${today}`;
    const dupeResult = await redis.set(dupeKey, '1', 'EX', 86400, 'NX');
    if (dupeResult === null) {
      throw new ConflictError('Sign-off already submitted for today.');
    }

    // Step 5: Queue the sign-off job
    await addSignOffJob({
      userId,
      date: today,
      checkOutTime: new Date().toISOString(),
      checkOutLat: payload.checkOutLat,
      checkOutLng: payload.checkOutLng,
      signedOffBy: userId,
      signedOffByAdmin: false,
    });

    return { queued: true, jobId: dupeKey };
  },

  // ─── ADMIN SIGN OFF (Branch Admin on behalf of no-smartphone employee) ───

  async adminSignOff(
    db: Pool,
    redis: Redis,
    adminId: string,
    adminRole: string,
    adminBranchId: string | null,
    payload: AdminSignOffInput
  ): Promise<{ queued: boolean; jobId: string }> {
    // Only roles that can correct attendance may perform admin sign-off
    assertCanCorrectAttendance(adminRole as any);

    // Verify target employee exists and is in the admin's scope
    const targetResult = await db.query(
      'SELECT id, branch_id, has_smartphone, role FROM users WHERE id = $1 AND is_active = true',
      [payload.targetUserId]
    );
    if (targetResult.rows.length === 0) throw new NotFoundError('Employee not found');

    const targetUser = targetResult.rows[0];

    // Branch-scope validation — same logic as adminMark
    if (adminRole === 'md') {
      // MD may sign off for any branch
    } else if (adminRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(db, adminId, adminBranchId);
      if (targetUser.branch_id !== branchId) {
        throw new ForbiddenError('You can only sign off employees in your branch');
      }
    } else if (adminBranchId) {
      if (targetUser.branch_id !== adminBranchId) {
        throw new ForbiddenError('You can only sign off employees in your branch');
      }
    } else {
      const subtree = await getSubtreeIds(adminId);
      if (!subtree.includes(targetUser.id)) {
        throw new ForbiddenError('You can only sign off people in your reporting line');
      }
    }

    if (targetUser.role === 'client') {
      throw new ForbiddenError('Clients do not have attendance');
    }

    const today = getCompanyToday();

    // Prerequisite check — employee must have a DB record for today (checked in)
    const attendanceResult = await db.query(
      'SELECT id, check_out_time FROM attendance WHERE user_id = $1 AND date = $2',
      [payload.targetUserId, today]
    );

    if (attendanceResult.rows.length === 0) {
      const dupeKey = `att:${payload.targetUserId}:${today}`;
      const ttl = await redis.ttl(dupeKey);
      if (ttl > 0) {
        const ageSeconds = 86400 - ttl;
        if (ageSeconds < 60) {
          throw new ConflictError('Check-in is still processing. Please try signing off shortly.');
        }
        await redis.del(dupeKey);
        throw new ConflictError(
          'Employee check-in could not be processed. Please mark their attendance again.'
        );
      }
      throw new ValidationError('Employee must check in before signing off.');
    }

    if (attendanceResult.rows[0].check_out_time !== null) {
      throw new ConflictError('Employee has already signed off for today.');
    }

    // Redis dupe guard for admin sign-off — same key namespace as self sign-off
    const dupeKey = `signoff:${payload.targetUserId}:${today}`;
    const dupeResult = await redis.set(dupeKey, '1', 'EX', 86400, 'NX');
    if (dupeResult === null) {
      throw new ConflictError('Sign-off already submitted for this employee today.');
    }

    await addSignOffJob({
      userId: payload.targetUserId,
      date: today,
      checkOutTime: new Date().toISOString(),
      checkOutLat: payload.checkOutLat,
      checkOutLng: payload.checkOutLng,
      signedOffBy: adminId,
      signedOffByAdmin: true,
    });

    return { queued: true, jobId: dupeKey };
  },

  // ─── TEAM HISTORY (Aggregated calendar data for manager roles) ───

  async getTeamHistory(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    requesterBranchId: string | null,
    query: UserHistoryQuery
  ): Promise<any[]> {
    // Resolve the set of user IDs this requester is allowed to see — same branching as getAttendanceSummary
    const scopeUserIds = await getHierarchyVisibleUserIds(db, {
      id: requesterId,
      role: requesterRole,
      branchId: requesterBranchId,
    }, {
      includeSelf: requesterRole === 'sales_officer',
      allowAbmBranchFallback: true,
    });

    // Aggregate attendance counts grouped by date, status, and mode for the given month/year
    const result = await db.query(
      `SELECT
         date::text AS date,
         status,
         mode,
         COUNT(*)::int AS count
       FROM attendance
       WHERE user_id = ANY($1)
         AND EXTRACT(MONTH FROM date) = $2
         AND EXTRACT(YEAR FROM date) = $3
       GROUP BY date, status, mode
       ORDER BY date ASC`,
      [scopeUserIds, query.month, query.year]
    );

    // Collapse multiple rows per date (one per status+mode combination) into a single day object
    const dayMap: Record<string, any> = {};
    for (const row of result.rows) {
      const d = row.date;
      if (!dayMap[d]) {
        dayMap[d] = { date: d, present: 0, absent: 0, halfDay: 0, field: 0, office: 0, total: 0 };
      }
      dayMap[d].total += row.count;
      if (row.status === 'present')  dayMap[d].present  += row.count;
      if (row.status === 'absent')   dayMap[d].absent   += row.count;
      if (row.status === 'half_day') dayMap[d].halfDay  += row.count;
      if (row.mode   === 'field')    dayMap[d].field    += row.count;
      if (row.mode   === 'office')   dayMap[d].office   += row.count;
    }

    return Object.values(dayMap);
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
