// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/auth.ts — Auth config section

import type { AuthConfig, } from "../schema";

export const AUTH_DEFAULTS = {
  required: false,
  registrationOpen: true,
  sessionTimeoutHours: 24,
  maxSessionsPerUser: 10,
  demoUsername: "demo",
  demoAutoSetup: true,
  adminUsername: "",
  adminPassword: "",
  jwtSecret: "",
  csrfSecret: "",
  jwtExpiresIn: 86_400,
  legacyOpaqueTokenFallback: false,
} satisfies AuthConfig;

export class AuthSection implements AuthConfig {
  required = AUTH_DEFAULTS.required;
  registrationOpen = AUTH_DEFAULTS.registrationOpen;
  sessionTimeoutHours = AUTH_DEFAULTS.sessionTimeoutHours;
  maxSessionsPerUser = AUTH_DEFAULTS.maxSessionsPerUser;
  demoUsername = AUTH_DEFAULTS.demoUsername;
  demoAutoSetup = AUTH_DEFAULTS.demoAutoSetup;
  adminUsername = AUTH_DEFAULTS.adminUsername;
  adminPassword = AUTH_DEFAULTS.adminPassword;
  jwtSecret = AUTH_DEFAULTS.jwtSecret;
  csrfSecret = AUTH_DEFAULTS.csrfSecret;
  jwtExpiresIn = AUTH_DEFAULTS.jwtExpiresIn;
  legacyOpaqueTokenFallback = AUTH_DEFAULTS.legacyOpaqueTokenFallback;

  constructor(overrides?: Partial<AuthConfig>,) {
    Object.assign(this, overrides,);
  }
}

export const authMeta = {
  type: "object" as const,
  description: "Authentication configuration",
  properties: {
    required: {
      type: "boolean",
      default: AUTH_DEFAULTS.required,
      description: "Require remote multi-user auth",
    },
    registrationOpen: {
      type: "boolean",
      default: AUTH_DEFAULTS.registrationOpen,
      description: "Allow new user registration",
    },
    sessionTimeoutHours: {
      type: "integer",
      default: AUTH_DEFAULTS.sessionTimeoutHours,
      description: "Idle session timeout in hours",
    },
    maxSessionsPerUser: {
      type: "integer",
      default: AUTH_DEFAULTS.maxSessionsPerUser,
      description: "Max simultaneous sessions per user",
    },
    demoUsername: { type: "string", default: AUTH_DEFAULTS.demoUsername, description: "Demo username", },
    demoAutoSetup: {
      type: "boolean",
      default: AUTH_DEFAULTS.demoAutoSetup,
      description: "Auto-create sample data on first demo run",
    },
    adminUsername: {
      type: "string",
      default: AUTH_DEFAULTS.adminUsername,
      description: "Bootstrap admin username (multi-user mode). Set via config or AUTH_ADMIN_USERNAME env.",
    },
    adminPassword: {
      type: "string",
      default: AUTH_DEFAULTS.adminPassword,
      description: "Bootstrap admin password (multi-user mode). Env-only preferred: AUTH_ADMIN_PASSWORD. Never commit.",
    },
    jwtSecret: {
      type: "string",
      default: AUTH_DEFAULTS.jwtSecret,
      description: "HMAC-SHA256 secret for JWT signing. Env-only: AUTH_JWT_SECRET. Required when auth.required=true.",
    },
    csrfSecret: {
      type: "string",
      default: AUTH_DEFAULTS.csrfSecret,
      description: "HMAC secret for Bun.CSRF token issuance + verification. " +
        "Env-only: AUTH_CSRF_SECRET. Falls back to auth.jwtSecret when unset.",
    },
    jwtExpiresIn: {
      type: "integer",
      default: AUTH_DEFAULTS.jwtExpiresIn,
      description: "JWT token expiry in seconds (default: 86400 = 24h)",
    },
    legacyOpaqueTokenFallback: {
      type: "boolean",
      default: AUTH_DEFAULTS.legacyOpaqueTokenFallback,
      description: "Permit sha256(token) lookup when JWT verify fails. Default false. " +
        "Set AUTH_LEGACY_OPAQUE_TOKEN_FALLBACK=1 only for one-shot legacy migrations.",
    },
  },
  required: [
    "required",
    "registrationOpen",
    "sessionTimeoutHours",
    "maxSessionsPerUser",
    "demoUsername",
    "demoAutoSetup",
  ] as const,
};
