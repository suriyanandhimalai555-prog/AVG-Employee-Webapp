// Worker-side 'notifications' queue instance.
//
// Mirrors the API-side notifications.queue.ts — both point at the same Redis
// so jobs enqueued by the API are consumed by this worker.  The type is
// Queue<any> because the worker reads job.data untyped (same pattern as
// the attendance queue which also has no shared type with the worker).
import { Queue } from 'bullmq';
import { redis } from '../redis';

// TS: separate queue from 'attendance' so notification backlog never throttles
// attendance processing and vice versa.
// removeOnComplete/removeOnFail: without these, completed job IDs accumulate in
// Redis indefinitely — the sweep would see them as "still exists" and silently
// refuse to re-enqueue the same outbox row on future sweep runs.
export const notificationsQueue = new Queue('notifications', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail:     1000,
  },
});

export default notificationsQueue;
