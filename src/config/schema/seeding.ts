// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/seeding.ts — config-driven user + content seeding section
//
// Enables seeding additional users with specific roles on startup, for fast
// retesting across permission tiers (TASK-user-seeding-role-expansion), plus
// seedable content (characters / worlds / chats) owned by those users
// (TASK-content-seeding-environment-overrides).
//
// Users are created idempotently (skipped if the username already exists) with
// a BCrypt password hash and a mirror actor row (so they can own chats/entities
// via chat_participants.actor_id → actors.id, matching the bootstrap-admin
// pattern in src/db/seed.ts).
//
// Passwords may reference env vars as "${VAR_NAME}" — resolved at seed time.
//
// Content seeding creates characters (as actors), worlds (+ locations), and
// chats (with participants), all owned by prepopulated users referenced by
// username. Environment-specific overrides (seeding.environments[<NODE_ENV>])
// may replace the base users / seedData for a given environment.

import type { UserRole, } from "../../db/enums-core/users";

/** */
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

/** A seeded location within a seeded world (optional detail). */
export interface SeedLocation {
  /** Location name (unique per world). */
  name: string;
  /** Short description / flavor text. */
  description?: string;
}

/** A seeded character, stored as an `actors` row owned by a seeded user. */
export interface SeedCharacter {
  /** Display name of the character. */
  name: string;
  /** Username of the owner (must be seeded via seeding.users or already exist). */
  owner: string;
  /** Short description / hook. */
  description?: string;
  /** Free-form personality tags, stored as a JSON array. */
  personality?: string[];
  /** Visibility — "private" (default) or "public". */
  visibility?: "private" | "public";
}

/** A seeded world, owned by a seeded user. */
export interface SeedWorld {
  /** World name (unique per owner). */
  name: string;
  /** Username of the creator/owner. */
  creator: string;
  /** World description. */
  description?: string;
  /** Visibility — "private" (default) or "public". */
  visibility?: "private" | "public";
  /** Optional child locations to seed inside the world. */
  locations?: SeedLocation[];
}

/** A seeded chat linking seeded users as participants. */
export interface SeedChat {
  /** Participant usernames (resolved to their mirror actor rows). */
  participants: string[];
  /** "direct" (default, 2 participants) or "group". */
  type?: "direct" | "group";
  /** Optional display name; defaults to joined participant usernames. */
  name?: string;
}

/** Seedable content definitions, keyed by entity type. */
export interface SeedData {
  /** Seed characters (actors rows) before chats so they can participate. */
  characters?: SeedCharacter[];
  /** Seed worlds + optional child locations. */
  worlds?: SeedWorld[];
  /** Seed chats with the given participants. */
  chats?: SeedChat[];
}

/** Per-environment override — replaces the base field when present. */
export interface EnvironmentOverride {
  /** Replaces seeding.users entirely for this environment. */
  users?: SeedUserConfig[];
  /** Replaces seeding.seedData entirely for this environment. */
  seedData?: SeedData;
}

/** */
export interface SeedingConfig {
  /** Master switch — if false, no configured users/content are seeded. */
  enabled: boolean;
  /** Users to seed on startup (multi-user mode). */
  users: SeedUserConfig[];
  /** Content to seed on startup (owned by prepopulated users). */
  seedData?: SeedData;
  /**
   * Per-environment overrides keyed by NODE_ENV value (e.g. "development",
   * "testing", "staging"). When an entry matches the current NODE_ENV, its
   * `users` / `seedData` replace the base config fields when present.
   */
  environments?: Record<string, EnvironmentOverride>;
}
