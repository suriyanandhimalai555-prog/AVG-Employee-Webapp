import pg, { Pool } from 'pg';
import { env } from './config/env';

// Return DATE columns as plain strings ('2026-04-04') — never convert to JS Date,
// which would shift by UTC offset when the server timezone is not IST.
pg.types.setTypeParser(1082, (val: string) => val);

export const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 30,
});
