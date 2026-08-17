// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/* eslint-disable sonarjs/no-hardcoded-passwords -- passwords are test fixtures */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../config/schema";
import { UserRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { resolvePasswordReference, seedConfiguredUsers, } from "./users";

/** Complete, valid AuthConfig for multi-user tests. */
function auth(required: boolean,): AuthConfig {
  return {
    required,
    registrationOpen: true,
    sessionTimeoutHours: 24,
    maxSessionsPerUser: 10,
    demoUsername: "demo",
    demoAutoSetup: false,
  };
}

describe("resolvePasswordReference", () => {
  test("returns literal password unchanged when not an env reference", () => {
    expect(resolvePasswordReference("plain-password",),).toBe("plain-password",);
    expect(resolvePasswordReference("",),).toBe("",);
    expect(resolvePasswordReference("mix:${VAR}and-text",),).toBe("mix:${VAR}and-text",);
  });

  test("resolves a ${ENV_VAR} reference", () => {
    process.env.TEST_SEED_PW = "resolved-value";
    expect(resolvePasswordReference("${TEST_SEED_PW}",),).toBe("resolved-value",);
  });

  test("throws when referenced env var is unset", () => {
    delete process.env.TEST_UNSET_SEED_PW;
    expect(() => resolvePasswordReference("${TEST_UNSET_SEED_PW}",)).toThrow(/not set/,);
  });
});

describe("seedConfiguredUsers", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("creates configured users with role + mirror actor + audit row", async () => {
    const created = await seedConfiguredUsers(db, {
      seeding: {
        enabled: true,
        users: [
          { username: "moderator1", password: "mod-pw", role: UserRole.Moderator, },
          { username: "creator1", password: "creator-pw", role: UserRole.Creator, },
        ],
      },
      auth: auth(true,),
    },);

    expect(created,).toBe(2,);

    const mod = await db
      .selectFrom("users",)
      .select(["id", "username", "role", "password_hash",],)
      .where("username", "=", "moderator1",)
      .executeTakeFirst();
    expect(mod?.role,).toBe("moderator",);
    expect(mod?.password_hash,).toBeDefined();
    expect(mod?.password_hash,).not.toBe("mod-pw",);

    const modActor = await db
      .selectFrom("actors",)
      .select("display_name",)
      .where("display_name", "=", "moderator1",)
      .executeTakeFirst();
    expect(modActor,).toBeDefined();

    const audit = await db
      .selectFrom("seed_audit",)
      .selectAll()
      .where("seed_type", "=", "user",)
      .execute();
    expect(audit.length,).toBe(2,);
    expect(audit.some((a,) => a.seed_id === mod?.id || a.metadata?.includes("moderator1",)),).toBe(true,);
  });

  test("is idempotent — existing users skipped on re-run", async () => {
    const created = await seedConfiguredUsers(db, {
      seeding: {
        enabled: true,
        users: [{ username: "moderator1", password: "mod-pw", role: UserRole.Moderator, },],
      },
      auth: auth(true,),
    },);
    expect(created,).toBe(0,);

    const count = await db
      .selectFrom("users",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("username", "=", "moderator1",)
      .executeTakeFirst();
    expect(count?.n,).toBe(1,);
  });

  test("skips entirely when seeding disabled", async () => {
    const created = await seedConfiguredUsers(db, {
      seeding: {
        enabled: false,
        users: [{ username: "nobody", password: "pw", role: UserRole.Player, },],
      },
      auth: auth(true,),
    },);
    expect(created,).toBe(0,);
  });

  test("skips in solo mode (auth not required)", async () => {
    const created = await seedConfiguredUsers(db, {
      seeding: {
        enabled: true,
        users: [{ username: "solo-extra", password: "pw", role: UserRole.Player, },],
      },
      auth: auth(false,),
    },);
    expect(created,).toBe(0,);

    const exists = await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "solo-extra",)
      .executeTakeFirst();
    expect(exists,).toBeUndefined();
  });

  test("skips invalid roles with a warning, no crash", async () => {
    const created = await seedConfiguredUsers(db, {
      seeding: {
        enabled: true,
        users: [{ username: "badrole", password: "pw", role: "superadmin" as UserRole, },],
      },
      auth: auth(true,),
    },);
    expect(created,).toBe(0,);

    const exists = await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "badrole",)
      .executeTakeFirst();
    expect(exists,).toBeUndefined();
  });

  test("skips a user whose env-var password is unset, without crashing", async () => {
    delete process.env.SEED_TEST_MISSING_PW;
    const created = await seedConfiguredUsers(db, {
      seeding: {
        enabled: true,
        users: [{ username: "noenv", password: "${SEED_TEST_MISSING_PW}", role: UserRole.Player, },],
      },
      auth: auth(true,),
    },);
    expect(created,).toBe(0,);

    const exists = await db
      .selectFrom("users",)
      .select("id",)
      .where("username", "=", "noenv",)
      .executeTakeFirst();
    expect(exists,).toBeUndefined();
  });
});
