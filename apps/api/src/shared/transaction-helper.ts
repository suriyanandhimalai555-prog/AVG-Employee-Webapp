// Centralised pg transaction wrapper. Every service that runs more than one
// related statement should call this so we never leave a half-applied state.
import { Pool, PoolClient } from 'pg';

// Run `fn` inside BEGIN/COMMIT, ROLLBACK on any throw, always release the client.
export async function runInTransaction<T>(
  db: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Best-effort rollback. Swallow ROLLBACK failures so the original error
    // is preserved as the cause surfaced to the caller.
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
