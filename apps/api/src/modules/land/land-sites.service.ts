// Sites + Plots — MD-only create/update operations.
//
// All financial values (land_cost, buyback_bonus_monthly) can only be set and edited
// by the MD. Every change is logged to land_audit_log with old/new value snapshots.

import { Pool } from 'pg';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { LandAuditService } from './land-audit.service';
import type {
  CreateLandSiteInput, UpdateLandSiteInput, ListSitesQuery,
  CreateLandPlotInput, UpdateLandPlotInput, ListPlotsQuery,
} from './land.schema';

export const LandSitesService = {

  // ─── LIST SITES ─────────────────────────────────────────────────────────────
  async listSites(db: Pool, query: ListSitesQuery): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;

    if (query.status) {
      where += ` AND s.status = $${idx++}`;
      params.push(query.status);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM land_sites s WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         s.*,
         u.name AS created_by_name,
         COUNT(p.id)::int                                          AS total_plots,
         COUNT(p.id) FILTER (WHERE p.status = 'available')::int   AS available_plots,
         COUNT(p.id) FILTER (WHERE p.status = 'booked')::int      AS booked_plots,
         COUNT(p.id) FILTER (WHERE p.status = 'completed')::int   AS completed_plots
       FROM land_sites s
       LEFT JOIN land_plots p ON p.site_id = s.id
       JOIN users u ON u.id = s.created_by
       WHERE ${where}
       GROUP BY s.id, u.name
       ORDER BY s.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET SITE ───────────────────────────────────────────────────────────────
  async getSite(db: Pool, siteId: string): Promise<any> {
    const siteResult = await db.query(
      `SELECT s.*, u.name AS created_by_name
       FROM land_sites s
       JOIN users u ON u.id = s.created_by
       WHERE s.id = $1`,
      [siteId]
    );
    if (siteResult.rows.length === 0) throw new NotFoundError('Site not found');

    const plotsResult = await db.query(
      `SELECT p.*, u.name AS created_by_name
       FROM land_plots p
       JOIN users u ON u.id = p.created_by
       WHERE p.site_id = $1
       ORDER BY p.created_at ASC`,
      [siteId]
    );

    return { ...siteResult.rows[0], plots: plotsResult.rows };
  },

  // ─── CREATE SITE ────────────────────────────────────────────────────────────
  async createSite(db: Pool, userId: string, payload: CreateLandSiteInput): Promise<any> {
    const result = await db.query(
      `INSERT INTO land_sites
         (name, layout_name, location, address, state, loan_enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        payload.name.trim(),
        payload.layoutName?.trim() || null,
        payload.location?.trim() || null,
        payload.address?.trim() || null,
        payload.state?.trim() || null,
        payload.loanEnabled,
        userId,
      ]
    );
    const site = result.rows[0];

    await LandAuditService.log(db, {
      entity:    'site',
      recordId:  site.id,
      action:    'create',
      changedBy: userId,
      newValues: { name: site.name, loan_enabled: site.loan_enabled, status: site.status },
    });

    return site;
  },

  // ─── UPDATE SITE ────────────────────────────────────────────────────────────
  async updateSite(
    db: Pool, userId: string, siteId: string, payload: UpdateLandSiteInput
  ): Promise<any> {
    const existing = await db.query(
      `SELECT * FROM land_sites WHERE id = $1`,
      [siteId]
    );
    if (existing.rows.length === 0) throw new NotFoundError('Site not found');
    const old = existing.rows[0];

    const fields: string[]  = [];
    const values: any[] = [];
    let idx = 1;

    if (payload.name         !== undefined) { fields.push(`name = $${idx++}`);          values.push(payload.name.trim()); }
    if (payload.layoutName   !== undefined) { fields.push(`layout_name = $${idx++}`);   values.push(payload.layoutName?.trim() || null); }
    if (payload.location     !== undefined) { fields.push(`location = $${idx++}`);      values.push(payload.location?.trim() || null); }
    if (payload.address      !== undefined) { fields.push(`address = $${idx++}`);       values.push(payload.address?.trim() || null); }
    if (payload.state        !== undefined) { fields.push(`state = $${idx++}`);         values.push(payload.state?.trim() || null); }
    if (payload.loanEnabled  !== undefined) { fields.push(`loan_enabled = $${idx++}`);  values.push(payload.loanEnabled); }
    if (payload.status       !== undefined) { fields.push(`status = $${idx++}`);        values.push(payload.status); }

    if (fields.length === 0) return old;

    fields.push(`updated_by = $${idx++}`, `updated_at = now()`);
    values.push(userId, siteId);

    const result = await db.query(
      `UPDATE land_sites SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const updated = result.rows[0];

    await LandAuditService.log(db, {
      entity:    'site',
      recordId:  siteId,
      action:    'update',
      changedBy: userId,
      oldValues: { name: old.name, loan_enabled: old.loan_enabled, status: old.status },
      newValues: { name: updated.name, loan_enabled: updated.loan_enabled, status: updated.status },
    });

    return updated;
  },

  // ─── LIST PLOTS ─────────────────────────────────────────────────────────────
  async listPlots(db: Pool, siteId: string | null, query: ListPlotsQuery): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;

    if (siteId) {
      where += ` AND p.site_id = $${idx++}`;
      params.push(siteId);
    }
    if (query.status) {
      where += ` AND p.status = $${idx++}`;
      params.push(query.status);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM land_plots p WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT p.*, s.name AS site_name, s.layout_name, s.loan_enabled
       FROM land_plots p
       JOIN land_sites s ON s.id = p.site_id
       WHERE ${where}
       ORDER BY p.created_at ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── CREATE PLOT ────────────────────────────────────────────────────────────
  async createPlot(
    db: Pool, userId: string, siteId: string, payload: CreateLandPlotInput
  ): Promise<any> {
    // Verify site exists
    const siteCheck = await db.query(
      `SELECT id, name FROM land_sites WHERE id = $1`,
      [siteId]
    );
    if (siteCheck.rows.length === 0) throw new NotFoundError('Site not found');

    let result: any;
    try {
      result = await db.query(
        `INSERT INTO land_plots
           (site_id, site_number, area_sqft, land_cost, buyback_bonus_monthly, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [siteId, payload.siteNumber.trim(), payload.areaSqft, payload.landCost, payload.buybackBonusMonthly, userId]
      );
    } catch (err: any) {
      if (err.code === '23505') {
        throw new ConflictError(`Site number "${payload.siteNumber}" already exists in this site`);
      }
      throw err;
    }
    const plot = result.rows[0];

    await LandAuditService.log(db, {
      entity:    'plot',
      recordId:  plot.id,
      action:    'create',
      changedBy: userId,
      newValues: {
        site_id: siteId, site_number: plot.site_number,
        land_cost: plot.land_cost, buyback_bonus_monthly: plot.buyback_bonus_monthly,
      },
    });

    return plot;
  },

  // ─── UPDATE PLOT ────────────────────────────────────────────────────────────
  async updatePlot(
    db: Pool, userId: string, plotId: string, payload: UpdateLandPlotInput
  ): Promise<any> {
    const existing = await db.query(
      `SELECT * FROM land_plots WHERE id = $1`,
      [plotId]
    );
    if (existing.rows.length === 0) throw new NotFoundError('Plot not found');
    const old = existing.rows[0];

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (payload.areaSqft            !== undefined) { fields.push(`area_sqft = $${idx++}`);              values.push(payload.areaSqft); }
    if (payload.landCost            !== undefined) { fields.push(`land_cost = $${idx++}`);               values.push(payload.landCost); }
    if (payload.buybackBonusMonthly !== undefined) { fields.push(`buyback_bonus_monthly = $${idx++}`);   values.push(payload.buybackBonusMonthly); }
    if (payload.status              !== undefined) { fields.push(`status = $${idx++}`);                  values.push(payload.status); }

    if (fields.length === 0) return old;

    fields.push(`updated_by = $${idx++}`, `updated_at = now()`);
    values.push(userId, plotId);

    const result = await db.query(
      `UPDATE land_plots SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    const updated = result.rows[0];

    await LandAuditService.log(db, {
      entity:    'plot',
      recordId:  plotId,
      action:    'update',
      changedBy: userId,
      oldValues: { land_cost: old.land_cost, buyback_bonus_monthly: old.buyback_bonus_monthly, status: old.status },
      newValues: { land_cost: updated.land_cost, buyback_bonus_monthly: updated.buyback_bonus_monthly, status: updated.status },
    });

    return updated;
  },
};
