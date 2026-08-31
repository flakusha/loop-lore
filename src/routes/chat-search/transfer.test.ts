/**
 * Tests for the chat-transfer route (`POST /api/chats/:id/transfer`).
 *
 * Regression: the route path is `:id` and the handler reads `ctx.params.id`,
 * but the TypeBox params schema originally declared `chatId` — an
 * `id`/`chatId` mismatch that made every request fail Elysia param validation
 * (422). These tests pin the correct `id` param and the move-to-location
 * contract.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { transferRoutes, } from "./transfer";

/**
 * @param db
 * @param userId
 */
function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-chat-transfer", },)
    .derive(() => ({ userId, }))
    // transferRoutes only consumes `database`; config is unused by this route.
    .use(transferRoutes({ database: db, config: {} as unknown as Config, },),) as unknown as Elysia;
}

describe("chat-search transfer", () => {
  let db: Kysely<DB>;
  const userId: string = crypto.randomUUID();
  const worldId: string = crypto.randomUUID();
  const otherWorldId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();
  const locationA: string = crypto.randomUUID();
  const locationB: string = crypto.randomUUID();
  const otherWorldLocation: string = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);

    await insertWorlds(db, userId, "World", { id: worldId, } as never,);
    await insertWorlds(db, userId, "Other World", { id: otherWorldId, } as never,);

    await insertLocations(db, worldId, "Location A", { id: locationA, } as never,);
    await insertLocations(db, worldId, "Location B", { id: locationB, } as never,);
    await insertLocations(db, otherWorldId, "Other Location", { id: otherWorldLocation, } as never,);

    await insertChats(db, "My Chat", userId, { id: chatId, world_id: worldId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("moves a chat to a location in the same world", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locationId: locationA, },),
      },),
    );
    expect(res.status,).toBe(200,);

    const chat = await db.selectFrom("chats",).select("current_location_id",).where("id", "=", chatId,)
      .executeTakeFirst();
    expect(chat?.current_location_id,).toBe(locationA,);
  });

  test("rejects a location in a different world", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locationId: otherWorldLocation, },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("returns 401 without a user", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locationId: locationA, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("rejects a non-uuid chat id (params validation active)", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats/not-a-uuid/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locationId: locationA, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });
});
