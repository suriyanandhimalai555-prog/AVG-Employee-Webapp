// src/modules/transactions/transaction.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { TransactionService } from './transaction.service';
import { 
  CreateTransactionSchema, 
  UpdateTransactionStatusSchema, 
  GetTransactionsQuerySchema 
} from './transaction.schema';
import { AppError } from '../../shared/errors';

type AuthenticatedRequest = FastifyRequest & {
  user: { id: string; role: string; branchId: string | null };
};

const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.issues },
    });
  }
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }
  console.error('❌ Transaction route error:', error);
  return reply.code(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};

export default async function transactionRoutes(fastify: FastifyInstance) {

  // ─── POST /api/transactions ───
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const payload = CreateTransactionSchema.parse(request.body);
      const transaction = await TransactionService.createTransaction(
        fastify.db,
        req.user.id,
        payload
      );
      return reply.code(201).send({ success: true, data: transaction });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/transactions ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const query = GetTransactionsQuerySchema.parse(request.query);
      const transactions = await TransactionService.listTransactions(
        fastify.db,
        req.user.id,
        query
      );
      return reply.send({ success: true, data: transactions });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PATCH /api/transactions/:id/status ───
  fastify.patch('/:id/status', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };
      const payload = UpdateTransactionStatusSchema.parse(request.body);
      
      const transaction = await TransactionService.updateTransactionStatus(
        fastify.db,
        req.user.id,
        id,
        payload
      );
      
      return reply.send({ success: true, data: transaction });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
