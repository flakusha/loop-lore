/**
 * Tests for message swipe/replay-branch regeneration.
 *
 * Verifies that POST /api/generation/regenerate (messageId path) creates a NEW
 * sibling variant (same parent_id, swipe_index = max+1) instead of mutating the
 * original, enforces owner/author permission, and is idempotent while a regen
 * variant is still pending.
 */
import type { Database, } from "bun:sqlite";
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { listMessages, } from "../chat/service";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { handleRegenerate, } from "./generation-routes";

const USER_ID = "u-owner";
const OTHER_ID = "u-other";
const ACTOR_ID = "a-char";
const CHAT_ID = "c-1";
const PARENT_ID = "m-user";
const ORIGINAL_ID = "m-original";

/** */
async function seed(): Promise<{ db: Kysely<DB>; sqlite: Database }> {
  const { db, sqlite, } = await createTestDb();

  await insertUsers(db, "owner", "Owner", { id: USER_ID, } as never,);
  await insertUsers(db, "other", "Other", { id: OTHER_ID, } as never,);
  await insertActors(db, "Owner User", { id: USER_ID, owner_id: USER_ID, } as never,);
  await insertActors(db, "Character", { id: ACTOR_ID, owner_id: USER_ID, } as never,);
  await insertChats(db, "Chat", USER_ID, { id: CHAT_ID, } as never,);

  // User prompt (root of the branch).
  await insertMessages(db, CHAT_ID, USER_ID, "user", "Hello", {
    id: PARENT_ID,
    visibility: "visible",
    status: "confirmed",
  } as never,);

  // Original assistant variant, plus one pre-existing alternative.
  await insertMessages(db, CHAT_ID, ACTOR_ID, "assistant", "Response A", {
    id: ORIGINAL_ID,
    parent_id: PARENT_ID,
    swipe_index: 0,
    visibility: "visible",
    status: "confirmed",
  } as never,);
  await insertMessages(db, CHAT_ID, ACTOR_ID, "assistant", "Response B", {
    id: "m-alt",
    parent_id: PARENT_ID,
    swipe_index: 1,
    visibility: "visible",
    status: "confirmed",
  } as never,);

  return { db, sqlite, };
}

describe("handleRegenerate (messageId → new sibling variant)", () => {
  test("creates a new sibling variant with swipe_index = max+1, preserving the old row", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      ok: boolean;
      variantMessageId: string;
      swipeIndex: number;
      replayed: boolean;
    };
    expect(data.ok,).toBe(true,);
    expect(data.replayed,).toBe(false,);
    expect(data.swipeIndex,).toBe(2,);

    // New row: same parent, next swipe index, pending status, content placeholder.
    const created = await db
      .selectFrom("messages",)
      .select(["id", "parent_id", "swipe_index", "status", "visibility", "content", "actor_id",],)
      .where("id", "=", data.variantMessageId,)
      .executeTakeFirst();

    expect(created,).toBeDefined();
    expect(created!.parent_id,).toBe(PARENT_ID,);
    expect(created!.swipe_index,).toBe(2,);
    expect(created!.status,).toBe("sending",);
    expect(created!.visibility,).toBe("visible",);
    expect(created!.content,).toBe("Response A",);
    expect(created!.actor_id,).toBe(ACTOR_ID,);

    // Original + alternative unchanged.
    const originals = await db
      .selectFrom("messages",)
      .select(["id", "swipe_index", "status",],)
      .where("id", "in", [ORIGINAL_ID, "m-alt",],)
      .orderBy("swipe_index", "asc",)
      .execute();
    expect(originals.map((m,) => [m.id, m.swipe_index, m.status,]),).toEqual([
      [ORIGINAL_ID, 0, "confirmed",],
      ["m-alt", 1, "confirmed",],
    ],);
  });

  test("new variant is visible to listMessages with incremented counter", async () => {
    const { db, } = await seed();

    await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );

    const { data, } = await listMessages(db, { chatId: CHAT_ID, parentId: PARENT_ID, },);
    const variants = data.filter((m,) => m.parent_id === PARENT_ID);
    expect(variants.length,).toBe(3,);
    for (const v of variants) {
      expect(v.totalVariants,).toBe(3,);
    }
  });

  test("rejects a non-owner, non-author, non-admin user", async () => {
    const { db, } = await seed();

    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: OTHER_ID, userRole: "user", },
    );
    expect(res.status,).toBe(403,);

    // No sibling created.
    const count = await db
      .selectFrom("messages",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .executeTakeFirst();
    expect(count?.n,).toBe(2,);
  });

  test("is idempotent while a regen variant is pending (no duplicate)", async () => {
    const { db, } = await seed();

    const first = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const firstData = (await first.json()) as { variantMessageId: string; replayed: boolean };

    // Repeat before the pending variant resolves.
    const second = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const secondData = (await second.json()) as {
      variantMessageId: string;
      replayed: boolean;
      swipeIndex: number;
    };

    expect(secondData.replayed,).toBe(true,);
    expect(secondData.variantMessageId,).toBe(firstData.variantMessageId,);

    // Still exactly 3 siblings (no 4th duplicate).
    const count = await db
      .selectFrom("messages",)
      .select(db.fn.countAll<number>().as("n",),)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .executeTakeFirst();
    expect(count?.n,).toBe(3,);
  });

  test("returns the original variantId after its pending variant resolves", async () => {
    const { db, } = await seed();

    await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );

    // Resolve the pending variant (simulate the generation pipeline confirming it).
    await db
      .updateTable("messages",)
      .set({ status: "confirmed", },)
      .where("chat_id", "=", CHAT_ID,)
      .where("parent_id", "=", PARENT_ID,)
      .where("status", "=", "sending",)
      .execute();

    // A fresh request now creates a brand-new variant rather than replaying.
    const res = await handleRegenerate(
      { chatId: CHAT_ID, messageId: ORIGINAL_ID, },
      db,
      { userId: USER_ID, userRole: "user", },
    );
    const data = (await res.json()) as { replayed: boolean; swipeIndex: number };
    expect(data.replayed,).toBe(false,);
    expect(data.swipeIndex,).toBe(3,);
  });
});
