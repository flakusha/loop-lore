/**
 * Tests for `updateMessageVisibility` (message visibility operations).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { updateMessageVisibility, } from "./visibility";

describe("updateMessageVisibility", () => {
  let db: Kysely<DB>;
  const userId: string = crypto.randomUUID();
  const actorId: string = crypto.randomUUID();
  const chatId: string = crypto.randomUUID();
  const messageId: string = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "Chat", userId, { id: chatId, } as never,);
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello", { id: messageId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("updates visibility and hidden reason", async () => {
    const result = await updateMessageVisibility(db, messageId, "hidden_by_user", "user hid it",);
    expect(result,).toEqual({ ok: true, },);

    const row = await db
      .selectFrom("messages",)
      .select(["visibility", "hidden_reason",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.visibility,).toBe("hidden_by_user",);
    expect(row?.hidden_reason,).toBe("user hid it",);
  });

  test("supports other visibility values with null reason", async () => {
    const result = await updateMessageVisibility(db, messageId, "hidden_by_moderator", null,);
    expect(result,).toEqual({ ok: true, },);

    const row = await db
      .selectFrom("messages",)
      .select(["visibility", "hidden_reason",],)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.visibility,).toBe("hidden_by_moderator",);
    expect(row?.hidden_reason,).toBeNull();
  });

  test("overwrites previous reason with the new one", async () => {
    await updateMessageVisibility(db, messageId, "hidden_by_user", "first reason",);
    await updateMessageVisibility(db, messageId, "hidden_by_user", "updated reason",);

    const row = await db
      .selectFrom("messages",)
      .select("hidden_reason",)
      .where("id", "=", messageId,)
      .executeTakeFirst();
    expect(row?.hidden_reason,).toBe("updated reason",);
  });

  test("returns ok for a non-existent message id", async () => {
    const result = await updateMessageVisibility(db, "missing-message", "hidden_by_user", null,);
    expect(result,).toEqual({ ok: true, },);
  });
});
