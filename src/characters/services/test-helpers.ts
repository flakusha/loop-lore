/**
 * Shared test helpers for character services tests.
 *
 * Creates test users, actors, worlds, and locations with
 * proper FK relationships.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Create a test user and actor, return actorId */
export async function createTestActors(
  db: Kysely<DB>,
  actorId = "test-actor-001",
): Promise<{ userId: string; actorId: string }> {
  const userId = "test-user";
  const existing = await db.selectFrom("users",).where("id", "=", userId,).select("id",).executeTakeFirst();
  if (!existing) {
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: "testuser",
        display_name: "Test User",
        password_hash: "hash",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
  }

  await db
    .insertInto("actors",)
    .values({
      id: actorId,
      actor_type: "character",
      display_name: "Test Character",
      user_id: userId,
      owner_id: userId,
      agent_type: "ai",
      description: "Test character",
      system_prompt: null,
      settings: "{}",
      import_spec: "raw",
      data_source_format: "json",
      data_raw: null,
      format_version: 0,
    },)
    .execute();

  return { userId, actorId, };
}

/** Create a test world, return worldId */
export async function createTestWorld(
  db: Kysely<DB>,
  worldId: string,
): Promise<string> {
  const existing = await db.selectFrom("worlds",).where("id", "=", worldId,).select("id",).executeTakeFirst();
  if (!existing) {
    await db
      .insertInto("worlds",)
      .values({
        id: worldId,
        name: `World ${worldId}`,
        owner_id: "test-user",
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();
  }

  return worldId;
}

/** Create a test location, return locationId */
export async function createTestLocation(
  db: Kysely<DB>,
  worldId: string,
  locationId: string,
): Promise<string> {
  const existing = await db.selectFrom("locations",).where("id", "=", locationId,).select("id",).executeTakeFirst();
  if (!existing) {
    await db
      .insertInto("locations",)
      .values({
        id: locationId,
        world_id: worldId,
        name: `Location ${locationId}`,
        connections: "[]",
      },)
      .execute();
  }

  return locationId;
}
