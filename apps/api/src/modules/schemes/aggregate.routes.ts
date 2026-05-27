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
import { SCHEME_REGISTRY, getScheme, listSchemes } from './scheme.registry';
import type { SchemeBranchTotals, SchemeDateFilter } from './scheme.contract';

interface AuthenticatedUser { id: string; role: string; branchId: string | null; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Roles allowed to see cross-scheme cross-branch data.
const VIEWER_ROLES = new Set(['md', 'director']);

const DateFilterSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD').optional(),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD').optional(),
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
          throw new ForbiddenError('Only MD or Director can view the cross-scheme dashboard');
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

        return reply.send({ success: true, data: { schemes: schemeResults } });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /:code/branches ────────────────────────────────────────────────
  fastify.get('/:code/branches', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Only MD or Director can view the cross-scheme dashboard');
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
        const dateFilter: SchemeDateFilter = DateFilterSchema.parse(request.query ?? {});

        const entries = await svc.getEntriesByBranch(fastify.db, branchId, dateFilter);
        return reply.send({
          success: true,
          data: {
            schemeCode: svc.schemeCode,
            branchId,
            entries,
          },
        });
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
          throw new ForbiddenError('Only MD or Director can list schemes');
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

}
