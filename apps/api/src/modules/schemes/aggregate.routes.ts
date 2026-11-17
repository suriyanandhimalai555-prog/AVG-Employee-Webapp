// Cross-scheme aggregate routes for the MD/Director dashboard.
//
// Three endpoints, all gated to md / director:
//
//   GET /api/schemes/overview
//     → For every scheme in the registry that implements getOverviewByBranch,
//       returns its byBranch breakdown + summed totals + scheme display name.
//
//   GET /api/schemes/:code/branches
//     → Same as above for a single scheme. Useful when the dashboard wants to
//       refresh just one scheme card without re-paying for the others.
//
//   GET /api/schemes/:code/branches/:branchId/entries
//     → Per-scheme, per-branch member/room list. Drill-down view.
//
// Decoupling: the route layer does NOT know each scheme's table shape. It just
// asks the registry "does this scheme support aggregates?" and forwards. Adding
// a new scheme that implements the two optional methods makes it appear here
// automatically with no edits to this file.

import { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool } from 'pg';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
// TS: named import — shared Zod fields for ?page=&limit= (see shared/pagination.ts)
import { pageQueryFields } from '../../shared/pagination';
import { SCHEME_REGISTRY, getScheme, listSchemes } from './scheme.registry';
import type { SchemeBranchTotals, SchemeDateFilter, SchemeEntriesFilter } from './scheme.contract';
import { PendingEnrollmentsService } from '../pending-enrollments/pending-enrollments.service';
import { getDailyCollection, getDailyCollectionByScheme } from './daily-collection.service';

interface AuthenticatedUser { id: string; role: string; branchId: string | null; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Roles allowed to see cross-scheme cross-branch data.
// Management is included so they can load entries in the Corrections Center.
const VIEWER_ROLES = new Set(['md', 'director', 'management']);

const DateFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
});

// Entries drill-down filter: date range, optional free-text search, and the page window.
// Search runs in each scheme's WHERE clause, so it covers every page of the branch.
// TS: .extend() reuses the date rules; pageQueryFields adds validated ?page=&limit=.
const EntriesFilterSchema = DateFilterSchema.extend({
  search: z.string().trim().max(100, 'search must be at most 100 characters').optional(),
  ...pageQueryFields,
});

// TS: validates the optional date and optional/required branchId on daily-collection routes.
const DailyCollectionQuerySchema = z.object({
  date:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
  branchId: z.string().uuid('branchId must be a valid UUID').optional(),
});

// Sum byBranch rows into a single totals object for the scheme card.
function sumTotals(byBranch: SchemeBranchTotals[]): { count: number; collected: number; commission: number; branchCount: number } {
  let count = 0, collected = 0, commission = 0;
  for (const b of byBranch) {
    count += b.count;
    collected += b.collected;
    commission += b.commission;
  }
  return { count, collected, commission, branchCount: byBranch.length };
}

// Fetch the display name from the projects table once per scheme — the
// registry only stores stable codes, but the dashboard wants the human label
// the admin can rename through the UI.
async function loadSchemeNames(
  db: Pool,
  codes: string[],
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const res = await db.query<{ code: string; name: string }>(
    `SELECT code, name FROM projects WHERE code = ANY($1::text[])`,
    [codes]
  );
  return new Map(res.rows.map((r) => [r.code, r.name] as const));
}

