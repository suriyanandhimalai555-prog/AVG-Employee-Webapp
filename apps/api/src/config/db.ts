import { Pool, types } from 'pg';
import { env } from './env';

// Override pg DATE type parser — pg converts DATE columns to JS Date objects by default, which
// shifts the date back one day when the server runs in IST (+05:30) due to UTC conversion.
// Returning the raw string keeps '2026-04-04' as '2026-04-04' in all JSON responses.
types.setTypeParser(1082, (val) => val);

// Create a new connection pool for PostgreSQL using the validated DATABASE_URL from the env config
const pool = new Pool({
  // Specify the connection string for the database
  connectionString: env.DATABASE_URL,
  // Increased to 50 to support 1500+ concurrent traffic spikes
  max: 50,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Register an event listener for when a new client is connected to the database
pool.on('connect', () => {
  // Output a success message to the console on a successful connection
  console.log('✅ Database connected');
});

// Register an event listener for when an error occurs during a connection
pool.on('error', (err) => {
  // Output the error to the console with a descriptive label
  console.error('❌ Database connection error:', err);
  // Terminate the application immediately with exit code 1 on connection failure
  process.exit(1);
});

// Export the pool as the default export for use in components that need database access
export default pool;
