import { Pool } from 'pg';
import { generateUploadUrl, generateDownloadUrl } from '../../config/s3';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import type {
  CreateProjectInput,
  UpdateProjectInput,
  SubmitCollectionInput,
  VerifyCollectionInput,
  GetCollectionsQuery,
  TransferCashInput,
} from './money.schema';

export const MoneyService = {
  // ─── PROJECTS ───

  async createProject(db: Pool, name: string): Promise<any> {
    try {
      const result = await db.query(
        'INSERT INTO projects (name) VALUES ($1) RETURNING *',
        [name]
      );
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') { // unique violation
        throw new ConflictError('A project with this name already exists');
      }
      throw error;
    }
  },

  async getProjects(db: Pool, includeInactive: boolean = false): Promise<any[]> {
    const whereClause = includeInactive ? '' : 'WHERE is_active = true';
    const result = await db.query(
      `SELECT * FROM projects ${whereClause} ORDER BY name ASC`
    );
    return result.rows;
  },

  async updateProject(db: Pool, id: string, payload: UpdateProjectInput): Promise<any> {
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (payload.name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(payload.name);
      paramIndex++;
    }

    if (payload.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(payload.isActive);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new ValidationError('No updates provided');
    }

    params.push(id);
    const query = `
      UPDATE projects 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING *
    `;

    try {
      const result = await db.query(query, params);
      if (result.rows.length === 0) {
        throw new NotFoundError('Project not found');
      }
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') {
        throw new ConflictError('A project with this name already exists');
      }
      throw error;
    }
  },

  // ─── COLLECTIONS ───

  async submitCollection(
    db: Pool,
    userId: string,
    payload: SubmitCollectionInput
  ): Promise<any> {
    // Determine assigned_verifier_id
    let assignedVerifierId: string;

    if (payload.mode === 'cash') {
      // Must be provided in the payload and exist
      if (!payload.handedOverTo) {
        throw new ValidationError('handedOverTo is required for cash');
      }
      const targetResult = await db.query('SELECT id FROM users WHERE id = $1 AND is_active = true', [payload.handedOverTo]);
      if (targetResult.rows.length === 0) {
        throw new NotFoundError('Selected receiver not found');
      }
      assignedVerifierId = payload.handedOverTo;
    } else {
      // mode is gpay or bank_receipt -> direct manager
      const userResult = await db.query('SELECT manager_id, role FROM users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) throw new NotFoundError('User not found');
      
      const { manager_id, role } = userResult.rows[0];
      if (!manager_id) {
        if (role === 'md') {
          // MD doesn't have a manager, they can self-verify or we can just set it to their own ID
          assignedVerifierId = userId;
        } else {
          throw new ConflictError('You do not have a direct manager assigned to verify this transaction.');
        }
      } else {
        assignedVerifierId = manager_id;
      }
    }

    // Insert collection
    const result = await db.query(
      `INSERT INTO money_collections (
        user_id, project_id, amount, mode, client_name, client_phone, photo_key, assigned_verifier_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        userId,
        payload.projectId,
        payload.amount,
        payload.mode,
        payload.clientName,
        payload.clientPhone,
        payload.photoKey || null,
        assignedVerifierId
      ]
    );

    return result.rows[0];
  },

  async verifyCollection(
    db: Pool,
    verifierId: string,
    verifierRole: string,
    collectionId: string,
    payload: VerifyCollectionInput
  ): Promise<any> {
    const recordResult = await db.query('SELECT * FROM money_collections WHERE id = $1', [collectionId]);
    if (recordResult.rows.length === 0) {
      throw new NotFoundError('Money collection record not found');
    }

    const record = recordResult.rows[0];

    // Privacy & Authorization check
    if (verifierRole !== 'md' && record.assigned_verifier_id !== verifierId) {
      throw new ForbiddenError('You do not have permission to verify this transaction');
    }

    if (record.status !== 'pending') {
      throw new ConflictError('This transaction has already been processed');
    }

    const result = await db.query(
      `UPDATE money_collections SET
        status = $1,
        rejection_note = $2,
        verified_at = NOW()
       WHERE id = $3 RETURNING *`,
      [payload.status, payload.rejectionNote || null, collectionId]
    );

    if (payload.status === 'rejected' && record.source_collection_ids && record.source_collection_ids.length > 0) {
      await db.query(
        'UPDATE money_collections SET is_forwarded = false WHERE id = ANY($1)',
        [record.source_collection_ids]
      );
    }

    return result.rows[0];
  },

  async getCollections(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    query: GetCollectionsQuery
  ): Promise<{ data: any[]; pagination: object; totals: object }> {
    const params: any[] = [];
    let paramIndex = 1;

    let whereClause = '1=1';

    // Strict privacy visibility
    if (requesterRole !== 'md') {
      whereClause += ` AND (m.user_id = $${paramIndex} OR m.assigned_verifier_id = $${paramIndex})`;
      params.push(requesterId);
      paramIndex++;
    }

    if (query.projectId) {
      whereClause += ` AND m.project_id = $${paramIndex}`;
      params.push(query.projectId);
      paramIndex++;
    }

    if (query.status) {
      whereClause += ` AND m.status = $${paramIndex}`;
      params.push(query.status);
      paramIndex++;
    }

    const sqlBase = `
      FROM money_collections m
      JOIN users u ON m.user_id = u.id
      JOIN projects p ON m.project_id = p.id
      LEFT JOIN users v ON m.assigned_verifier_id = v.id
      WHERE ${whereClause}
    `;

    // 1. Get totals for summary cards. Exclude cash_transfer — it is internal movement
    //    of money already counted when the original cash entry was submitted.
    const totalsSql = `
      SELECT
        SUM(CASE WHEN m.status = 'pending'  AND m.mode != 'cash_transfer' THEN m.amount ELSE 0 END) as pending_total,
        SUM(CASE WHEN m.status = 'approved' AND m.mode != 'cash_transfer' THEN m.amount ELSE 0 END) as approved_total,
        SUM(CASE WHEN m.status = 'rejected' AND m.mode != 'cash_transfer' THEN m.amount ELSE 0 END) as rejected_total
      ${sqlBase}
    `;
    const totalsResult = await db.query(totalsSql, params);
    const totals = {
      pending: parseFloat(totalsResult.rows[0].pending_total || '0'),
      approved: parseFloat(totalsResult.rows[0].approved_total || '0'),
      rejected: parseFloat(totalsResult.rows[0].rejected_total || '0')
    };

    // 2. Get pagination total count
    const countSql = `SELECT COUNT(*) ${sqlBase}`;
    const countResult = await db.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // 3. Get data rows
    const dataSql = `
      SELECT 
        m.*,
        p.name AS project_name,
        u.name AS submitter_name,
        u.profile_photo_key AS submitter_photo_key,
        u.role AS submitter_role,
        v.name AS verifier_name
      ${sqlBase}
      ORDER BY m.submitted_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const dataParams = [...params, query.limit, (query.page - 1) * query.limit];
    const dataResult = await db.query(dataSql, dataParams);

    return {
      data: dataResult.rows,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      totals
    };
  },

  // ─── S3 ATTACHMENTS ───
  async getPresignedUploadUrl(userId: string, mode: string, contentType: string = 'image/jpeg') {
    // Mode should be 'gpay' or 'bank_receipt'
    const cleanMode = (mode === 'gpay' || mode === 'bank_receipt') ? mode : 'misc';
    const photoKey = `money/${cleanMode}/${userId}/${Date.now()}.jpg`;
    const uploadUrl = await generateUploadUrl(photoKey, contentType);
    return { uploadUrl, photoKey };
  },

  async getPresignedDownloadUrl(photoKey: string) {
    if (!photoKey) return { url: null };
    const url = await generateDownloadUrl(photoKey);
    return { url };
  },

  // ─── CASH WALLET & TRACKING ───

  async getWallet(db: Pool, userId: string) {
    const query = `
      SELECT m.*, p.name AS project_name, u.name AS submitter_name
      FROM money_collections m
      JOIN projects p ON m.project_id = p.id
      JOIN users u ON m.user_id = u.id
      WHERE m.assigned_verifier_id = $1
        AND m.status = 'approved'
        AND m.is_forwarded = false
        AND (m.mode = 'cash' OR m.mode = 'cash_transfer')
      ORDER BY m.verified_at DESC
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  },

  async transferCash(
    db: Pool,
    userId: string,
    payload: TransferCashInput
  ) {
    // Begin transaction
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // 1. Validate the selected collections

      const collectionsResult = await client.query(`
        SELECT id, amount, project_id 
        FROM money_collections 
        WHERE assigned_verifier_id = $1 
          AND status = 'approved' 
          AND is_forwarded = false 
          AND (mode = 'cash' OR mode = 'cash_transfer')
          AND id = ANY($2::uuid[])
      `, [userId, payload.collectionIds]);

      if (collectionsResult.rows.length !== payload.collectionIds.length) {
        throw new ConflictError('Some collections are no longer available or do not belong to you');
      }

      // 2. Verify they all belong to the same project (optional but good practice)
      const projectId = collectionsResult.rows[0].project_id;
      const allSameProject = collectionsResult.rows.every(r => r.project_id === projectId);
      if (!allSameProject) {
        throw new ValidationError('All transferred collections must belong to the same project');
      }

      // 3. Calculate total amount
      const totalAmount = collectionsResult.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0);

      // 4. Verify target user
      const targetResult = await client.query('SELECT id FROM users WHERE id = $1 AND is_active = true', [payload.targetUserId]);
      if (targetResult.rows.length === 0) {
        throw new NotFoundError('Selected receiver not found');
      }

      // 5. Create new cash_transfer collection
      const createResult = await client.query(`
        INSERT INTO money_collections (
          user_id, project_id, amount, mode, assigned_verifier_id, source_collection_ids, client_name, client_phone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
      `, [
        userId, 
        projectId, 
        totalAmount, 
        'cash_transfer', 
        payload.targetUserId, 
        payload.collectionIds,
        'Grouped Transfer', // dummy client info
        'N/A'
      ]);

      const newCollection = createResult.rows[0];

      // 6. Mark originals as forwarded
      await client.query(`
        UPDATE money_collections SET is_forwarded = true WHERE id = ANY($1::uuid[])
      `, [payload.collectionIds]);

      await client.query('COMMIT');
      return newCollection;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  async getTransferSources(db: Pool, transferId: string) {
    const transferResult = await db.query('SELECT source_collection_ids FROM money_collections WHERE id = $1', [transferId]);
    if (transferResult.rows.length === 0) throw new NotFoundError('Transfer not found');

    const sourceIds = transferResult.rows[0].source_collection_ids;
    if (!sourceIds || sourceIds.length === 0) return [];

    const result = await db.query(`
      SELECT m.*, u.name AS submitter_name, p.name AS project_name
      FROM money_collections m
      JOIN users u ON m.user_id = u.id
      JOIN projects p ON m.project_id = p.id
      WHERE m.id = ANY($1::uuid[])
    `, [sourceIds]);
    return result.rows;
  },

  // ─── ADMIN OVERVIEW ───

  // Resolves the branch IDs in scope for an admin user.
  // Returns null for MD (all branches), array for everyone else.
  async _resolveScopedBranchIds(
    db: Pool,
    userId: string,
    role: string,
    branchId: string | null
  ): Promise<string[] | null> {
    if (role === 'md') return null;

    if (role === 'director' || role === 'gm') {
      const r = await db.query(
        `SELECT branch_id FROM user_oversight_branches WHERE user_id = $1`,
        [userId]
      );
      return r.rows.map((row: any) => row.branch_id);
    }

    if (role === 'branch_manager' || role === 'branch_admin') {
      if (!branchId) throw new ForbiddenError('No branch assigned');
      return [branchId];
    }

    throw new ForbiddenError('You do not have access to the admin overview');
  },

  async getAdminOverview(
    db: Pool,
    userId: string,
    role: string,
    branchId: string | null,
    stuckDays: number = 3
  ): Promise<any> {
    const isMd = role === 'md';
    // Null means all branches (MD); array means scoped branches
    const scopedBranchIds = await this._resolveScopedBranchIds(db, userId, role, branchId);

    // Build a reusable WHERE clause fragment for scoping by submitter's branch
    const branchFilter = scopedBranchIds !== null
      ? `AND u.branch_id = ANY($1::uuid[])`
      : '';
    const branchParams: any[] = scopedBranchIds !== null ? [scopedBranchIds] : [];

    // 1. Global flow totals.
    //    Exclude cash_transfer — it is internal movement of money already counted
    //    when the original cash entry was submitted. Counting it again would double
    //    the same funds every time someone passes cash up the chain.
    const totalsResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN mc.status != 'rejected' AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS collected,
        COALESCE(SUM(CASE WHEN mc.status = 'approved'  AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS verified,
        COALESCE(SUM(CASE WHEN mc.status = 'pending'   AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN mc.status = 'rejected'  AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS rejected,
        COALESCE(SUM(CASE WHEN mc.mode = 'gpay'         AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS gpay,
        COALESCE(SUM(CASE WHEN mc.mode = 'bank_receipt' AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS bank_receipt,
        COALESCE(SUM(CASE WHEN mc.mode = 'cash'         AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS cash
      FROM money_collections mc
      JOIN users u ON mc.user_id = u.id
      WHERE 1=1 ${branchFilter}
    `, branchParams);

    const totals = {
      collected:    parseFloat(totalsResult.rows[0].collected),
      verified:     parseFloat(totalsResult.rows[0].verified),
      pending:      parseFloat(totalsResult.rows[0].pending),
      rejected:     parseFloat(totalsResult.rows[0].rejected),
      byMode: {
        gpay:        parseFloat(totalsResult.rows[0].gpay),
        bankReceipt: parseFloat(totalsResult.rows[0].bank_receipt),
        cash:        parseFloat(totalsResult.rows[0].cash),
      },
    };

    // 2. Cash on hand total (MD-only)
    let cashOnHand: number | undefined;
    if (isMd) {
      const cohResult = await db.query(`
        SELECT COALESCE(SUM(amount), 0) AS cash_on_hand
        FROM money_collections
        WHERE status = 'approved'
          AND is_forwarded = false
          AND mode IN ('cash', 'cash_transfer')
      `);
      cashOnHand = parseFloat(cohResult.rows[0].cash_on_hand);
    }

    // 3. Stuck cash list (MD-only) — approved cash held longer than stuckDays
    let stuckCash: any[] | undefined;
    if (isMd) {
      const stuckResult = await db.query(`
        SELECT
          mc.id, mc.amount, mc.mode, mc.verified_at,
          holder.name  AS holder_name,
          holder.role  AS holder_role,
          b.id         AS branch_id,
          b.name       AS branch_name
        FROM money_collections mc
        JOIN users holder ON mc.assigned_verifier_id = holder.id
        LEFT JOIN branches b ON holder.branch_id = b.id
        WHERE mc.status = 'approved'
          AND mc.is_forwarded = false
          AND mc.mode IN ('cash', 'cash_transfer')
          AND mc.verified_at < NOW() - ($1 || ' days')::interval
        ORDER BY mc.verified_at ASC
        LIMIT 20
      `, [stuckDays]);
      stuckCash = stuckResult.rows;
    }

    // 4. Per-branch flow stats — same cash_transfer exclusion as global totals.
    const byBranchResult = await db.query(`
      SELECT
        b.id   AS branch_id,
        b.name AS branch_name,
        COALESCE(SUM(CASE WHEN mc.status != 'rejected' AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS collected,
        COALESCE(SUM(CASE WHEN mc.status = 'approved'  AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS verified,
        COALESCE(SUM(CASE WHEN mc.status = 'pending'   AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN mc.status = 'rejected'  AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS rejected,
        COALESCE(SUM(CASE WHEN mc.mode = 'gpay'         AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS gpay,
        COALESCE(SUM(CASE WHEN mc.mode = 'bank_receipt' AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS bank_receipt,
        COALESCE(SUM(CASE WHEN mc.mode = 'cash'         AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS cash
      FROM branches b
      LEFT JOIN users u ON u.branch_id = b.id AND u.is_active = true
      LEFT JOIN money_collections mc ON mc.user_id = u.id
      WHERE 1=1 ${scopedBranchIds !== null ? 'AND b.id = ANY($1::uuid[])' : ''}
      GROUP BY b.id, b.name
      ORDER BY verified DESC NULLS LAST
    `, branchParams);

    let byBranch: any[] = byBranchResult.rows.map((r: any) => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      collected:  parseFloat(r.collected),
      verified:   parseFloat(r.verified),
      pending:    parseFloat(r.pending),
      rejected:   parseFloat(r.rejected),
      byMode: {
        gpay:        parseFloat(r.gpay),
        bankReceipt: parseFloat(r.bank_receipt),
        cash:        parseFloat(r.cash),
      },
    }));

    // 5. Cash on hand per branch (MD-only) — keyed by holder's branch
    if (isMd) {
      const cohBranchResult = await db.query(`
        SELECT holder.branch_id, COALESCE(SUM(mc.amount), 0) AS cash_on_hand
        FROM money_collections mc
        JOIN users holder ON mc.assigned_verifier_id = holder.id
        WHERE mc.status = 'approved'
          AND mc.is_forwarded = false
          AND mc.mode IN ('cash', 'cash_transfer')
        GROUP BY holder.branch_id
      `);
      const cohMap: Record<string, number> = {};
      for (const row of cohBranchResult.rows) {
        cohMap[row.branch_id] = parseFloat(row.cash_on_hand);
      }
      byBranch = byBranch.map(b => ({ ...b, cashOnHand: cohMap[b.branchId] ?? 0 }));
    }

    // 6. Org-wide cash holders list (MD-only) — everyone currently holding cash
    let holders: any[] | undefined;
    if (isMd) {
      const holdersResult = await db.query(`
        SELECT
          u.id, u.name, u.role,
          b.name AS branch_name,
          COALESCE(SUM(mc.amount), 0) AS amount_held
        FROM users u
        JOIN money_collections mc ON mc.assigned_verifier_id = u.id
        LEFT JOIN branches b ON u.branch_id = b.id
        WHERE mc.status = 'approved'
          AND mc.is_forwarded = false
          AND mc.mode IN ('cash', 'cash_transfer')
        GROUP BY u.id, u.name, u.role, b.name
        ORDER BY amount_held DESC
      `);
      holders = holdersResult.rows;
    }

    return {
      totals,
      ...(isMd && { cashOnHand, stuckCash, holders }),
      byBranch,
    };
  },

  async getBranchDrilldown(
    db: Pool,
    targetBranchId: string,
    requesterId: string,
    role: string,
    requesterBranchId: string | null
  ): Promise<any> {
    const isMd = role === 'md';

    // Non-MD admins: enforce branch scope
    if (!isMd) {
      const scopedIds = await this._resolveScopedBranchIds(db, requesterId, role, requesterBranchId);
      if (!scopedIds || !scopedIds.includes(targetBranchId)) {
        throw new ForbiddenError('You do not have access to this branch');
      }
    }

    // Flow totals for this branch — exclude cash_transfer to avoid double-counting.
    const totalsResult = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN mc.status != 'rejected' AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS collected,
        COALESCE(SUM(CASE WHEN mc.status = 'approved'  AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS verified,
        COALESCE(SUM(CASE WHEN mc.status = 'pending'   AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN mc.status = 'rejected'  AND mc.mode != 'cash_transfer' THEN mc.amount ELSE 0 END), 0) AS rejected,
        COALESCE(SUM(CASE WHEN mc.mode = 'gpay'         AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS gpay,
        COALESCE(SUM(CASE WHEN mc.mode = 'bank_receipt' AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS bank_receipt,
        COALESCE(SUM(CASE WHEN mc.mode = 'cash'         AND mc.status != 'rejected'   THEN mc.amount ELSE 0 END), 0) AS cash
      FROM money_collections mc
      JOIN users u ON mc.user_id = u.id
      WHERE u.branch_id = $1
    `, [targetBranchId]);

    const totals = {
      collected:    parseFloat(totalsResult.rows[0].collected),
      verified:     parseFloat(totalsResult.rows[0].verified),
      pending:      parseFloat(totalsResult.rows[0].pending),
      rejected:     parseFloat(totalsResult.rows[0].rejected),
      byMode: {
        gpay:        parseFloat(totalsResult.rows[0].gpay),
        bankReceipt: parseFloat(totalsResult.rows[0].bank_receipt),
        cash:        parseFloat(totalsResult.rows[0].cash),
      },
    };

    // Top collectors — exclude cash_transfer (internal movements, not client collections).
    const topResult = await db.query(`
      SELECT u.id, u.name, u.role,
        COALESCE(SUM(mc.amount), 0) AS total_collected
      FROM users u
      JOIN money_collections mc ON mc.user_id = u.id
      WHERE u.branch_id = $1
        AND mc.status != 'rejected'
        AND mc.mode  != 'cash_transfer'
      GROUP BY u.id, u.name, u.role
      ORDER BY total_collected DESC
      LIMIT 5
    `, [targetBranchId]);

    // Project split — exclude cash_transfer for the same reason.
    const projectResult = await db.query(`
      SELECT p.id, p.name,
        COALESCE(SUM(mc.amount), 0) AS total_amount
      FROM projects p
      JOIN money_collections mc ON mc.project_id = p.id
      JOIN users u ON mc.user_id = u.id
      WHERE u.branch_id = $1
        AND mc.status != 'rejected'
        AND mc.mode  != 'cash_transfer'
      GROUP BY p.id, p.name
      ORDER BY total_amount DESC
    `, [targetBranchId]);

    // Current cash holders inside this branch (MD-only)
    let holders: any[] | undefined;
    if (isMd) {
      const holdersResult = await db.query(`
        SELECT u.id, u.name, u.role,
          COALESCE(SUM(mc.amount), 0) AS amount_held
        FROM users u
        JOIN money_collections mc ON mc.assigned_verifier_id = u.id
        WHERE u.branch_id = $1
          AND mc.status = 'approved'
          AND mc.is_forwarded = false
          AND mc.mode IN ('cash', 'cash_transfer')
        GROUP BY u.id, u.name, u.role
        ORDER BY amount_held DESC
      `, [targetBranchId]);
      holders = holdersResult.rows;
    }

    // Recent collections for this branch including photo_key so MD can view proofs
    let collections: any[] | undefined;
    if (isMd) {
      const colResult = await db.query(`
        SELECT
          mc.id, mc.amount, mc.mode, mc.status, mc.photo_key,
          mc.client_name, mc.client_phone, mc.submitted_at, mc.verified_at,
          mc.rejection_note,
          u.name  AS submitter_name,
          u.role  AS submitter_role,
          p.name  AS project_name,
          v.name  AS verifier_name
        FROM money_collections mc
        JOIN users u ON mc.user_id = u.id
        JOIN projects p ON mc.project_id = p.id
        LEFT JOIN users v ON mc.assigned_verifier_id = v.id
        WHERE u.branch_id = $1
        ORDER BY mc.submitted_at DESC
        LIMIT 30
      `, [targetBranchId]);
      collections = colResult.rows;
    }

    return {
      totals,
      topCollectors: topResult.rows,
      projectSplit:  projectResult.rows,
      ...(isMd && { holders, collections }),
    };
  },
};
