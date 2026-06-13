// Sites, Layouts + Plots — Management-ONLY create/update operations.
// (MD can read but only Management configures land scheme data.)
//
// Hierarchy:
//   land_sites   — geographic location (Tirupathi, Nellore…)
//     land_layouts — a specific development within that site
//                    (Hare Rama Layout, SR Grand City 2…)
//                    Each layout owns its plot pricing, buyback schedule,
//                    incentive_type, and commission rules.
//       land_plots — individual sellable plot units (Plot 81A, Plot 2B…)
//
// Branch Admins create BOOKINGS (land_bookings) — they never touch sites/layouts/plots.

import { Pool } from 'pg';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { LandAuditService } from './land-audit.service';
import { LandIncentivesService } from './land-incentives.service';
import type {
  CreateLandSiteInput, UpdateLandSiteInput, ListSitesQuery,
  CreateLandLayoutInput, UpdateLandLayoutInput,
  CreateLandPlotInput, UpdateLandPlotInput, ListPlotsQuery,
} from './land.schema';

export const LandSitesService = {

  // ─── LIST SITES ─────────────────────────────────────────────────────────────
  async listSites(db: Pool, query: ListSitesQuery): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;
    if (query.status) { where += ` AND s.status = $${idx++}`; params.push(query.status); }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM land_sites s WHERE ${where}`, params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         s.*,
         u.name  AS created_by_name,
         COUNT(DISTINCT ll.id)::int   AS layout_count,
         COUNT(DISTINCT lp.id)::int   AS total_plots,
         COUNT(DISTINCT lp.id) FILTER (WHERE lp.status = 'available')::int AS available_plots
       FROM land_sites s
       JOIN users u         ON u.id = s.created_by
       LEFT JOIN land_layouts ll ON ll.site_id = s.id
       LEFT JOIN land_plots  lp ON lp.layout_id = ll.id
       WHERE ${where}
       GROUP BY s.id, u.name
       ORDER BY s.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );
    return { data: dataResult.rows, total };
  },

  // ─── GET SITE (with its layouts + plots per layout) ──────────────────────────
  // Uses json_agg to embed individual plots inside each layout row in a single
  // round-trip. This is what populates layout.plots in LandSiteDetailPage →
  // LayoutCard so Management can see what plots already exist before adding more.
  async getSite(db: Pool, siteId: string): Promise<any> {
    const siteResult = await db.query(
      `SELECT s.*, u.name AS created_by_name
       FROM land_sites s
       JOIN users u ON u.id = s.created_by
       WHERE s.id = $1`,
      [siteId]
    );
    if (siteResult.rows.length === 0) throw new NotFoundError('Site not found');

    // Embed plots directly into each layout row using json_agg so the frontend
    // can render existing plots without a separate per-layout API call.
    // FILTER (WHERE lp.id IS NOT NULL) avoids a single null row when no plots exist.
    const layoutsResult = await db.query(
      `SELECT ll.*,
              u.name AS created_by_name,
              COUNT(lp.id)::int                                        AS total_plots,
              COUNT(lp.id) FILTER (WHERE lp.status = 'available')::int AS available_plots,
              COUNT(lp.id) FILTER (WHERE lp.status = 'booked')::int    AS booked_plots,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',                    lp.id,
                    'site_number',           lp.site_number,
                    'area_sqft',             lp.area_sqft,
                    'land_cost',             lp.land_cost,
                    'buyback_bonus_monthly', ll.buyback_bonus_monthly,
                    'status',                lp.status,
                    'created_at',            lp.created_at
                  ) ORDER BY lp.site_number ASC
                ) FILTER (WHERE lp.id IS NOT NULL),
                '[]'::json
              ) AS plots
       FROM land_layouts ll
       JOIN users u      ON u.id = ll.created_by
       LEFT JOIN land_plots lp ON lp.layout_id = ll.id
       WHERE ll.site_id = $1
       GROUP BY ll.id, u.name
       ORDER BY ll.created_at ASC`,
      [siteId]
    );
    return { ...siteResult.rows[0], layouts: layoutsResult.rows };
  },

  // ─── CREATE SITE ────────────────────────────────────────────────────────────
  // Creates only the geographic label. No commission rules or pricing here —
  // those belong on layouts. After creating a site Management navigates to
  // add a layout via POST /land/sites/:siteId/layouts.
  async createSite(db: Pool, userId: string, payload: CreateLandSiteInput): Promise<any> {
    const result = await db.query(
      `INSERT INTO land_sites (name, location, address, state, loan_enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        payload.name.trim(),
        payload.location?.trim() || null,
        payload.address?.trim()  || null,
        payload.state?.trim()    || null,
        payload.loanEnabled,
        userId,
      ]
    );
    const site = result.rows[0];
    await LandAuditService.log(db, {
      entity: 'site', recordId: site.id, action: 'create', changedBy: userId,
      newValues: { name: site.name, status: site.status },
    });
    return site;
  },

  // ─── UPDATE SITE ────────────────────────────────────────────────────────────
  async updateSite(db: Pool, userId: string, siteId: string, payload: UpdateLandSiteInput): Promise<any> {
    const existing = await db.query(`SELECT * FROM land_sites WHERE id = $1`, [siteId]);
    if (existing.rows.length === 0) throw new NotFoundError('Site not found');
    const old = existing.rows[0];

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (payload.name        !== undefined) { fields.push(`name = $${idx++}`);        values.push(payload.name.trim()); }
    if (payload.location    !== undefined) { fields.push(`location = $${idx++}`);    values.push(payload.location?.trim() || null); }
    if (payload.address     !== undefined) { fields.push(`address = $${idx++}`);     values.push(payload.address?.trim() || null); }
    if (payload.state       !== undefined) { fields.push(`state = $${idx++}`);       values.push(payload.state?.trim() || null); }
    if (payload.loanEnabled !== undefined) { fields.push(`loan_enabled = $${idx++}`);values.push(payload.loanEnabled); }
    if (payload.status      !== undefined) { fields.push(`status = $${idx++}`);      values.push(payload.status); }
    if (fields.length === 0) return old;

    fields.push(`updated_by = $${idx++}`, `updated_at = now()`);
    values.push(userId, siteId);
    const result = await db.query(
      `UPDATE land_sites SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    const updated = result.rows[0];
    await LandAuditService.log(db, {
      entity: 'site', recordId: siteId, action: 'update', changedBy: userId,
      oldValues: { name: old.name, status: old.status },
      newValues: { name: updated.name, status: updated.status },
    });
    return updated;
  },

  // ═══════════════════════════════════════════════════════════
  // LAYOUTS
  // ═══════════════════════════════════════════════════════════

  // ─── GET LAYOUT (with plots + commission rules) ──────────────────────────
  async getLayout(db: Pool, layoutId: string): Promise<any> {
    const layoutResult = await db.query(
      `SELECT ll.*, s.name AS site_name, u.name AS created_by_name
       FROM land_layouts ll
       JOIN land_sites s ON s.id = ll.site_id
       JOIN users u ON u.id = ll.created_by
       WHERE ll.id = $1`,
      [layoutId]
    );
    if (layoutResult.rows.length === 0) throw new NotFoundError('Layout not found');

    // ll.buyback_bonus_monthly is listed after p.* so node-pg's duplicate-column
    // resolution serves the layout's authoritative value, not the legacy plot column.
    const plotsResult = await db.query(
      `SELECT p.*, ll.buyback_bonus_monthly AS buyback_bonus_monthly, u.name AS created_by_name
       FROM land_plots p
       JOIN land_layouts ll ON ll.id = p.layout_id
       JOIN users u ON u.id = p.created_by
       WHERE p.layout_id = $1
       ORDER BY p.created_at ASC`,
      [layoutId]
    );

    const commissionRules = await LandIncentivesService.getRules(db, layoutId);

    return { ...layoutResult.rows[0], plots: plotsResult.rows, commissionRules };
  },

  // ─── CREATE LAYOUT ────────────────────────────────────────────────────────
  // The real configuration unit. Each layout carries:
  //   • Standard pricing (plot_price, plot_size_sqft, price_per_sqft)
  //   • Customer buyback schedule (buyback_bonus_monthly × buyback_months)
  //   • incentive_type: 'spot_only' vs 'spot_commission' (with monthly)
  //   • Commission rules auto-seeded at ₹0 for all 4 roles — Management
  //     then edits them via the commission rule endpoint or Control Center.
  // Called by POST /land/sites/:siteId/layouts (Management only).
  async createLayout(db: Pool, userId: string, siteId: string, payload: CreateLandLayoutInput): Promise<any> {
    const siteCheck = await db.query(`SELECT id FROM land_sites WHERE id = $1`, [siteId]);
    if (siteCheck.rows.length === 0) throw new NotFoundError('Site not found');

    const result = await db.query(
      `INSERT INTO land_layouts
         (site_id, layout_name, location_detail, plot_price, plot_size_sqft, price_per_sqft,
          buyback_bonus_monthly, buyback_months, incentive_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        siteId,
        payload.layoutName?.trim() || null,
        payload.locationDetail?.trim() || null,
        payload.plotPrice ?? null,
        payload.plotSizeSqft ?? null,
        payload.pricePerSqft ?? null,
        payload.buybackBonusMonthly ?? null,
        payload.buybackMonths ?? null,
        payload.incentiveType,
        userId,
      ]
    );
    const layout = result.rows[0];

    // Auto-seed 0-amount commission rules for each earner role
    await db.query(
      `INSERT INTO land_layout_commission_rules (layout_id, role)
       VALUES ($1,'sales_officer'),($1,'abm'),($1,'branch_manager'),($1,'gm')
       ON CONFLICT (layout_id, role) DO NOTHING`,
      [layout.id]
    );

    await LandAuditService.log(db, {
      entity: 'site', recordId: layout.id, action: 'create', changedBy: userId,
      newValues: { layout_name: layout.layout_name, plot_price: layout.plot_price },
    });
    return layout;
  },

  // ─── UPDATE LAYOUT ────────────────────────────────────────────────────────
  async updateLayout(db: Pool, userId: string, layoutId: string, payload: UpdateLandLayoutInput): Promise<any> {
    const existing = await db.query(`SELECT * FROM land_layouts WHERE id = $1`, [layoutId]);
    if (existing.rows.length === 0) throw new NotFoundError('Layout not found');
    const old = existing.rows[0];

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (payload.layoutName          !== undefined) { fields.push(`layout_name = $${idx++}`);           values.push(payload.layoutName?.trim() || null); }
    if (payload.locationDetail      !== undefined) { fields.push(`location_detail = $${idx++}`);        values.push(payload.locationDetail?.trim() || null); }
    if (payload.plotPrice           !== undefined) { fields.push(`plot_price = $${idx++}`);             values.push(payload.plotPrice); }
    if (payload.plotSizeSqft        !== undefined) { fields.push(`plot_size_sqft = $${idx++}`);         values.push(payload.plotSizeSqft); }
    if (payload.pricePerSqft        !== undefined) { fields.push(`price_per_sqft = $${idx++}`);         values.push(payload.pricePerSqft); }
    if (payload.buybackBonusMonthly !== undefined) { fields.push(`buyback_bonus_monthly = $${idx++}`);  values.push(payload.buybackBonusMonthly); }
    if (payload.buybackMonths       !== undefined) { fields.push(`buyback_months = $${idx++}`);         values.push(payload.buybackMonths); }
    if (payload.incentiveType       !== undefined) { fields.push(`incentive_type = $${idx++}`);         values.push(payload.incentiveType); }
    if (payload.status              !== undefined) { fields.push(`status = $${idx++}`);                 values.push(payload.status); }
    if (fields.length === 0) return old;

    fields.push(`updated_by = $${idx++}`, `updated_at = now()`);
    values.push(userId, layoutId);
    const result = await db.query(
      `UPDATE land_layouts SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    const updated = result.rows[0];
    await LandAuditService.log(db, {
      entity: 'site', recordId: layoutId, action: 'update', changedBy: userId,
      oldValues: old, newValues: updated,
    });
    return updated;
  },

  // ═══════════════════════════════════════════════════════════
  // PLOTS
  // ═══════════════════════════════════════════════════════════

  // ─── LIST PLOTS ─────────────────────────────────────────────────────────────
  // IMPORTANT: both the COUNT and the data SELECT must use the same JOINs.
  // Using LEFT JOIN on land_layouts / land_sites means plots that were created
  // before the layout migration (layout_id = NULL) still appear — they just
  // won't have site_name / layout_name populated. This prevents the
  // "count says N but data returns 0" mismatch that caused the empty picker.
  async listPlots(db: Pool, layoutId: string | null, query: ListPlotsQuery): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;

    // Filter to one layout when the booking form requests a specific layout's plots
    if (layoutId) { where += ` AND p.layout_id = $${idx++}`; params.push(layoutId); }
    // Filter by availability status (e.g. 'available' for the booking form)
    if (query.status) { where += ` AND p.status = $${idx++}`; params.push(query.status); }

    // Count with the same JOIN so the total matches what the data query returns
    const countResult = await db.query(
      `SELECT COUNT(*) FROM land_plots p
       LEFT JOIN land_layouts ll ON ll.id = p.layout_id
       LEFT JOIN land_sites   s  ON s.id  = ll.site_id
       WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT p.*,
              ll.layout_name,
              ll.buyback_bonus_monthly AS buyback_bonus_monthly,
              ll.buyback_bonus_monthly AS layout_buyback,
              ll.site_id,
              s.name        AS site_name,
              s.loan_enabled
       FROM land_plots p
       LEFT JOIN land_layouts ll ON ll.id = p.layout_id
       LEFT JOIN land_sites   s  ON s.id  = ll.site_id
       WHERE ${where}
       ORDER BY s.name ASC, ll.layout_name ASC, p.site_number ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );
    return { data: dataResult.rows, total };
  },

  // ─── CREATE PLOT ────────────────────────────────────────────────────────────
  async createPlot(db: Pool, userId: string, layoutId: string, payload: CreateLandPlotInput): Promise<any> {
    const layoutCheck = await db.query(
      `SELECT ll.id, s.loan_enabled
       FROM land_layouts ll JOIN land_sites s ON s.id = ll.site_id
       WHERE ll.id = $1`, [layoutId]
    );
    if (layoutCheck.rows.length === 0) throw new NotFoundError('Layout not found');

    let result: any;
    try {
      // buyback_bonus_monthly is intentionally absent — it lives on the layout;
      // the plot column keeps its DEFAULT 0 and is never read again.
      result = await db.query(
        `INSERT INTO land_plots
           (layout_id, site_id, site_number, area_sqft, land_cost, created_by)
         SELECT $1, ll.site_id, $2, $3, $4, $5
         FROM land_layouts ll WHERE ll.id = $1
         RETURNING *`,
        [layoutId, payload.siteNumber.trim(), payload.areaSqft, payload.landCost, userId]
      );
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictError(`Plot "${payload.siteNumber}" already exists in this layout`);
      throw err;
    }
    const plot = result.rows[0];
    await LandAuditService.log(db, {
      entity: 'plot', recordId: plot.id, action: 'create', changedBy: userId,
      newValues: { layout_id: layoutId, site_number: plot.site_number, land_cost: plot.land_cost },
    });
    return plot;
  },

  // ─── UPDATE PLOT ────────────────────────────────────────────────────────────
  async updatePlot(db: Pool, userId: string, plotId: string, payload: UpdateLandPlotInput): Promise<any> {
    const existing = await db.query(`SELECT * FROM land_plots WHERE id = $1`, [plotId]);
    if (existing.rows.length === 0) throw new NotFoundError('Plot not found');
    const old = existing.rows[0];

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (payload.areaSqft            !== undefined) { fields.push(`area_sqft = $${idx++}`);             values.push(payload.areaSqft); }
    if (payload.landCost            !== undefined) { fields.push(`land_cost = $${idx++}`);              values.push(payload.landCost); }
    if (payload.status              !== undefined) { fields.push(`status = $${idx++}`);                 values.push(payload.status); }
    if (fields.length === 0) return old;

    fields.push(`updated_by = $${idx++}`, `updated_at = now()`);
    values.push(userId, plotId);
    const result = await db.query(
      `UPDATE land_plots SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values
    );
    const updated = result.rows[0];
    await LandAuditService.log(db, {
      entity: 'plot', recordId: plotId, action: 'update', changedBy: userId,
      oldValues: { land_cost: old.land_cost, status: old.status },
      newValues: { land_cost: updated.land_cost, status: updated.status },
    });
    return updated;
  },
};
