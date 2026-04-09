import { Pool } from 'pg';
import { generateUploadUrl, generateDownloadUrl } from '../../config/s3';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '../../shared/errors';
import type {
  CreateProjectInput,
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

  async getProjects(db: Pool): Promise<any[]> {
    const result = await db.query(
      'SELECT * FROM projects WHERE is_active = true ORDER BY name ASC'
    );
    return result.rows;
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

    // 1. Get totals for summary cards (Pending vs Approved etc.)
    const totalsSql = `
      SELECT 
        SUM(CASE WHEN m.status = 'pending' THEN m.amount ELSE 0 END) as pending_total,
        SUM(CASE WHEN m.status = 'approved' THEN m.amount ELSE 0 END) as approved_total,
        SUM(CASE WHEN m.status = 'rejected' THEN m.amount ELSE 0 END) as rejected_total
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
  }
};