export default async function schemesAggregateRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /overview ──────────────────────────────────────────────────────
  fastify.get('/overview', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Access denied');
        }
        const dateFilter: SchemeDateFilter = DateFilterSchema.parse(request.query ?? {});

        const services = listSchemes().filter((s) => typeof s.getOverviewByBranch === 'function');
        const codes = services.map((s) => s.schemeCode);
        const names = await loadSchemeNames(fastify.db, codes);

        // Parallelise — every scheme's queries are independent.
        const schemeResults = await Promise.all(
          services.map(async (svc) => {
            const byBranch = await svc.getOverviewByBranch!(fastify.db, dateFilter);
            return {
              schemeCode: svc.schemeCode,
              schemeName: names.get(svc.schemeCode) ?? svc.schemeCode,
              totals:     sumTotals(byBranch),
              byBranch,
            };
          })
        );

        // Pending enrollments: deposits collected while still 'collecting'. Surfaced as a
        // distinct bucket (collected-when-received). On completion the money leaves this
        // bucket and reappears under the real scheme — so it is never double counted.
        const pendingByBranch: SchemeBranchTotals[] = (
          await PendingEnrollmentsService.getOverviewByBranch(fastify.db, dateFilter)
        ).map((b) => ({ ...b, commission: 0 }));
        const pendingResult = {
          schemeCode: 'pending_enrollment',
          schemeName: 'Pending Enrollments',
          totals:     sumTotals(pendingByBranch),
          byBranch:   pendingByBranch,
        };

        return reply.send({ success: true, data: { schemes: [...schemeResults, pendingResult] } });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /:code/branches ────────────────────────────────────────────────
  fastify.get('/:code/branches', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Access denied');
        }
        const { code } = request.params as { code: string };
        const svc = getScheme(code);
        if (!svc || typeof svc.getOverviewByBranch !== 'function') {
          throw new NotFoundError(`Scheme '${code}' does not expose a branch breakdown`);
        }
        const dateFilter: SchemeDateFilter = DateFilterSchema.parse(request.query ?? {});

        const byBranch = await svc.getOverviewByBranch(fastify.db, dateFilter);
        return reply.send({
          success: true,
          data: {
            schemeCode: svc.schemeCode,
            totals:     sumTotals(byBranch),
            byBranch,
          },
        });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /:code/branches/:branchId/entries ──────────────────────────────
  fastify.get('/:code/branches/:branchId/entries', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Only MD or Director can drill into branch entries');
        }
        const { code, branchId } = request.params as { code: string; branchId: string };
        const svc = getScheme(code);
        if (!svc || typeof svc.getEntriesByBranch !== 'function') {
          throw new NotFoundError(`Scheme '${code}' does not expose a per-branch entry list`);
        }
        // TS: typed as the entries filter (dates + search) so it matches the contract signature
        const filter: SchemeEntriesFilter = EntriesFilterSchema.parse(request.query ?? {});

        const entries = await svc.getEntriesByBranch(fastify.db, branchId, filter);
        // Every row carries total_count = matches across ALL pages, so the client knows
        // whether another page exists. A page past the end returns no rows; in that case
        // everything before it has been seen, so the offset is the best total we have.
        // TS: Number() because the window-count column arrives untyped from pg rows.
        const total = entries.length > 0
          ? Number(entries[0].total_count ?? entries.length)
          : (filter.page! - 1) * filter.limit!;
        return reply.send({
          success: true,
          data: {
            schemeCode: svc.schemeCode,
            branchId,
            total,
            // TS: non-null — Zod defaults guarantee both are set after parse()
            page:  filter.page!,
            limit: filter.limit!,
            entries,
          },
        });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /daily-collection ──────────────────────────────────────────────
  // Per-branch scheme payment breakdown for the MD money dashboard.
  // Query params: date (YYYY-MM-DD, default IST today), branchId (optional UUID).
  fastify.get('/daily-collection', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Access denied');
        }
        const q = DailyCollectionQuerySchema.parse(request.query ?? {});
        const result = await getDailyCollection(
          fastify.db,
          q.date,
          q.branchId,
        );
        return reply.send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /daily-collection-by-scheme ───────────────────────────────────────
  // Per-scheme breakdown for a single branch — gold/chit split new vs renewal.
  // Query params: date (YYYY-MM-DD, default IST today), branchId (UUID, required).
  // Branch admins are allowed but their branchId is always forced to their own
  // branch so they cannot read another branch's data by spoofing the param.
  fastify.get('/daily-collection-by-scheme', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        // Branch admins see their own branch's data; elevated roles can request any branch.
        const isBranchAdmin = req.user.role === 'branch_admin';
        if (!VIEWER_ROLES.has(req.user.role) && !isBranchAdmin) {
          throw new ForbiddenError('Access denied');
        }
        const q = DailyCollectionQuerySchema.parse(request.query ?? {});
        // Branch admins are locked to their own branch; elevated roles pass branchId through.
        const branchId = isBranchAdmin ? req.user.branchId : q.branchId;
        if (!branchId) {
          return reply.status(400).send({ success: false, error: { code: 'BAD_REQUEST', message: 'branchId is required' } });
        }
        const result = await getDailyCollectionByScheme(
          fastify.db,
          q.date,
          branchId,
        );
        return reply.send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /codes ── tiny helper so the frontend can self-describe ────────
  // Returns the registered scheme codes and names in registry order. Cheap
  // ping that doesn't run any of the scheme-specific aggregates.
  fastify.get('/codes', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Access denied');
        }
        const codes = Object.keys(SCHEME_REGISTRY);
        const names = await loadSchemeNames(fastify.db, codes);
        return reply.send({
          success: true,
          data: codes.map((c) => ({ schemeCode: c, schemeName: names.get(c) ?? c })),
        });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /audit — correction audit log (md / management) ─────────────────
  // Returns recent correction/void events from scheme_corrections_audit.
  // Filterable by schemeCode, actorId, action, entityId, and date range.
  fastify.get('/audit', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        // Only correction actors (md/management) may read the audit log; director is read-only
        if (!['md', 'management'].includes(req.user.role)) {
          throw new ForbiddenError('Only MD or Management can view the corrections audit log');
        }
        const q = request.query as Record<string, string>;
        const params: any[] = [];
        const clauses: string[] = [];
        let idx = 1;
        if (q.schemeCode) { clauses.push(`scheme_code = $${idx++}`); params.push(q.schemeCode); }
        if (q.entityType) { clauses.push(`entity_type = $${idx++}`); params.push(q.entityType); }
        if (q.action)     { clauses.push(`action = $${idx++}`);      params.push(q.action); }
        if (q.actorId)    { clauses.push(`actor_id = $${idx++}`);    params.push(q.actorId); }
        if (q.entityId)   { clauses.push(`entity_id = $${idx++}`);   params.push(q.entityId); }
        if (q.startDate)  { clauses.push(`created_at >= $${idx++}::timestamptz`); params.push(q.startDate); }
        if (q.endDate)    { clauses.push(`created_at < ($${idx++}::date + INTERVAL '1 day')::timestamptz`); params.push(q.endDate); }

        const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
        const limit = Math.min(parseInt(q.limit ?? '100', 10), 500);
        params.push(limit);

        const result = await fastify.db.query(
          `SELECT a.*, u.name AS actor_name
           FROM scheme_corrections_audit a
           JOIN users u ON u.id = a.actor_id
           ${where}
           ORDER BY a.created_at DESC
           LIMIT $${idx}`,
          params
        );
        return reply.send({ success: true, data: result.rows });
      } catch (error) { return handleError(error, reply); }
    }
  );

}
