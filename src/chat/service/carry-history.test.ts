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

  test("carried rows drop the source key_id (BUG-carryhistory-copies-key-id)", async () => {
    // Source message is encrypted (key_id set) but has a plaintext mirror.
    // The migrated copy must not reference the source chat's chat_keys row:
    // key_id should be nulled and content_plaintext carried verbatim so the
    // target chat's read path resolves the mirror instead of attempting a
    // key lookup against a source chat that may be deleted or re-keyed.
    const encId: string = crypto.randomUUID();
    await insertMessages(db, sourceChatId, actorId, MessageRole.User, "enc-envelope", {
      id: encId,
      key_id: "src-key-1",
      content_plaintext: "the real plaintext",
    } as never,);

    await carryHistory(db, sourceChatId, newChatId,);

    const carried = await db
      .selectFrom("messages",)
      .select(["content", "key_id", "content_plaintext",],)
      .where("chat_id", "=", newChatId,)
      .execute();

    const row = carried.find((m,) => m.content === "enc-envelope");
    expect(row,).toBeDefined();
    // The copied row must not dangle a source-chat key.
    expect(row?.key_id,).toBeNull();
    // And the plaintext mirror is preserved so the target is still readable.
    expect(row?.content_plaintext,).toBe("the real plaintext",);
  });

  test("ciphertext-only rows are dropped on carry (undecryptable post-delete)", async () => {
    // A row with a key_id but no plaintext mirror cannot be decrypted once
    // the source chat's chat_keys row is gone (cascade on source delete).
    // Carrying it verbatim would make the migrated chat throw on read, so
    // the row must be skipped rather than copied with a dangling key.
    await insertMessages(db, sourceChatId, actorId, MessageRole.User, "cipher-only", {
      key_id: "src-key-2",
      content_plaintext: null,
    } as never,);

    await carryHistory(db, sourceChatId, newChatId,);

    const carried = await db
      .selectFrom("messages",)
      .select(["content",],)
      .where("chat_id", "=", newChatId,)
      .execute();

    expect(carried.some((m,) => m.content === "cipher-only",),).toBe(false,);
  });
});
