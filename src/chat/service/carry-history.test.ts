/**
 * Tests for `carryHistory` (chat migration history carry).
 *
 * Regression: migrated messages copied `parent_id` verbatim from the source
 * chat, so the carried tree pointed at stale source-chat message ids. These
 * tests pin that parent_id links are remapped onto the migrated chat's own
 * message ids.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { carryHistory, } from "./carry-history";

describe("carryHistory", () => {
  let db: Kysely<DB>;
  const userId: string = crypto.randomUUID();
  const actorId: string = crypto.randomUUID();
  const sourceChatId: string = crypto.randomUUID();
  const newChatId: string = crypto.randomUUID();
  const parentId: string = crypto.randomUUID();
  const childId: string = crypto.randomUUID();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    await insertActors(db, "Actor", { id: actorId, user_id: userId, owner_id: userId, } as never,);
    await insertChats(db, "Source", userId, { id: sourceChatId, } as never,);
    await insertChats(db, "Migrated", userId, { id: newChatId, } as never,);

    // A two-node tree: parent (root) + child referencing it.
    await insertMessages(db, sourceChatId, actorId, MessageRole.User, "parent", { id: parentId, } as never,);
    await insertMessages(db, sourceChatId, actorId, MessageRole.Assistant, "child", {
      id: childId,
      parent_id: parentId,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("remaps parent_id onto the migrated chat's message ids", async () => {
    await carryHistory(db, sourceChatId, newChatId,);

    const carried = await db
      .selectFrom("messages",)
      .select(["id", "parent_id", "content",],)
      .where("chat_id", "=", newChatId,)
      .orderBy("id", "asc",)
      .execute();

    expect(carried,).toHaveLength(2,);

    const carriedParent = carried.find((m,) => m.content === "parent");
    const carriedChild = carried.find((m,) => m.content === "child");
    expect(carriedParent,).toBeDefined();
    expect(carriedChild,).toBeDefined();

    // Root message has no parent.
    expect(carriedParent?.parent_id,).toBeNull();

    // Child references the migrated parent's NEW id — not the source id.
    expect(carriedChild?.parent_id,).toBe(carriedParent?.id,);
    expect(carriedChild?.parent_id,).not.toBe(parentId,);
  });

  test("does not mutate the source chat", async () => {
    await carryHistory(db, sourceChatId, newChatId,);

    const source = await db
      .selectFrom("messages",)
      .select(["id", "parent_id", "content",],)
      .where("chat_id", "=", sourceChatId,)
      .orderBy("id", "asc",)
      .execute();

    expect(source,).toHaveLength(2,);
    expect(source.find((m,) => m.content === "child")?.parent_id,).toBe(parentId,);
  });
});
