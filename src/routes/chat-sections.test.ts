/**
 * Tests for chat-sections routes — section CRUD + message assignment + reorder.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertChats,
  insertLocations,
  insertMessages,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { chatSectionsRoutes, } from "./chat-sections";

const USER_ROLE = "solo";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string = USER_ROLE,): Elysia {
  return new Elysia({ name: "test-chat-sections", },)
    .derive(() => ({ userId, userRole, }))
    .use(chatSectionsRoutes({ database: db, config: {} as any, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param userId
 * @param username
 */
async function insertUser(db: Kysely<DB>, userId: string, username: string,): Promise<void> {
  await db
    .insertInto("users",)
    .values({
      id: userId,
      username,
      display_name: "Section User",
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
      display_name: "Section User",
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

describe("chatSectionsRoutes", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let chatId: string;
  let locId: string;
  let messageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();

    await insertUser(db, userId, `section-user-${userId}`,);
    await insertWorlds(db, userId, "Section World", {},);
    worldId = (await db.selectFrom("worlds",).select("id",).where("owner_id", "=", userId,).executeTakeFirst())!.id;
    await insertLocations(db, worldId, "Tavern", { description: "A cozy tavern", },);
    locId = (await db.selectFrom("locations",).select("id",).where("world_id", "=", worldId,).executeTakeFirst())!.id;
    await insertChats(db, "Section Chat", userId, { world_id: worldId, current_location_id: locId, },);
    chatId = (await db.selectFrom("chats",).select("id",).where("created_by", "=", userId,).executeTakeFirst())!.id;
    await insertMessages(db, chatId, userId, MessageRole.User, "hello", {},);
    messageId = (await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst())!.id;
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("GET /api/chats/:id/sections returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/chats/x/sections",),);
    expect(res.status,).toBe(401,);
  });

  test("create → list → patch → assign message → reorder → delete", async () => {
    const app = createApp(db, userId,);

    const created = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "Entering the Forest", locationId: locId, },),
      },),
    );
    expect(created.status,).toBe(201,);
    const sectionId = (await created.json()).id as string;

    const created2 = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "The Clearing", },),
      },),
    );
    expect(created2.status,).toBe(201,);
    const sectionId2 = (await created2.json()).id as string;

    const listed = await app.handle(new Request(`http://localhost/api/chats/${chatId}/sections`,),);
    expect(listed.status,).toBe(200,);
    const listedRows = (await listed.json()).data as { label: string; location_id: string | null }[];
    const labels = listedRows.map((s,) => s.label);
    expect(labels,).toEqual(["Entering the Forest", "The Clearing",],);
    expect(listedRows[0]?.location_id,).toBe(locId,);

    const patched = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "The Dark Forest", },),
      },),
    );
    expect(patched.status,).toBe(200,);

    const assign = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages/${messageId}/section`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ sectionId, },),
      },),
    );
    expect(assign.status,).toBe(200,);
    const msgRow = await db.selectFrom("messages",).select("section_id",).where("id", "=", messageId,)
      .executeTakeFirst();
    expect(msgRow?.section_id,).toBe(sectionId,);

    const reordered = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ sectionIds: [sectionId2, sectionId,], },),
      },),
    );
    expect(reordered.status,).toBe(200,);
    const reListed = await app.handle(new Request(`http://localhost/api/chats/${chatId}/sections`,),);
    const reLabels = ((await reListed.json()).data as { label: string }[]).map((s,) => s.label);
    expect(reLabels,).toEqual(["The Clearing", "The Dark Forest",],);

    const deleted = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/${sectionId2}`, { method: "DELETE", },),
    );
    expect(deleted.status,).toBe(200,);
    const afterDel = await app.handle(new Request(`http://localhost/api/chats/${chatId}/sections`,),);
    expect(((await afterDel.json()).data as unknown[]).length,).toBe(1,);
  });

  test("clear a message's section with sectionId null", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages/${messageId}/section`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ sectionId: null, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const msgRow = await db.selectFrom("messages",).select("section_id",).where("id", "=", messageId,)
      .executeTakeFirst();
    expect(msgRow?.section_id,).toBeNull();
  });

  test("non-owner is denied (404)", async () => {
    const otherUser = uid();
    await insertUser(db, otherUser, `other-${otherUser}`,);
    const app = createApp(db, otherUser, "user",);
    const res = await app.handle(new Request(`http://localhost/api/chats/${chatId}/sections`,),);
    expect(res.status,).toBe(404,);
  });

  test("create section requires label", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("bulk assign-all moves every message onto the target section", async () => {
    const app = createApp(db, userId,);
    await insertMessages(db, chatId, userId, MessageRole.User, "second message", {},);
    const created = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "Bulk Target", },),
      },),
    );
    expect(created.status,).toBe(201,);
    const sectionId = (await created.json()).id as string;

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/${sectionId}/assign-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean; count: number };
    expect(body.ok,).toBe(true,);
    expect(body.count,).toBeGreaterThanOrEqual(2,);

    const rows = await db.selectFrom("messages",).select("section_id",).where("chat_id", "=", chatId,).execute();
    for (const row of rows) { expect(row.section_id,).toBe(sectionId,); }
  });

  test("bulk assign with fromSectionId narrows the move", async () => {
    const app = createApp(db, userId,);
    const srcRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "Source", },),
      },),
    );
    const dstRes = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "Destination", },),
      },),
    );
    const src = (await srcRes.json()) as { id: string };
    const dst = (await dstRes.json()) as { id: string };

    await db
      .updateTable("messages",)
      .set({ section_id: src.id, },)
      .where("chat_id", "=", chatId,)
      .execute();

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/${dst.id}/assign-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ fromSectionId: src.id, },),
      },),
    );
    expect(res.status,).toBe(200,);

    const rows = await db.selectFrom("messages",).select("section_id",).where("chat_id", "=", chatId,).execute();
    for (const row of rows) { expect(row.section_id,).toBe(dst.id,); }
  });

  test("bulk assign rejects a source section from another chat", async () => {
    const app = createApp(db, userId,);
    const other = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "Other", },),
      },),
    );
    const otherId = (await other.json()).id as string;
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/${otherId}/assign-all`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ fromSectionId: "missing-section", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("narrative inserts a system narration message bound to the section", async () => {
    const app = createApp(db, userId,);
    const created = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ label: "Narrative Target", },),
      },),
    );
    expect(created.status,).toBe(201,);
    const sectionId = (await created.json()).id as string;

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/sections/${sectionId}/narrative`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ text: "The party rides north.", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean; id: string; section_id: string };
    expect(body.ok,).toBe(true,);
    expect(body.section_id,).toBe(sectionId,);

    const row = await db.selectFrom("messages",).select(["role", "content_type", "content", "section_id",],)
      .where("id", "=", body.id,).executeTakeFirst();
    expect(row?.role,).toBe("system",);
    expect(row?.content_type,).toBe("narration",);
    expect(row?.content,).toBe("The party rides north.",);
    expect(row?.section_id,).toBe(sectionId,);
  });
});
