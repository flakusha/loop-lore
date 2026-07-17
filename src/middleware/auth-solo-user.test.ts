/**
 * Regression tests for getOrCreateSoloUserForAuth.
 *
 * The solo/demo user MUST have a corresponding actor row, because chat
 * creation inserts the chat owner as `chat_participants.actor_id = userId`,
 * and `chat_participants.actor_id` has a FOREIGN KEY to `actors.id`. If the
 * actor is missing, creating any chat fails with "FOREIGN KEY constraint failed".
 *
 * This covers the real bug: src/db/seed.ts creates the demo USER but not its
 * actor, and getOrCreateSoloUserForAuth previously returned early when the
 * user already existed — skipping actor creation.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { createTestDb } from "../test-utils/create-test-db";
import { getOrCreateSoloUserForAuth, resetSoloUserCache } from "./auth";
import { createLogger } from "../logger";
import { uid } from "../utils";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";

describe("getOrCreateSoloUserForAuth — actor creation", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    createLogger({ level: "warn" });
    ({ db } = await createTestDb());
  });

  afterEach(async () => {
    resetSoloUserCache();
    await db.destroy();
  });

  test("creates a matching actor for a freshly created solo user", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo");
    expect(solo).not.toBeNull();

    const actor = await db.selectFrom("actors").selectAll().where("id", "=", solo!.id).executeTakeFirst();
    expect(actor).toBeDefined();
    expect(actor?.actor_type).toBe("user");
  });

  test("ensures actor exists when solo user was pre-seeded without one", async () => {
    // Simulate src/db/seed.ts: it creates the demo USER but not its actor.
    const preSeededId = uid();
    await db
      .insertInto("users")
      .values({
        id: preSeededId,
        username: "demo",
        display_name: "Demo",
        role: "solo",
        status: "active",
        settings: "{}",
      })
      .execute();

    // A solo user already exists, so getOrCreateSoloUserForAuth resolves it
    // (does NOT create a new user) but MUST create the missing actor.
    const solo = await getOrCreateSoloUserForAuth(db, "demo");
    expect(solo?.id).toBe(preSeededId);

    const actor = await db.selectFrom("actors").selectAll().where("id", "=", preSeededId).executeTakeFirst();
    expect(actor).toBeDefined();
  });

  test("is idempotent — the actor is created exactly once across calls", async () => {
    const solo = await getOrCreateSoloUserForAuth(db, "demo");
    await getOrCreateSoloUserForAuth(db, "demo");

    const actorCount = await db
      .selectFrom("actors")
      .select(db.fn.countAll<number>().as("n"))
      .where("id", "=", solo!.id)
      .executeTakeFirst();
    expect(actorCount?.n).toBe(1);
  });
});
