// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/users.ts — config-driven user seeding
//
// Creates configured users (TASK-user-seeding-role-expansion) on startup in
// multi-user mode, so operators can stand up a full role matrix for fast
// retesting. Idempotent: users are skipped if the username already exists.
// Each seeded user gets a BCrypt password hash and a mirror actor row (so they
// can own chats/entities via chat_participants.actor_id → actors.id, matching
// the bootstrap-admin pattern in src/db/seed.ts).
//
// Passwords may reference env vars as "${VAR_NAME}" — resolved at seed time
// so plaintext credentials are never committed.

import type { Kysely, } from "kysely";
import type { Config, SeedUserConfig, } from "../config/schema";
import { UserStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { isValidRole, } from "../users/roles";
import { safeJsonStringify, uid, } from "../utils";

/**
 * Resolve "${ENV_VAR}" references in a password string.
 * @param value
 */
export function resolvePasswordReference(value: string,): string {
  const match = /^\$\{([A-Za-z_]\w*)\}$/.exec(value.trim(),);
  if (!match) { return value; }
  const envName = match[1];
  if (!envName) { return value; }
  const resolved = process.env[envName];
  if (!resolved) {
    throw new Error(
      `Seeding password references env var "${envName}" which is not set — ` +
        "refusing to seed with an empty password",
    );
  }
  return resolved;
}

/**
 * Seed the configured users (config.seeding.users) into the database.
 *
 * Idempotent per-username: existing usernames are skipped. Only runs when
 * config.seeding.enabled is true and auth is required (multi-user mode);
 * solo mode always uses its own demo user and ignores seeding config.
 * @param database - Kysely instance
 * @param config - Resolved app config
 * @returns number of users created (0 when skipped or all existed)
 */
export async function seedConfiguredUsers(
  database: Kysely<DB>,
  config: Pick<Config, "seeding" | "auth">,
): Promise<number> {
  const log = getLogger().child({ module: "seed-users", },);
  if (!config.seeding.enabled || config.seeding.users.length === 0) {
    return 0;
  }
  if (!config.auth.required) {
    log.debug("Auth not required (solo mode) — skipping configured user seeding",);
    return 0;
  }

  let created = 0;
  for (const seedUser of config.seeding.users) {
    const createdId = await seedSingleUser(database, seedUser, log,);
    if (createdId) { created += 1; }
  }
  return created;
}

/**
 * Seed one user if it does not already exist. Returns the user id or null.
 * @param database
 * @param seedUser
 * @param log
 */
async function seedSingleUser(
  database: Kysely<DB>,
  seedUser: SeedUserConfig,
  log: Logger,
): Promise<string | null> {
  if (!isValidRole(seedUser.role,)) {
    log.warn(`Skipping seed for "${seedUser.username}": invalid role "${String(seedUser.role,)}"`,);
    return null;
  }

  const existing = await database
    .selectFrom("users",)
    .select("id",)
    .where("username", "=", seedUser.username,)
    .executeTakeFirst();
  if (existing) {
    log.debug(`User "${seedUser.username}" already exists — skipping`,);
    return null;
  }

  let password: string;
  try {
    password = resolvePasswordReference(seedUser.password,);
  } catch (error) {
    log.warn(
      `Skipping seed for "${seedUser.username}": ${error instanceof Error ? error.message : String(error,)}`,
    );
    return null;
  }
  const userId = uid();
  const passwordHash = await Bun.password.hash(password,);

  try {
    await database.transaction().execute(async (trx,): Promise<void> => {
      await trx
        .insertInto("users",)
        .values({
          id: userId,
          username: seedUser.username,
          display_name: seedUser.username,
          password_hash: passwordHash,
          role: seedUser.role,
          status: UserStatus.Active,
          settings: "{}",
        },)
        .execute();

      // Mirror actor so the user can own chats/entities.
      await trx
        .insertInto("actors",)
        .values({
          id: userId,
          actor_type: "user",
          display_name: seedUser.username,
          user_id: userId,
          owner_id: userId,
          agent_type: "none",
          settings: "{}",
          import_spec: "raw",
          data_source_format: "json",
          data_raw: null,
          format_version: 0,
        },)
        .execute();

      await trx
        .insertInto("seed_audit",)
        .values({
          id: uid(),
          seed_type: "user",
          seed_id: userId,
          seeded_by: "system",
          seeded_at: new Date().toISOString(),
          environment: process.env.NODE_ENV ?? "development",
          metadata: (() => {
            const json = safeJsonStringify({ username: seedUser.username, role: seedUser.role, },);
            return json.ok ? json.value : null;
          })(),
        },)
        .execute();
    },);

    log.info(`Seeded user "${seedUser.username}" (role=${seedUser.role})`,);
    return userId;
  } catch (error) {
    log.warn(`Seeding user "${seedUser.username}" failed (race/duplicate)`, { error: String(error,), },);
    return null;
  }
}
