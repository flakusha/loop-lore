/**
 * Route tests for actor-memories — verifies that the `pinned` flag is
 * persisted through POST (create) and PUT (update), so the memory-selection
 * UI's pin control survives a round-trip to the backend.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { actorMemoriesRoutes, } from "./actor-memories";

const mockConfig = {} as any;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null = "user",): Elysia {
  return new Elysia({ name: "test-memories", },)
    .derive(() => ({ userId, userRole, }))
    .use(actorMemoriesRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

describe("actorMemoriesRoutes — pinned persistence", () => {
  let db: Kysely<DB>;
  let actorId: string;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    actorId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: userId,
        owner_id: userId,
        agent_type: "ai",
        settings: "{}",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("POST then PUT {pinned:true} persists the pin (round-trip)", async () => {
    const app = createApp(db, userId,);

    const memCreateRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "A memory to pin", memoryType: "episodic", },),
      },),
    );
    expect(memCreateRes.status,).toBe(201,);
    const created = (await memCreateRes.json()) as { id: string; pinned: boolean };
    expect(created.pinned,).toBe(false,);

    const putRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ pinned: true, },),
      },),
    );
    expect(putRes.status,).toBe(200,);

    // Verify persistence directly in the DB (deterministic, independent of response shape).
    const dbRow = await db
      .selectFrom("actor_memories",)
      .select("pinned",)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(dbRow.pinned,).toBe("pinned",);

    // And via GET response shape.
    const memGetRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${created.id}`,),
    );
    const fetched = (await memGetRes.json()) as { pinned: boolean };
    expect(fetched.pinned,).toBe(true,);
  });

  test("POST {pinned:true} then PUT {pinned:false} clears the pin", async () => {
    const app = createApp(db, userId,);

    const memCreateRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Another memory", memoryType: "episodic", pinned: true, },),
      },),
    );
    const created = (await memCreateRes.json()) as { id: string };
    const initialRow = await db
      .selectFrom("actor_memories",)
      .select("pinned",)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(initialRow.pinned,).toBe("pinned",);

    const putRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ pinned: false, },),
      },),
    );
    expect(putRes.status,).toBe(200,);

    const clearedRow = await db
      .selectFrom("actor_memories",)
      .select("pinned",)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(clearedRow.pinned,).toBe("unpinned",);
  });
});
