// src/modules/auth/auth.service.ts
import { Pool } from 'pg';
import Redis from 'ioredis';
import bcrypt from 'bcrypt';
// Import custom error classes for graceful error handling
import { UnauthorizedError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { hydrateBranchAdminProfile } from '../../shared/attendance-scope';
import { AuthUserResponse, LoginInput, ChangePasswordInput } from './auth.schema';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH SERVICE IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Export an object containing all pure business logic for authentication
export const AuthService = {
  
  // ─── LOGIN ───
  
  // Authenticate a user by email/password and return their profile data
  async login(db: Pool, redis: Redis, input: LoginInput): Promise<AuthUserResponse> {
    // Step 1: Look up the user by email in the database with their branch name
    const userResult = await db.query(
      `SELECT u.id, u.name, u.email, u.password_hash, u.role,
              u.branch_id, u.has_smartphone, u.is_active,
              b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.email = $1`,
      [input.email]
    );

    // Step 2: If no user was found, throw a generic 401 Unauthorized error
    if (userResult.rows.length === 0) {
      // Use the custom UnauthorizedError which generates a 401 response
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Store the found user row for readability
    const user = userResult.rows[0];

    // Step 3: Check if the account has been disabled by an administrator
    if (user.is_active === false) {
      // Use the custom ForbiddenError which generates a 403 response
      throw new ForbiddenError('Your account has been disabled', 'ACCOUNT_DISABLED');
    }

    // Step 4: Use bcrypt to compare the submitted plain-text password with the stored hash
    const isValid = await bcrypt.compare(input.password, user.password_hash);

    // If the password is not valid, throw the same generic 401 error
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    // Prepare the standardized profile object to return and cache
    const profile: AuthUserResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branch_id,
      branchName: user.branch_name || (user.role === 'md' ? 'Head Office' : null),
      hasSmartphone: user.has_smartphone,
    };

    await hydrateBranchAdminProfile(db, profile);

    // Step 5: Cache the session in Redis for 30 minutes to make subsequent /me lookups instant
    await redis.setex(`user:${user.id}`, 1800, JSON.stringify(profile));

    // Return the authenticated user's profile
    return profile;
  },

  // ─── GET ME ───

  // Retrieve the profile for the currently authenticated user
  async getMe(db: Pool, redis: Redis, userId: string): Promise<AuthUserResponse> {
    // Step 1: Attempt to fetch the profile from the Redis session cache first
    const cached = await redis.get(`user:${userId}`);

    // If cached profile exists, parse and return it immediately without hitting the database
    if (cached) {
      return JSON.parse(cached);
    }

    // Step 2: Cache miss — query the database for the full profile
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id,
              u.has_smartphone, u.is_active, b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [userId]
    );

    // Step 3: If the user no longer exists in the database, throw a 404 Not Found error
    if (result.rows.length === 0) {
      throw new NotFoundError('User profile not found');
    }

    // Store the database row for readability
    const user = result.rows[0];

    // Prepare the final profile data structure
    const profile: AuthUserResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      branchId: user.branch_id,
      branchName: user.branch_name || (user.role === 'md' ? 'Head Office' : null),
      hasSmartphone: user.has_smartphone,
    };

    await hydrateBranchAdminProfile(db, profile);

    // Step 4: Refresh the Redis cache with the latest database data for 30 minutes
    await redis.setex(`user:${userId}`, 1800, JSON.stringify(profile));

    // Return the fresh user profile
    return profile;
  },

  // ─── LOGOUT ───

  // Clear the user's session from the cache
  async logout(redis: Redis, userId: string): Promise<void> {
    // Delete the session key from Redis; future /me calls will now fallback to the database
    await redis.del(`user:${userId}`);
  },

  // ─── CHANGE PASSWORD ───

  // Verify the current password then replace it and invalidate the session so the user logs in fresh
  async changePassword(db: Pool, redis: Redis, userId: string, input: ChangePasswordInput): Promise<void> {
    // Fetch the stored password hash for this user
    const result = await db.query(
      'SELECT password_hash FROM users WHERE id = $1 AND is_active = true',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    // Verify the caller actually knows their current password before allowing a change
    const isValid = await bcrypt.compare(input.currentPassword, result.rows[0].password_hash);
    if (!isValid) {
      throw new UnauthorizedError('Current password is incorrect', 'INVALID_CREDENTIALS');
    }

    // Hash the new password with the same cost factor used at registration
    const newHash = await bcrypt.hash(input.newPassword, 10);

    // Persist the new hash
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    // Invalidate the Redis session — the user must log in again with their new password
    await redis.del(`user:${userId}`);
    await redis.del(`sess:${userId}`);
  },
};
