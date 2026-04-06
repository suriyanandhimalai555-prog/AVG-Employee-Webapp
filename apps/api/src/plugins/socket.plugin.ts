// src/plugins/socket.plugin.ts
import fp from 'fastify-plugin';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import IORedis from 'ioredis';
// Environment config with validated REDIS_URL and FRONTEND_URL
import { env } from '../config/env';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPE AUGMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Extends FastifyInstance so routes can access fastify.io if needed
declare module 'fastify' {
  interface FastifyInstance {
    io: SocketIOServer;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SOCKET.IO PLUGIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const socketPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  // Create Socket.io server attached to Fastify's underlying http.Server.
  // Must be registered after the auth plugin so fastify.jwt is available.
  const io = new SocketIOServer(fastify.server, {
    cors: {
      // Mirror the same CORS policy used by the REST API
      origin: [env.FRONTEND_URL, /^http:\/\/localhost:\d+$/],
      credentials: true,
    },
    path: '/socket.io',
    // Polling first so the initial handshake works through Railway's reverse proxy;
    // Socket.io will automatically upgrade to WebSocket after the handshake succeeds.
    transports: ['polling', 'websocket'],
  });

  // ── JWT Authentication Middleware ──
  // Every socket connection must send its JWT in the handshake auth object.
  // Rejects the connection before it is established if the token is missing or invalid.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Authentication required'));

    try {
      // Re-use the same @fastify/jwt instance registered in auth.plugin.ts
      const payload = fastify.jwt.verify<{ id: string; role: string }>(token);
      // Store userId on socket.data for use in connection/event handlers
      socket.data.userId = payload.id;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection Handler ──
  io.on('connection', (socket) => {
    // Join a private room named after the user's ID.
    // This lets us target a specific user with io.to(userId).emit(...).
    socket.join(socket.data.userId);
    fastify.log.info(`[Socket.io] User ${socket.data.userId} connected (socket ${socket.id})`);

    socket.on('disconnect', (reason) => {
      fastify.log.info(`[Socket.io] User ${socket.data.userId} disconnected — ${reason}`);
    });
  });

  // ── Redis Pub/Sub Subscriber ──
  // A dedicated Redis client is required for subscribe mode —
  // a pub/sub client cannot issue regular Redis commands while subscribed.
  const subRedis = new IORedis(env.REDIS_URL, {
    // Required by BullMQ and sub clients to avoid retry recursion
    maxRetriesPerRequest: null,
  });

  // Subscribe to both check-in and sign-off confirmation channels
  await subRedis.subscribe('attendance:confirmed', 'signoff:confirmed');

  subRedis.on('message', (channel, message) => {
    try {
      if (channel === 'attendance:confirmed') {
        const data = JSON.parse(message) as {
          userId: string;
          date: string;
          status: string;
          jobId: string | undefined;
          markedBy: string | undefined;
        };
        // Notify the employee whose attendance was marked
        io.to(data.userId).emit('attendance:confirmed', data);
        // Also notify the admin who marked on behalf of someone else — their panel
        // won't refresh otherwise because the socket room is per-user, not per-session
        if (data.markedBy && data.markedBy !== data.userId) {
          io.to(data.markedBy).emit('attendance:confirmed', data);
        }
        fastify.log.info(`[Socket.io] Emitted attendance:confirmed to user ${data.userId}`);
      } else if (channel === 'signoff:confirmed') {
        const data = JSON.parse(message) as {
          userId: string;
          date: string;
          jobId: string | undefined;
          signedOffBy: string | undefined;
        };
        // Notify the employee who signed off
        io.to(data.userId).emit('signoff:confirmed', data);
        // Also notify the admin who signed off on behalf of an employee
        if (data.signedOffBy && data.signedOffBy !== data.userId) {
          io.to(data.signedOffBy).emit('signoff:confirmed', data);
        }
        fastify.log.info(`[Socket.io] Emitted signoff:confirmed to user ${data.userId}`);
      }
    } catch (err) {
      fastify.log.error({ err }, '[Socket.io] Failed to parse pub/sub message on channel: ' + channel);
    }
  });

  subRedis.on('error', (err) => {
    fastify.log.error({ err }, '[Socket.io] Redis subscriber error');
  });

  // Expose io on the Fastify instance for use elsewhere if needed
  fastify.decorate('io', io);

  // Graceful cleanup when Fastify shuts down
  fastify.addHook('onClose', async () => {
    await subRedis.unsubscribe('attendance:confirmed', 'signoff:confirmed');
    subRedis.disconnect();
    io.close();
    fastify.log.info('[Socket.io] Server and Redis subscriber closed');
  });

  fastify.log.info('✅ Socket.io plugin registered');
});

export default socketPlugin;
