// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for message archiving routes (archive / restore / purge).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { deleteConfig, setConfig, } from "../../admin/config";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { archivingRoutes, } from "./archiving";

const testConfig = {} as unknown as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-archiving-coverage", },)
    .derive({ as: "scoped", }, () => ({ userId, userRole, }),)
    .use(archivingRoutes({ database: db, config: testConfig, },),) as unknown as Elysia;
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

describe("archivingRoutes coverage", () => {
  let db: Kysely<DB>;
  const owner = uid();
  const stranger = uid();
  let chatId: string;
  let messageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await seedUser(db, owner, "Owner",);
    await seedUser(db, stranger, "Stranger",);
    chatId = uid();
    await insertChats(db, "Archive Chat", owner, { id: chatId, } as never,);
    messageId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "keep me", {
      id: messageId,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("401 archive/restore/purge without userId", async () => {
    const app = makeApp(db, null, null,);
    const archive = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/archive`, { method: "POST", },),
    );
    expect(archive.status,).toBe(401,);
    const restore = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/restore`, { method: "POST", },),
    );
    expect(restore.status,).toBe(401,);
    const purge = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages/purge`, { method: "POST", },),
    );
    expect(purge.status,).toBe(401,);
  });

  test("archive happy path marks message auto_hidden", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("messages",)
      .select(["archived_at", "visibility",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.archived_at,).not.toBeNull();
    expect(row?.visibility,).toBe("auto_hidden",);
  });

  test("archive 404 for well-formed but missing id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${uid()}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("archive rejects malformed id", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/messages/not-a-uuid/archive", { method: "POST", },),
    );
    expect([400, 404, 422,],).toContain(res.status,);
  });

  test("archive 404 for non-owner without admin role", async () => {
    const app = makeApp(db, stranger, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("admin can archive another user's message", async () => {
    const app = makeApp(db, stranger, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/archive`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
  });

  test("restore happy path clears archived_at", async () => {
    const app = makeApp(db, owner, "user",);
    await app.handle(new Request(`http://localhost/api/messages/${messageId}/archive`, { method: "POST", },),);
    const res = await app.handle(
      new Request(`http://localhost/api/messages/${messageId}/restore`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("messages",)
      .select(["archived_at", "visibility",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.archived_at,).toBeNull();
    expect(row?.visibility,).toBe("visible",);
  });

  test("restore 404 for missing id and non-owner", async () => {
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/messages/${uid()}/restore`, { method: "POST", },),
    );
    expect(missing.status,).toBe(404,);
    const other = makeApp(db, stranger, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/messages/${messageId}/restore`, { method: "POST", },),
    );
    expect(denied.status,).toBe(404,);
  });

  test("purge removes only archived messages older than the 90-day default", async () => {
    const app = makeApp(db, owner, "user",);
    const expiredId = uid();
    const midId = uid();
    const freshId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "expired", { id: expiredId, } as never,);
    await insertMessages(db, chatId, owner, MessageRole.User, "mid", { id: midId, } as never,);
    await insertMessages(db, chatId, owner, MessageRole.User, "fresh", { id: freshId, } as never,);
    const day = 24 * 60 * 60 * 1000;
    await db
      .updateTable("messages",)
      .set({ archived_at: new Date(Date.now() - 91 * day,).toISOString(), },)
      .where("id", "=", expiredId,)
      .execute();
    await db
      .updateTable("messages",)
      .set({ archived_at: new Date(Date.now() - 31 * day,).toISOString(), },)
      .where("id", "=", midId,)
      .execute();
    await db
      .updateTable("messages",)
      .set({ archived_at: new Date().toISOString(), },)
      .where("id", "=", freshId,)
      .execute();

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages/purge`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { ok: boolean; purged: number };
    expect(parsed.ok,).toBe(true,);
    // numDeletedRows counts FK-cascade/FTS side effects, so it exceeds the
    // message count — the invariant is "at least the eligible row went".
    expect(parsed.purged,).toBeGreaterThanOrEqual(1,);
    const gone = await db.selectFrom("messages",).select("id",).where("id", "=", expiredId,).executeTakeFirst();
    expect(gone,).toBeUndefined();
    // 31 days is inside the unset-config default window of 90 days.
    const mid = await db.selectFrom("messages",).select("id",).where("id", "=", midId,).executeTakeFirst();
    expect(mid?.id,).toBe(midId,);
    const kept = await db.selectFrom("messages",).select("id",).where("id", "=", freshId,).executeTakeFirst();
    expect(kept?.id,).toBe(freshId,);
  });

  test("purge honors a stubbed archive_retention_days config value", async () => {
    await setConfig(db, "archive_retention_days", "7",);
    try {
      const app = makeApp(db, owner, "user",);
      const expiredId = uid();
      const freshId = uid();
      await insertMessages(db, chatId, owner, MessageRole.User, "old", { id: expiredId, } as never,);
      await insertMessages(db, chatId, owner, MessageRole.User, "recent", { id: freshId, } as never,);
      const day = 24 * 60 * 60 * 1000;
      await db
        .updateTable("messages",)
        .set({ archived_at: new Date(Date.now() - 8 * day,).toISOString(), },)
        .where("id", "=", expiredId,)
        .execute();
      await db
        .updateTable("messages",)
        .set({ archived_at: new Date(Date.now() - 3 * day,).toISOString(), },)
        .where("id", "=", freshId,)
        .execute();

      const res = await app.handle(
        new Request(`http://localhost/api/chats/${chatId}/messages/purge`, { method: "POST", },),
      );
      expect(res.status,).toBe(200,);
      const gone = await db.selectFrom("messages",).select("id",).where("id", "=", expiredId,).executeTakeFirst();
      expect(gone,).toBeUndefined();
      const kept = await db.selectFrom("messages",).select("id",).where("id", "=", freshId,).executeTakeFirst();
      expect(kept?.id,).toBe(freshId,);
    } finally {
      await deleteConfig(db, "archive_retention_days",);
    }
  });

  test("purge falls back to the 90-day default on invalid config values", async () => {
    const app = makeApp(db, owner, "user",);
    const midId = uid();
    await insertMessages(db, chatId, owner, MessageRole.User, "mid", { id: midId, } as never,);
    await db
      .updateTable("messages",)
      .set({ archived_at: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000,).toISOString(), },)
      .where("id", "=", midId,)
      .execute();
    try {
      // Zero/negative or non-numeric values must not widen the window.
      for (const invalid of ["0", "garbage",]) {
        await setConfig(db, "archive_retention_days", invalid,);
        const res = await app.handle(
          new Request(`http://localhost/api/chats/${chatId}/messages/purge`, { method: "POST", },),
        );
        expect(res.status,).toBe(200,);
        const kept = await db.selectFrom("messages",).select("id",).where("id", "=", midId,).executeTakeFirst();
        expect(kept?.id,).toBe(midId,);
      }
    } finally {
      await deleteConfig(db, "archive_retention_days",);
    }
  });

  test("purge returns zero when nothing is eligible", async () => {
    const app = makeApp(db, owner, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages/purge`, { method: "POST", },),
    );
    expect(res.status,).toBe(200,);
    const parsed = (await res.json()) as { purged: number };
    expect(parsed.purged,).toBe(0,);
  });

  test("purge 404 for missing chat and non-owner", async () => {
    const app = makeApp(db, owner, "user",);
    const missing = await app.handle(
      new Request(`http://localhost/api/chats/${uid()}/messages/purge`, { method: "POST", },),
    );
    expect(missing.status,).toBe(404,);
    const other = makeApp(db, stranger, "user",);
    const denied = await other.handle(
      new Request(`http://localhost/api/chats/${chatId}/messages/purge`, { method: "POST", },),
    );
    expect(denied.status,).toBe(404,);
  });
});
