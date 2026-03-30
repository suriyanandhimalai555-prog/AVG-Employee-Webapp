import { Pool } from 'pg';
import { env } from './env';

// Create a new connection pool for PostgreSQL using the validated DATABASE_URL from the env config
const pool = new Pool({
  // Specify the connection string for the database
  connectionString: env.DATABASE_URL,
  // Define the maximum number of simultaneous connections (20)
  max: 20,
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
