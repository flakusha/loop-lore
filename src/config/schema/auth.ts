// src/config/schema/auth.ts — Authentication / session config type

export interface AuthConfig {
  /** true = remote multi-user auth required, false = demo/solo mode (skip auth) */
  required: boolean;
  /** Allow new user registration */
  registrationOpen: boolean;
  /** Idle session timeout in hours */
  sessionTimeoutHours: number;
  /** Max simultaneous sessions per user */
  maxSessionsPerUser: number;
  /** Demo username (auto-created when auth.required=false) */
  demoUsername: string;
  /** Auto-create sample data on first demo run */
  demoAutoSetup: boolean;
  /** Bootstrap admin username (multi-user mode). Set via config or AUTH_ADMIN_USERNAME env. */
  adminUsername?: string;
  /** Bootstrap admin password (multi-user mode). Env-only preferred; AUTH_ADMIN_PASSWORD. Never commit. */
  adminPassword?: string;
  /** HMAC-SHA256 secret for JWT signing. Required when auth.required=true. Env-only: AUTH_JWT_SECRET. */
  jwtSecret?: string;
  /** JWT token expiry in seconds (default: 86400 = 24h) */
  jwtExpiresIn?: number;
}
