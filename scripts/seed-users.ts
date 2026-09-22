// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * scripts/seed-users.ts — provisioning script for demo user accounts.
 *
 * TASK-032: bootstraps one account per role (admin / moderator / contributor /
 * guest) with deterministic credentials. Run via `bun run seed:users`.
 *
 * Idempotent: re-runs upsert via `ON CONFLICT DO NOTHING` on the username key.
 */

import type { Kysely, } from "kysely";
import { ActorType, AgentType, UserRole, UserStatus, } from "../src/db/enums";
import type { DB, } from "../src/db/schema";

/** bcrypt(cost 4) hash of "password". Deterministic across seeds. */
const PASSWORD_HASH = "$2b$04$anSd/tkwm/jhqfjGUZOdkurfsavDtfDeUM7dwdc/MQY.4upTC8ikG";
/** bcrypt(cost 4) hash of "admin-password". Distinct from the default hash. */
const ADMIN_HASH = "$2b$04$8iIP.O0YTEEoM56xn17NiutFxusLfJ7L/DTHZhA2agrM4gXHLD5Uq";

/** Demo accounts provisioned by this script. */
export const SEED_USERS = [
  {
    id: "seed-admin-1",
    username: "admin",
    display_name: "Admin",
    password_hash: ADMIN_HASH,
    role: UserRole.Admin,
  },
  {
    id: "seed-mod-1",
    username: "moderator",
    display_name: "Moderator",
    password_hash: PASSWORD_HASH,
    role: UserRole.Moderator,
  },
  {
    id: "seed-contributor-1",
    username: "contributor",
    display_name: "Contributor",
    password_hash: PASSWORD_HASH,
    role: UserRole.Creator,
  },
  {
    id: "seed-guest-1",
    username: "guest",
    display_name: "Guest",
    password_hash: PASSWORD_HASH,
    role: UserRole.Guest,
  },
] as const;

/**
 * Insert the demo accounts + matching actor rows.
 * @param db
 */
export async function seedUsers(db: Kysely<DB>,): Promise<void> {
  await db
    .insertInto("users",)
    .values(
      SEED_USERS.map((u,) => ({
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        password_hash: u.password_hash,
        role: u.role,
        status: UserStatus.Active,
        settings: "{}",
      })),
    )
    .onConflict((oc,) => oc.column("username",).doNothing())
    .execute();

  await db
    .insertInto("actors",)
    .values(
      SEED_USERS.map((u,) => ({
        id: u.id,
        actor_type: ActorType.User,
        display_name: u.display_name,
        user_id: u.id,
        owner_id: u.id,
        agent_type: AgentType.None,
        settings: "{}",
        import_spec: "raw",
      })),
    )
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();
}

/** Module guard — only run when invoked directly. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const { createTestDb, } = await import("../src/test-utils/create-test-db");
  const db = await createTestDb();
  try {
    await seedUsers(db,);
    console.log("Users seeded.",);
  } finally {
    await db.destroy();
  }
}
