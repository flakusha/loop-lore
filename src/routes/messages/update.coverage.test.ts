// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for message update routes (delete / edit / visibility / status).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { updateRoutes, } from "./update";

const testConfig = {
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip", },
} as unknown as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-update-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(updateRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
}

/**
 * @param db
 * @param id
 * @param name
 */
async function seedUser(db: Kysely<DB>, id: string, name: string,): Promise<void> {
  await insertUsers(db, `user-${id}`, name, { id, } as never,);
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "user",
      display_name: name,
      user_id: id,
      owner_id: id,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
}

describe("updateRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    chatId = uid();
    await insertChats(db, "Update Chat", owner, { id: chatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param content
   * @param role
   */
  async function seedMessage(content: string, role: MessageRole = MessageRole.User,): Promise<string> {
    const id = uid();
    await insertMessages(db, chatId, owner, role, content, { id, } as never,);
    return id;
  }

  test("401 across mutating endpoints without userId", async () => {
    const id = await seedMessage("auth",);
    const app = makeApp(db, null, null,);
    const del = await app.handle(new Request(`http://localhost/api/messages/${id}`, { method: "DELETE", },),);
    expect(del.status,).toBe(401,);
    const patch = await app.handle(
      new Request(`http://localhost/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "x", },),
      },),
    );
    expect(patch.status,).toBe(401,);
    const vis = await app.handle(
      new Request(`http://localhost/api/messages/${id}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ visibility: "redacted", },),
      },),
    );
    expect(vis.status,).toBe(401,);
  });

  test("soft delete hides the message", async () => {
    const id = await seedMessage("soft me",);
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(new Request(`http://localhost/api/messages/${id}`, { method: "DELETE", },),);
    expect(res.status,).toBe(204,);
    const row = await db
      .selectFrom("messages",)
      .select(["visibility", "hidden_by",],)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(row?.visibility,).toBe("hidden_by_user",);
    expect(row?.hidden_by,).toBe(owner,);
  });

  test("hard delete by author wipes the row", async () => {
    const id = await seedMessage("wipe me",);
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${id}?hard=true`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);
    const gone = await db.selectFrom("messages",).select("id",).where("id", "=", id,).executeTakeFirst();
    expect(gone,).toBeUndefined();
  });

  test("hard delete guards authorship but allows chat admins", async () => {
    const id = await seedMessage("not yours",);
    const app = makeApp(db, stranger, "user",);
    // Stranger has no chat access at all → 404.
    const noAccess = await app.handle(
      new Request(`http://localhost/api/messages/${id}?hard=true`, { method: "DELETE", },),
    );
    expect(noAccess.status,).toBe(404,);
    // Participant without authorship and without admin rights → 403.
    await db
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: stranger, role_in_chat: "member", },)
      .execute();
    const forbidden = await app.handle(
      new Request(`http://localhost/api/messages/${id}?hard=true`, { method: "DELETE", },),
    );
    expect(forbidden.status,).toBe(403,);
    // Chat admin may hard-delete foreign messages → 204.
    const adminApp = makeApp(db, stranger, "admin",);
    const wiped = await adminApp.handle(
      new Request(`http://localhost/api/messages/${id}?hard=true`, { method: "DELETE", },),
    );
    expect(wiped.status,).toBe(204,);
  });

  test("delete 404 for missing message", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${uid()}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("patch rejects empty content", async () => {
    const id = await seedMessage("patch me",);
    const app = makeApp(db, owner, "user",);
    for (const content of ["", "   ",]) {
      const res = await app.handle(
        new Request(`http://localhost/api/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: JSON.stringify({ content, },),
        },),
      );
      expect(res.status,).toBe(400,);
    }
  });

  test("patch happy path edits a user message", async () => {
    const id = await seedMessage("before",);
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "after edit", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { id: string; content: string; edited_at: boolean };
    expect(parsed.id,).toBe(id,);
    expect(parsed.edited_at,).toBe(true,);
    const row = await db
      .selectFrom("messages",)
      .select(["content_plaintext", "edited_at",],)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(row?.edited_at,).not.toBeNull();
  });

  test("patch 404 for missing message and 403 for non-author", async () => {
    const id = await seedMessage("mine",);
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/messages/${uid()}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "x", },),
      },),
    );
    expect(missing.status,).toBe(404,);
    const other = makeApp(db, stranger, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "x", },),
      },),
    );
    expect(denied.status,).toBe(403,);
  });

  test("patch rejects non-user roles", async () => {
    const id = await seedMessage("assistant text", MessageRole.Assistant,);
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "try edit", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("visibility update round-trips", async () => {
    const id = await seedMessage("visible?",);
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${id}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ visibility: "redacted", reason: "test", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("messages",)
      .select(["visibility", "hidden_reason",],)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(row?.visibility,).toBe("redacted",);
    expect(row?.hidden_reason,).toBe("test",);
  });

  test("visibility 404 for missing message and stranger", async () => {
    const id = await seedMessage("v",);
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/messages/${uid()}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ visibility: "redacted", },),
      },),
    );
    expect(missing.status,).toBe(404,);
    const other = makeApp(db, stranger, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/messages/${id}/visibility`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ visibility: "redacted", },),
      },),
    );
    expect(denied.status,).toBe(404,);
  });

  test("status update requires admin but succeeds for admin", async () => {
    const id = await seedMessage("status me",);
    const userApp = makeApp(db, owner, "user",);
    const denied = await userApp.handle(
      new Request(`http://localhost/api/messages/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ status: "failed", },),
      },),
    );
    expect(denied.status,).toBe(403,);
    const adminApp = makeApp(db, owner, "admin",);
    const ok = await adminApp.handle(
      new Request(`http://localhost/api/messages/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ status: "failed", },),
      },),
    );
    expect(ok.status,).toBe(200,);
    const row = await db.selectFrom("messages",).select("status",).where("id", "=", id,).executeTakeFirst();
    expect(row?.status,).toBe("failed",);
  });
});
