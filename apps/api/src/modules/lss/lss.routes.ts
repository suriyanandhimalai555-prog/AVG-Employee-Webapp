// LSS scheme REST surface.
//
// Access control model (mirrors gold-coin):
//   GET /plans                  → any authenticated user
//   GET /rooms                  → branch_admin (own branch), md/director/gm (oversight scope)
//   GET /rooms/awaiting-combine → head-branch admin only
//   GET /rooms/:id              → same as list; head-branch admin also sees pending_combine rooms
//   POST /slots                 → branch_admin only
//   POST /slots/:id/refund      → branch_admin only
//   POST /rooms/:id/activate    → branch_admin only
//   POST /rooms/:id/send-to-head→ branch_admin only
//   POST /rooms/:id/draws       → branch_admin only
//   POST /rooms/combine         → head-branch admin only
//   POST /rooms/:id/refund      → head-branch admin only
//   GET /summary                → branch_admin / md / director / gm / bm / abm / sales_officer

import { FastifyInstance, FastifyRequest } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, GOLD_COIN_VIEWER_ROLES, REFERRER_ONLY_ROLES, hasRole } from '../../shared/role-constants';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';
import { getOversightBranchIds } from '../../shared/hierarchy';
import {
  LSSService,
  PlansService,
  RoomsService,
  SlotsService,
  DrawsService,
  CombineService,
} from './lss.service';
import {
  CreateSlotSchema,
  ActivateRoomSchema,
  RunDrawSchema,
  CombineRoomsSchema,
  RefundRoomSchema,
  ListRoomsQuerySchema,
} from './lss.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string | null; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

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

  if (role === Role.MD) {
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

async function resolveSingleBranch(
  fastify: FastifyInstance,
  req: AuthenticatedRequest,
): Promise<string> {
  if (req.user.role !== Role.BRANCH_ADMIN) {
    throw new ForbiddenError('Only branch admins can perform this action');
  }
  return resolveBranchAdminBranchId(fastify.db, req.user.id, req.user.branchId);
}

export default async function lssRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /plans ─────────────────────────────────────────────────────────
  fastify.get('/plans', { onRequest: [fastify.authenticate] },
    async (_request, reply) => {
      try {
        const data = await PlansService.listActive(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /slots ─────────────────────────────────────────────────────────
  fastify.post('/slots', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req);
        const body = CreateSlotSchema.parse(request.body);
        const result = await SlotsService.createSlot(fastify.db, branchId, req.user.id, body);
        return reply.code(201).send({ success: true, data: result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /slots/:id/refund ──────────────────────────────────────────────
  fastify.post('/slots/:id/refund', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req);
        const { id } = request.params as { id: string };
        await SlotsService.refundSlot(fastify.db, id, branchId);
        return reply.send({ success: true });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /rooms/awaiting-combine — must be BEFORE /rooms/:id ───────────
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

  // ─── GET /rooms ──────────────────────────────────────────────────────────
  fastify.get('/rooms', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!hasRole(req.user.role, GOLD_COIN_VIEWER_ROLES)) {
          throw new ForbiddenError('Access denied');
        }
        const { branchIds } = await resolveViewScope(fastify, req);
        const raw = ListRoomsQuerySchema.parse(request.query);
        const result = await RoomsService.list(fastify.db, {
          status:    raw.status,
          planId:    raw.planId,
          branchIds,
          page:      raw.page,
          limit:     raw.limit,
        });
        return reply.send({ success: true, ...result });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /rooms/:id ──────────────────────────────────────────────────────
  fastify.get('/rooms/:id', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!hasRole(req.user.role, GOLD_COIN_VIEWER_ROLES)) {
          throw new ForbiddenError('Access denied');
        }
        const { branchIds, isHeadBranch } = await resolveViewScope(fastify, req);
        const { id } = request.params as { id: string };
        const data = await RoomsService.getById(fastify.db, id, branchIds, isHeadBranch);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /rooms/:id/activate ────────────────────────────────────────────
  fastify.post('/rooms/:id/activate', { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const req = request as AuthenticatedRequest;
        const branchId = await resolveSingleBranch(fastify, req);
        const { id } = request.params as { id: string };
        const body = ActivateRoomSchema.parse(request.body ?? {});
        const room = await RoomsService.activate(fastify.db, id, req.user.id, body.notes, branchId);
        return reply.send({ success: true, data: room });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── POST /rooms/:id/draws ───────────────────────────────────────────────
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

  // ─── POST /rooms/:id/send-to-head ───────────────────────────────────────
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

  // ─── HEAD-BRANCH ONLY: combine / refund ─────────────────────────────────
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

  // ─── GET /summary ────────────────────────────────────────────────────────
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
        } else if (role === Role.MD) {
          const data = await LSSService.getBranchSummary(fastify.db, { branchIds: [] });
          return reply.send({ success: true, data });
        } else if (role === Role.DIRECTOR || role === Role.GM) {
          const branchIds = await getOversightBranchIds(fastify.db, userId);
          summaryArg = { branchIds };
        } else if (hasRole(role, REFERRER_ONLY_ROLES)) {
          if (!jwtBranchId) throw new ForbiddenError('No branch assigned');
          summaryArg = { branchId: jwtBranchId, scopedToUserId: userId };
        } else {
          throw new ForbiddenError('Access denied');
        }

        const data = await LSSService.getBranchSummary(fastify.db, summaryArg, undefined, undefined);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

}
