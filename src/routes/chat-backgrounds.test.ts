/**
 * Tests for chat-backgrounds routes — catalog CRUD, per-chat assignment, and
 * the location→background auto-sync (unit + integration through the chats
 * location endpoint).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertChats,
  insertLocations,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { autoSyncChatBackground, chatBackgroundsRoutes, } from "./chat-backgrounds";
import { chatsRoutes, } from "./chats";

/**
 * Insert a background row, setting generated columns directly (bypasses helper typing).
 * @param db
 * @param name
 * @param opts
 * @param opts.priority
 * @param opts.location_id
 */
async function insertBg(
  db: Kysely<DB>,
  name: string,
  opts: { priority?: number; location_id?: string },
): Promise<void> {
  await db
    .insertInto("chat_backgrounds",)
    .values({
      id: uid(),
      name,
      priority: opts.priority ?? 0,
      location_id: opts.location_id ?? null,
    },)
    .execute();
}

/**
 * Insert a location row with an explicit id (bypasses helper typing).
 * @param db
 * @param worldId
 * @param name
 * @param id
 */
async function insertLocationById(db: Kysely<DB>, worldId: string, name: string, id: string,): Promise<void> {
  await db
    .insertInto("locations",)
    .values({ id, world_id: worldId, name, },)
    .execute();
}

const USER_ROLE = "solo";

/**
 * @param db
 * @param userId
 */
function bgApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-bg", },)
    .derive(() => ({ userId, userRole: USER_ROLE, }))
    .use(chatBackgroundsRoutes({ database: db, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param userId
 */
function chatsApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-bg-chats", },)
    .derive(() => ({ userId, userRole: USER_ROLE, }))
    .use(chatsRoutes({ database: db, config: {} as any, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param userId
 */
async function insertUser(db: Kysely<DB>, userId: string,): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: `bg-user-${userId}`,
      display_name: "Bg User",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();
  await db
    .insertInto("actors",)
    .values({
      id: userId,
      actor_type: "user",
      display_name: "Bg User",
      user_id: userId,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("chatBackgroundsRoutes", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let chatId: string;
  let locId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();

    await insertUser(db, userId,);
    await insertWorlds(db, userId, "Bg World", {},);
    worldId = (await db.selectFrom("worlds",).select("id",).where("owner_id", "=", userId,).executeTakeFirst())!.id;
    await insertLocations(db, worldId, "Tavern", {},);
    locId = (await db.selectFrom("locations",).select("id",).where("world_id", "=", worldId,).executeTakeFirst())!.id;
    await insertChats(db, "Bg Chat", userId, { world_id: worldId, },);
    chatId = (await db.selectFrom("chats",).select("id",).where("created_by", "=", userId,).executeTakeFirst())!.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("background catalog CRUD", async () => {
    const app = bgApp(db, userId,);

    const empty = await app.handle(new Request("http://localhost/api/backgrounds",),);
    expect(empty.status,).toBe(200,);
    expect(((await empty.json()).data as unknown[]).length,).toBe(0,);

    const created = await app.handle(
      new Request("http://localhost/api/backgrounds", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Tavern Night", locationId: locId, priority: 5, },),
      },),
    );
    expect(created.status,).toBe(201,);
    const bgId = (await created.json()).id as string;

    const listed = await app.handle(new Request("http://localhost/api/backgrounds",),);
    const listBody = await listed.json();
    expect((listBody.data as { id: string; name: string; location_id: string | null }[])[0],).toMatchObject({
      id: bgId,
      name: "Tavern Night",
      location_id: locId,
    },);
  });

  test("set / get / remove background for a chat", async () => {
    const app = bgApp(db, userId,);
    await insertBg(db, "Forest", { priority: 1, location_id: locId, },);
    const bg =
      (await db.selectFrom("chat_backgrounds",).select("id",).where("name", "=", "Forest",).executeTakeFirst())!.id;

    // Initially none assigned.
    const noneRes = await app.handle(new Request(`http://localhost/api/chats/${chatId}/background`,),);
    expect((await noneRes.json()).data,).toBeNull();

    const bgAssignRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/background`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ backgroundId: bg, },),
      },),
    );
    expect(bgAssignRes.status,).toBe(200,);
    const assignBody = await bgAssignRes.json();
    expect(assignBody.data.id,).toBe(bg,);

    const bgCurrentRes = await app.handle(new Request(`http://localhost/api/chats/${chatId}/background`,),);
    expect((await bgCurrentRes.json()).data.id,).toBe(bg,);

    const delRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/background`, { method: "DELETE", },),
    );
    expect(delRes.status,).toBe(200,);
    const afterDel = await app.handle(new Request(`http://localhost/api/chats/${chatId}/background`,),);
    expect((await afterDel.json()).data,).toBeNull();
  });

  test("autoSyncChatBackground resolves highest-priority location match", async () => {
    const loc2 = uid();
    await insertLocationById(db, worldId, "Cave", loc2,);
    await insertBg(db, "Cave Glow", { priority: 1, location_id: loc2, },);
    await insertBg(db, "Cave Dark", { priority: 9, location_id: loc2, },);

    const resolved = await autoSyncChatBackground(db, chatId, loc2,);
    expect(resolved?.name,).toBe("Cave Glow",);

    const assignment = await db
      .selectFrom("chat_background_assignments",)
      .innerJoin("chat_backgrounds", "chat_backgrounds.id", "chat_background_assignments.background_id",)
      .select("chat_backgrounds.name",)
      .where("chat_background_assignments.chat_id", "=", chatId,)
      .executeTakeFirst();
    expect(assignment?.name,).toBe("Cave Glow",);
  });

  test("autoSync returns null when no location-scoped background matches", async () => {
    const farAway = uid();
    await insertLocationById(db, worldId, "Far Away", farAway,);
    const resolved = await autoSyncChatBackground(db, chatId, farAway,);
    expect(resolved,).toBeNull();
  });

  test("integration: PUT /api/chats/:id/location auto-syncs background", async () => {
    const app = chatsApp(db, userId,);

    const newLoc = uid();
    await insertLocationById(db, worldId, "Meadow", newLoc,);
    await insertBg(db, "Meadow Breeze", { priority: 2, location_id: newLoc, },);

    const locationRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/location`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locationId: newLoc, },),
      },),
    );
    expect(locationRes.status,).toBe(200,);

    const chatRow = await db.selectFrom("chats",).select("current_location_id",).where("id", "=", chatId,)
      .executeTakeFirst();
    expect(chatRow?.current_location_id,).toBe(newLoc,);

    const bgRes = await bgApp(db, userId,).handle(new Request(`http://localhost/api/chats/${chatId}/background`,),);
    const bgBody = await bgRes.json();
    expect(bgBody.data?.name,).toBe("Meadow Breeze",);
  });
});
