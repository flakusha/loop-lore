// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/seeding.ts — config-driven user seeding section
//
// Enables seeding additional users with specific roles on startup, for fast
// retesting across permission tiers (TASK-user-seeding-role-expansion).
//
// Users are created idempotently (skipped if the username already exists) with
// a BCrypt password hash and a mirror actor row (so they can own chats/entities
// via chat_participants.actor_id → actors.id, matching the bootstrap-admin
// pattern in src/db/seed.ts).
//
// Passwords may reference env vars as "${VAR_NAME}" — resolved at seed time.

import type { UserRole, } from "../../db/enums-core/users";

export interface SeedUserConfig {
  /** Unique login username. Skipped if already present. */
  username: string;
  /**
   * Password, or "${ENV_VAR}" to resolve from the environment at seed time.
   * Env-only recommended for real passwords; never commit plaintext.
   */
  password: string;
  /** Role to assign. Must be a valid UserRole. */
  role: UserRole;
  /** Seed a mirror actor row (default true — required to own chats/entities). */
  seedActor?: boolean;
}

export interface SeedingConfig {
  /** Master switch — if false, no configured users are seeded. */
  enabled: boolean;
  /** Users to seed on startup (multi-user mode). */
  users: SeedUserConfig[];
}
