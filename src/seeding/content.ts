// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/content.ts — content seeding orchestration + environment overrides
//
// Drives character / world / chat seeding once users are prepopulated, and
// applies per-environment overrides (seeding.environments[<NODE_ENV>]) so
// operators can stand up an environment-specific data set (e.g. a distinct
// user roster + seed content for "development" vs "staging").
//
// Override semantics: when an environments entry matches the current NODE_ENV,
// its `users` and `seedData` REPLACE the base config fields respectively (a
// missing field leaves the base in place).

import type { Kysely, } from "kysely";
import type { SeedingConfig, } from "../config/schema";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { seedCharacters, } from "./characters";
import { seedChats, } from "./chats";
import { seedWorlds, } from "./worlds";

/**
 * Apply environment-specific seeding overrides for the current NODE_ENV.
 *
 * When `seeding.environments[NODE_ENV]` exists, its `users` and `seedData`
 * replace the corresponding base fields (when present). Returns a new
 * SeedingConfig; the original is never mutated.
 * @param seeding - Resolved base seeding config
 * @param envName - Environment name (defaults to process.env.NODE_ENV ?? "development")
 * @returns The effective seeding config for the current environment
 */
export function applyEnvironmentOverrides(
  seeding: SeedingConfig,
  envName: string = process.env.NODE_ENV ?? "development",
): SeedingConfig {
  const override = seeding.environments?.[envName];
  if (!override) { return seeding; }
  return {
    ...seeding,
    users: override.users ?? seeding.users,
    seedData: override.seedData ?? seeding.seedData,
  };
}

/**
 * Seed configured content (characters / worlds / chats) after users are
 * prepopulated. Idempotent per entity. Only runs when seeding is enabled and
 * auth is required (multi-user mode).
 * @param database - Kysely instance
 * @param seeding - Effective seeding config (environment overrides applied)
 * @param authRequired - Whether multi-user auth is on (solo mode seeds nothing)
 * @returns number of content entities created (0 when skipped)
 */
export async function seedConfiguredContent(
  database: Kysely<DB>,
  seeding: SeedingConfig,
  authRequired: boolean,
): Promise<number> {
  const log = getLogger().child({ module: "seed-content", },);
  const data = seeding.seedData;
  if (!seeding.enabled || !data) { return 0; }
  if (!authRequired) {
    log.debug("Auth not required (solo mode) — skipping content seeding",);
    return 0;
  }
  if (!data.characters?.length && !data.worlds?.length && !data.chats?.length) {
    return 0;
  }

  const userById = await buildUserById(database,);
  let created = 0;
  if (data.characters?.length) {
    created += await seedCharacters(database, data.characters, userById, log,);
  }
  if (data.worlds?.length) {
    created += await seedWorlds(database, data.worlds, userById, log,);
  }
  if (data.chats?.length) {
    created += await seedChats(database, data.chats, userById, log,);
  }
  return created;
}

/**
 * Build a username → user id map from the DB for owner/participant resolution.
 * @param database
 */
async function buildUserById(database: Kysely<DB>,): Promise<Map<string, string>> {
  const rows = await database
    .selectFrom("users",)
    .select(["id", "username",],)
    .execute();
  const map = new Map<string, string>();
  for (const row of rows) { map.set(row.username, row.id,); }
  return map;
}
