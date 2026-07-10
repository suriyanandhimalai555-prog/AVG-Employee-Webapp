// Gold Coin scheme REST surface.
//
// Access control model:
//   GET /packages              → any authenticated user (global catalogue)
//   GET /rooms                 → branch_admin (own branch), md/director/gm (oversight scope)
//   GET /rooms/awaiting-combine→ head-branch admin only
//   GET /rooms/:id             → same as list; head-branch admin also sees pending_combine rooms
//   POST /slots                → branch_admin only (writes to own branch)
//   POST /slots/:id/refund     → branch_admin only (own branch's slots)
//   POST /rooms/:id/activate      → branch_admin only (own branch's rooms)
//   POST /rooms/:id/send-to-head  → branch_admin only (own branch, non-head); transitions filling→pending_combine
//   POST /rooms/:id/draws         → branch_admin only (own branch's rooms)
//   POST /rooms/combine        → head-branch admin only
//   POST /rooms/:id/refund     → head-branch admin only (head branch's rooms)
//   GET /summary               → branch_admin (own branch); md/director/gm (oversight aggregate);
//                                bm/abm/sales_officer (own referrals); client → 403

import { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, GOLD_COIN_VIEWER_ROLES, REFERRER_ONLY_ROLES, hasRole, resolveWriterBranch, resolveCorrectionBranch } from '../../shared/role-constants';
import { assertCanManageSchemeData } from '../../shared/permissions';
import { assertBackdateAllowed } from '../../shared/backdate-guard';
import { assertReconciliationSubmitted } from '../../shared/reconciliation-guard';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';
import { getOversightBranchIds } from '../../shared/hierarchy';
import {
  GoldCoinService,
  PackagesService,
  RoomsService,
  SlotsService,
  DrawsService,
  CombineService,
} from './gold-coin.service';
import {
  CreateSlotSchema,
  ActivateRoomSchema,
  RunDrawSchema,
  CombineRoomsSchema,
  RefundRoomSchema,
  ListRoomsQuerySchema,
  CorrectGoldCoinSlotSchema,
} from './gold-coin.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string | null; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Resolve the set of branch IDs the caller is allowed to see, based on role.
// Returns null for MD (global — all branches).
// Throws ForbiddenError for roles that have no room-level access.
async function resolveViewScope(
  fastify: FastifyInstance,
  req: AuthenticatedRequest,
): Promise<{ branchIds: string[] | null; branchId: string | null; isHeadBranch: boolean }> {
  const { role, id, branchId: jwtBranchId } = req.user;

  if (role === Role.BRANCH_ADMIN) {
    const branchId = await resolveBranchAdminBranchId(fastify.db, id, jwtBranchId);
    const { rows } = await fastify.db.query<{ is_head_branch: boolean }>(
      'SELECT is_head_branch FROM branches WHERE id = $1',
      [branchId]
    );
    const isHeadBranch = !!rows[0]?.is_head_branch;
    return { branchIds: [branchId], branchId, isHeadBranch };
  }

  if (role === Role.MD || role === Role.MANAGEMENT) {
    // TS: management has no branchId on the JWT; treat as global scope like MD
    return { branchIds: null, branchId: null, isHeadBranch: false };
  }

  if (role === Role.DIRECTOR || role === Role.GM) {
    const branchIds = await getOversightBranchIds(fastify.db, id);
    if (branchIds.length === 0) {
      throw new ForbiddenError('No branches assigned to your oversight');
    }
    return { branchIds, branchId: null, isHeadBranch: false };
  }

  throw new ForbiddenError('Access denied');
}

// Resolve the caller's single branch for write operations.
// branch_admin → looked up via resolveBranchAdminBranchId.
// management   → provided as a body param (no JWT branchId).
async function resolveSingleBranch(
  fastify: FastifyInstance,
  req: AuthenticatedRequest,
  bodyBranchId?: string,
): Promise<string> {
  if (req.user.role === Role.MANAGEMENT) {
    return resolveWriterBranch(req.user.role, req.user.branchId, bodyBranchId);
  }
  if (req.user.role !== Role.BRANCH_ADMIN) {
    throw new ForbiddenError('Only Branch Admin or Management can perform this action');
  }
  return resolveBranchAdminBranchId(fastify.db, req.user.id, req.user.branchId);
}

