// src/modules/attendance/attendance.service.ts
import { Pool } from 'pg';
import Redis from 'ioredis';
// Import S3 utilities for generating photo upload URLs, unique keys, and download URLs
import { generateUploadUrl, generatePhotoKey, generateDownloadUrl } from '../../config/s3';
// Import the queue function that pushes attendance jobs to the background worker
import { addAttendanceJob } from './attendance.queue';
// Import the hierarchy function that returns all subordinate user IDs
import { getSubtreeIds } from '../../shared/hierarchy';
// Import permission assertion functions that throw ForbiddenError on failure
import {
  assertCanMarkAttendance,
  assertCanCorrectAttendance,
  assertCanManageSmartphone,
} from '../../shared/permissions';
// Import custom error classes for structured HTTP error responses
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/errors';
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

    // Step 3: Duplicate check using Redis atomic SET with NX
    const today = new Date().toISOString().split('T')[0];
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
    assertCanCorrectAttendance('branch_admin');

    const targetResult = await db.query(
      'SELECT id, branch_id, has_smartphone, role FROM users WHERE id = $1 AND is_active = true',
      [payload.targetUserId]
    );

    if (targetResult.rows.length === 0) {
      throw new NotFoundError('Employee not found');
    }

    const targetUser = targetResult.rows[0];

    // Scoping Check: 
    // Branch admins can only mark for their own branch.
    // MDs can mark for any branch.
    if (adminRole !== 'md' && targetUser.branch_id !== adminBranchId) {
      throw new ForbiddenError('You can only mark attendance for employees in your branch');
    }

    if (targetUser.has_smartphone === true) {
      throw new ForbiddenError('This employee marks their own attendance');
    }

    if (targetUser.role === 'client') {
      throw new ForbiddenError('Clients do not have attendance');
    }

    const today = new Date().toISOString().split('T')[0];
    const dupeKey = `att:${payload.targetUserId}:${today}`;

    const result = await redis.set(dupeKey, '1', 'EX', 86400, 'NX');

    if (result === null) {
      throw new ConflictError('Attendance already marked for this employee today');
    }

    const jobData = {
      userId: payload.targetUserId,
      // If admin has no branchId (MD), use the target employee's branchId
      branchId: adminBranchId || targetUser.branch_id,
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
      `SELECT a.*, u.branch_id
       FROM attendance a
       JOIN users u ON a.user_id = u.id
       WHERE a.id = $1`,
      [attendanceId]
    );

    if (recordResult.rows.length === 0) {
      throw new NotFoundError('Attendance record not found');
    }

    const record = recordResult.rows[0];

    // Scoping Check: 
    // Branch admins can only correct their own branch.
    // MDs (who have null adminBranchId) can correct any branch.
    if (adminRole !== 'md' && record.branch_id !== adminBranchId) {
      throw new ForbiddenError('You can only correct attendance records in your branch');
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

    // Bust cache
    const dateStr = record.date instanceof Date
      ? record.date.toISOString().split('T')[0]
      : record.date;
    await redis.del(`att:${record.user_id}:${dateStr}`);

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

    if (requesterRole === 'branch_admin') {
      const branchUsers = await db.query(
        'SELECT id FROM users WHERE branch_id = $1',
        [requesterBranchId]
      );
      scopeUserIds = branchUsers.rows.map((row: any) => row.id);
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

    if (requesterRole === 'branch_admin') {
      const branchUsers = await db.query(
        'SELECT id FROM users WHERE branch_id = $1 AND is_active = true',
        [requesterBranchId]
      );
      scopeUserIds = branchUsers.rows.map((row: any) => row.id);
    } else {
      scopeUserIds = await getSubtreeIds(requesterId);
    }

    // Fetch only non-MD active users inside the subtree or branch scope
    const filterResult = await db.query(
      `SELECT id FROM users 
       WHERE id = ANY($1) 
       AND role != 'md' 
       AND is_active = true`,
      [scopeUserIds]
    );

    const filteredIds = filterResult.rows.map(r => r.id);
    const totalEmployees = filteredIds.length;

    const result = await db.query(
      `SELECT status, mode, COUNT(*)::int AS count
       FROM attendance
       WHERE user_id = ANY($1) AND date = $2
       GROUP BY status, mode`,
      [filteredIds, date]
    );

    let present = 0;
    let absent = 0;
    let halfDay = 0;
    let field = 0;
    let office = 0;
    let totalMarked = 0;

    for (const row of result.rows) {
      totalMarked += row.count;
      if (row.status === 'present') present += row.count;
      if (row.status === 'absent') absent += row.count;
      if (row.status === 'half_day') halfDay += row.count;
      if (row.mode === 'field') field += row.count;
      if (row.mode === 'office') office += row.count;
    }

    // For non-admin employees, fetch their own today record from DB or Redis queue key (worker may not have written yet)
    let today: any = null;
    if (requesterRole !== 'branch_admin') {
      const todayResult = await db.query(
        `SELECT id, status, mode, check_in_time, field_note, check_in_lat, check_in_lng
         FROM attendance
         WHERE user_id = $1 AND date = $2`,
        [requesterId, date]
      );
      if (todayResult.rows.length > 0) {
        today = todayResult.rows[0];
      } else {
        // Fallback: if Redis dedupe key exists, the job is queued but not yet persisted
        const queued = await redis.exists(`att:${requesterId}:${date}`);
        if (queued) {
          today = { status: 'present', mode: 'pending', queued: true };
        }
      }
    }

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
    };
  },

  // ─── BRANCH EMPLOYEES (Admin Dashboard) ───
  
  async getBranchEmployees(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    branchId: string | null
  ): Promise<any[]> {
    const todayStr = new Date().toISOString().split('T')[0];

    // Build the query starting from a base
    let query = `
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
      LEFT JOIN attendance a
        ON a.user_id = u.id AND a.date = $1
      LEFT JOIN branches b
        ON u.branch_id = b.id
      WHERE u.is_active = true
    `;
    const params: any[] = [todayStr];

    // Scoping Logic:
    // 1. If requester is a Branch Admin, they MUST be restricted to their branch.
    // 2. If requester is MD/GM and provided a branchId, filter by it.
    // 3. If requester is MD/GM and branchId is null, show all subordinates (global view).
    
    if (requesterRole === 'branch_admin') {
      // Strict branch scoping for branch admins
      query += ` AND u.branch_id = $2`;
      params.push(branchId);
    } else if (branchId) {
      // Filtered view for MD/GM
      query += ` AND u.branch_id = $2`;
      params.push(branchId);
    } else {
      // GLOBAL VIEW for MD/GM: show everyone except them potentially, or just everyone
      // For peak performance, the MD sees all employees in branches
      query += ` AND u.role != 'md' AND u.branch_id IS NOT NULL`;
    }

    query += `
      ORDER BY
        CASE WHEN a.id IS NULL THEN 0 ELSE 1 END,
        u.name ASC
    `;

    const result = await db.query(query, params);
    return result.rows;
  },

  // ─── S3 PRESIGNED URL ───
  
  async getPresignedUploadUrl(userId: string): Promise<{ uploadUrl: string; photoKey: string; expiresIn: number }> {
    const photoKey = generatePhotoKey(userId);
    const uploadUrl = await generateUploadUrl(photoKey);
    return { uploadUrl, photoKey, expiresIn: 300 };
  },

  // ─── SMARTPHONE ACCESS ───
  
  async updateSmartphoneStatus(
    db: Pool,
    redis: Redis,
    adminId: string,
    adminBranchId: string,
    targetUserId: string,
    hasSmartphone: boolean
  ): Promise<{ success: boolean }> {
    const userResult = await db.query(
      'SELECT id, branch_id FROM users WHERE id = $1 AND is_active = true',
      [targetUserId]
    );

    if (userResult.rows.length === 0) {
      throw new NotFoundError('Employee not found');
    }

    const user = userResult.rows[0];

    if (user.branch_id !== adminBranchId) {
      throw new ForbiddenError('You can only manage employees in your branch');
    }

    await db.query(
      'UPDATE users SET has_smartphone = $1 WHERE id = $2',
      [hasSmartphone, targetUserId]
    );

    if (hasSmartphone) {
      const today = new Date().toISOString().split('T')[0];
      await redis.del(`att:${targetUserId}:${today}`);
    }

    return { success: true };
  },
};
