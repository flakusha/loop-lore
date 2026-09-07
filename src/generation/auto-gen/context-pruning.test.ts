// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for BUG-context-pruning-is-a-silent-no-op.
 *
 * checkAndPruneContext computed a prune result but never persisted it — the
 * pruned messages stayed `visible`, so the context window never actually
 * shrank. The fix soft-hides pruned messages (visibility="auto_hidden").
 */
import { describe, expect, test, } from "bun:test";
import type {} from "kysely";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { checkAndPruneContext, } from "./context-pruning";

// 4 messages × 21_000 chars ≈ 25_200 tokens by the prune estimator
// (content.length * 0.3) — above DEFAULT_PRUNING_CONFIG.targetTokens (20_000),
// and token_count_total (32_000 each, below MAX_TOKENS × 0.95) pins the
// context threshold into "critical".
const CHUNK = "x".repeat(21_000,);
const MESSAGE_COUNT = 4;

describe("checkAndPruneContext — persists pruning decisions", () => {
  test("soft-hides pruned messages (visibility=auto_hidden) and returns true", async () => {
    createLogger({ level: "error", },);
    const { db, sqlite, } = await createTestDb();

    try {
      await insertUsers(db, "user", "User",);
      const userRow = await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow();
      const userId = userRow.id;
      await insertActors(db, "Actor", { user_id: userId, owner_id: userId, },);
      const actor = await db.selectFrom("actors",).select("id",).executeTakeFirstOrThrow();
      await insertChats(db, "Prune chat", userId,);
      const chat = await db.selectFrom("chats",).select("id",).limit(1,).executeTakeFirstOrThrow();

      const ids: string[] = [];
      for (let i = 0; i < MESSAGE_COUNT; i++) {
        const id = `msg-prune-${i}`;
        ids.push(id,);
        // Distinct content per message — the prune id re-association keys on
        // role+content, so identical content would collapse all rows to one id.
        const content = `${CHUNK}-${i}`;
        await insertMessages(db, chat.id, actor.id, "user", content, {
          id: id,
          token_count_total: 32_000,
          visibility: "visible",
        },);
      }

      const pruned = await checkAndPruneContext(db, chat.id, "test-request",);

      // Pruning must have been triggered (critical threshold).
      expect(pruned,).toBe(true,);

      // At least one message must be soft-hidden — the whole point of the bug.
      const autoHidden = await db
        .selectFrom("messages",)
        .select("id",)
        .where("id", "in", ids,)
        .where("visibility", "=", "auto_hidden",)
        .orderBy("id", "asc",)
        .execute();
      expect(autoHidden.length,).toBeGreaterThan(0,);
      // And they must be the lowest-scored (oldest first) messages.
      expect(autoHidden[0]?.id,).toBe("msg-prune-0",);
    } finally {
      sqlite.close();
    }
  });

  test("returns false when context is not critical (no pruning)", async () => {
    createLogger({ level: "error", },);
    const { db, sqlite, } = await createTestDb();

    try {
      await insertUsers(db, "user2", "User Two",);
      const userRow2 = await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow();
      const userId2 = userRow2.id;
      await insertActors(db, "Actor2", { user_id: userId2, owner_id: userId2, },);
      const actor2 = await db.selectFrom("actors",).select("id",).executeTakeFirstOrThrow();
      await insertChats(db, "Quiet chat", userId2,);
      const chat2 = await db.selectFrom("chats",).select("id",).limit(1,).executeTakeFirstOrThrow();

      await insertMessages(db, chat2.id, actor2.id, "user", "short message", {
        token_count_total: 100,
      },);

      const pruned = await checkAndPruneContext(db, chat2.id,);
      expect(pruned,).toBe(false,);
    } finally {
      sqlite.close();
    }
  });
});