export default async function goldCoinRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /packages ──────────────────────────────────────────────────────
  fastify.get('/packages', { onRequest: [fastify.authenticate] },
    async (_request, reply) => {
      try {
        const data = await PackagesService.listActive(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /packages/all — includes inactive, for the control-center editor ─
  fastify.get('/packages/all', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const CONFIG = new Set(['md', 'director', 'management']);
        if (!CONFIG.has(req.user.role)) throw new ForbiddenError('Access denied');
        const data = await PackagesService.listAll(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /packages/:id — config roles ─────────────────────────────────
  fastify.patch('/packages/:id', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const CONFIG = new Set(['md', 'director', 'management']);
        if (!CONFIG.has(req.user.role)) throw new ForbiddenError('Access denied');
        const { id }  = request.params as { id: string };
        const body    = request.body as { name?: string; price?: number; goldGrams?: number; isActive?: boolean };
        const data    = await PackagesService.updatePackage(fastify.db, id, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /slots — customer buys a slot ─────────────────────────────────
  fastify.post('/slots', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req  = request as AuthenticatedRequest;
        const body = CreateSlotSchema.parse(request.body);
        // Past sale dates require the backdated-entry flag (management exempt)
        await assertBackdateAllowed(fastify.db, req.user.role, [body.saleDate]);
        const branchId = await resolveSingleBranch(fastify, req, (body as any).branchId);
        // Daily collection summary must be submitted before any scheme entry (management exempt)
        await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
        const result = await SlotsService.createSlot(fastify.db, branchId, req.user.id, body);
        return reply.code(201).send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /slots/:id/refund — refund a held slot ────────────────────────
  fastify.post('/slots/:id/refund', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req      = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req, (request.body as any)?.branchId);
        const { id }   = request.params as { id: string };
        await SlotsService.refundSlot(fastify.db, id, branchId);
        return reply.send({ success: true });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /rooms/awaiting-combine — head-branch admin inbox ──────────────
  // Must be registered BEFORE /rooms/:id so Fastify doesn't treat "awaiting-combine" as a param.
  fastify.get('/rooms/awaiting-combine', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        await CombineService.assertHeadBranchAdmin(fastify.db, req.user.id);
        const data = await RoomsService.listAwaitingCombine(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /rooms — list rooms (scoped by role) ───────────────────────────
  fastify.get('/rooms', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!hasRole(req.user.role, GOLD_COIN_VIEWER_ROLES)) {
          throw new ForbiddenError('Access denied');
        }
        const { branchIds } = await resolveViewScope(fastify, req);
        // Accept status/packageId filters from query; branchId from query is ignored
        // (server always derives scope from JWT identity).
        const raw = ListRoomsQuerySchema.parse(request.query);
        const result = await RoomsService.list(fastify.db, {
          status:    raw.status,
          packageId: raw.packageId,
          search:    raw.search,
          branchIds,
          page:      raw.page,
          limit:     raw.limit,
        });
        return reply.send({ success: true, ...result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /rooms/:id — full room with slots + draws ──────────────────────
  fastify.get('/rooms/:id', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!hasRole(req.user.role, GOLD_COIN_VIEWER_ROLES)) {
          throw new ForbiddenError('Access denied');
        }
        const { branchIds, isHeadBranch } = await resolveViewScope(fastify, req);
        const { id } = request.params as { id: string };
        // Head-branch admin can also preview pending_combine rooms from other branches.
        const data = await RoomsService.getById(fastify.db, id, branchIds, isHeadBranch);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /rooms/:id/activate ───────────────────────────────────────────
  fastify.post('/rooms/:id/activate', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req);
        const { id } = request.params as { id: string };
        const body = ActivateRoomSchema.parse(request.body ?? {});
        // activate now receives callerBranchId for ownership check inside the service
        const room = await RoomsService.activate(fastify.db, id, req.user.id, body.notes, branchId);
        return reply.send({ success: true, data: room });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /rooms/:id/draws — run the next monthly draw ──────────────────
  fastify.post('/rooms/:id/draws', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req);
        const { id } = request.params as { id: string };
        const body = RunDrawSchema.parse(request.body ?? {});
        const result = await DrawsService.runDraw(fastify.db, id, req.user.id, body, branchId);
        return reply.send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /rooms/:id/send-to-head — branch admin manually transfers to head ─
  fastify.post('/rooms/:id/send-to-head', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req);
        const { id } = request.params as { id: string };
        const room = await RoomsService.sendToHeadBranch(fastify.db, id, branchId);
        return reply.send({ success: true, data: room });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── HEAD-BRANCH ONLY: combine / refund / extend ────────────────────────
  fastify.post('/rooms/combine', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const { headBranchId } = await CombineService.assertHeadBranchAdmin(fastify.db, req.user.id);
        const body = CombineRoomsSchema.parse(request.body);
        const result = await CombineService.combineRooms(
          fastify.db, body.sourceRoomIds, headBranchId, req.user.id, body.notes
        );
        return reply.code(201).send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  fastify.post('/rooms/:id/refund', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const { headBranchId } = await CombineService.assertHeadBranchAdmin(fastify.db, req.user.id);
        const { id } = request.params as { id: string };
        const body = RefundRoomSchema.parse(request.body ?? {});
        const result = await CombineService.refundRoom(fastify.db, id, headBranchId, body.reason);
        return reply.send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /summary — scheme summary scoped by role ───────────────────────
  fastify.get('/summary', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const { role, id: userId, branchId: jwtBranchId } = req.user;

        if (role === Role.CLIENT) {
          throw new ForbiddenError('Access denied');
        }

        let summaryArg: string | { branchId: string; scopedToUserId?: string } | { branchIds: string[] };

        if (role === Role.BRANCH_ADMIN) {
          const branchId = await resolveBranchAdminBranchId(fastify.db, userId, jwtBranchId);
          summaryArg = { branchId };
        } else if (role === Role.MD || role === Role.MANAGEMENT) {
          // MD / Management get an org-wide summary (no branch filter)
          const data = await GoldCoinService.getBranchSummary(fastify.db, { branchIds: [] });
          return reply.send({ success: true, data });
        } else if (role === Role.DIRECTOR || role === Role.GM) {
          const branchIds = await getOversightBranchIds(fastify.db, userId);
          summaryArg = { branchIds };
        } else if (hasRole(role, REFERRER_ONLY_ROLES)) {
          // BM / ABM / Sales Officer — own referrals only.
          // branchId may be null for these roles but the slot filter uses referrer_id.
          if (!jwtBranchId) throw new ForbiddenError('No branch assigned');
          summaryArg = { branchId: jwtBranchId, scopedToUserId: userId };
        } else {
          throw new ForbiddenError('Access denied');
        }

        const data = await GoldCoinService.getBranchSummary(fastify.db, summaryArg, undefined, undefined);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /gold-coin/rooms/:id/void — soft-void a room (admin) ──────────
  fastify.patch('/rooms/:id/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query('SELECT branch_id FROM gold_coin_rooms WHERE id = $1', [id]);
        if (rows.rows.length === 0) throw new Error('Room not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await RoomsService.voidRoom(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /gold-coin/slots/:id/remove — remove a member from a room (admin) ─
  fastify.patch('/slots/:id/remove', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query('SELECT branch_id FROM gold_coin_slots WHERE id = $1', [id]);
        if (rows.rows.length === 0) throw new Error('Slot not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await SlotsService.removeSlot(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /gold-coin/slots/:id/correct ───────────────────────────────────
  fastify.patch('/slots/:id/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const body = CorrectGoldCoinSlotSchema.parse(req.body);
        const rows = await fastify.db.query(
          'SELECT branch_id FROM gold_coin_slots WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Slot not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, (body as any).branchId);
        const data = await SlotsService.correctSlot(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /gold-coin/slots/:id/void ─────────────────────────────────────
  fastify.patch('/slots/:id/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM gold_coin_slots WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Slot not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await SlotsService.voidSlot(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── DELETE /gold-coin/rooms/:roomId/draws/:drawId — undo the latest draw ───
  // Only the most-recent draw can be reversed (enforced in the service).
  // Gated to MD / management; branch is resolved from the room row, not the caller.
  fastify.delete('/rooms/:roomId/draws/:drawId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { roomId, drawId } = req.params as { roomId: string; drawId: string };
        const rows = await fastify.db.query('SELECT branch_id FROM gold_coin_rooms WHERE id = $1', [roomId]);
        if (rows.rows.length === 0) throw new NotFoundError('Room not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, (req.body as any)?.branchId);
        const data = await DrawsService.undoDraw(fastify.db, req.user.id, roomId, drawId, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /gold-coin/slots/:id/delete — permanently delete a slot ─────────
  fastify.patch('/slots/:id/delete', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM gold_coin_slots WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Slot not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await SlotsService.deleteSlot(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

}
