/**
 * Route tests for actor-memories — verifies that the `scope` field
 * (character/assistant/world) is accepted on create, persisted, and echoed
 * back, so the memory-selection UI's three tabs populate from one actor's
 * memory list.
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
 */
function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-memories-scope", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(actorMemoriesRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

describe("actorMemoriesRoutes — scope persistence", () => {
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
        username: `u-${userId}`,
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

  test("POST {scope:assistant} persists and GET echoes scope", async () => {
    const app = createApp(db, userId,);
    const memCreateRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "assistant mem", memoryType: "episodic", scope: "assistant", },),
      },),
    );
    expect(memCreateRes.status,).toBe(201,);
    const created = (await memCreateRes.json()) as { id: string; scope: string };
    expect(created.scope,).toBe("assistant",);

    const dbRow = await db
      .selectFrom("actor_memories",)
      .select("scope",)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(dbRow.scope,).toBe("assistant",);

    const memGetRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${created.id}`,),
    );
    const memGet = (await memGetRes.json()) as { scope: string };
    expect(memGet.scope,).toBe("assistant",);
  });

  test("POST without scope defaults to character", async () => {
    const app = createApp(db, userId,);
    const memCreateRes = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "char mem", memoryType: "episodic", },),
      },),
    );
    const created = (await memCreateRes.json()) as { id: string };
    const dbRow = await db
      .selectFrom("actor_memories",)
      .select("scope",)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(dbRow.scope,).toBe("character",);
  });
});
