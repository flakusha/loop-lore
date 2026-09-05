// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for BUG-injectnarration-hardcodes-actor-id-system-fk-drops-split-reu.
 *
 * injectNarration inserted `actor_id: "system"` — not a real actors row, so the
 * FK violation was thrown and swallowed by the bare catch, silently dropping
 * split/reunite narration. The fix resolves a real narrator actor
 * (actor_type="narrator" AND agent_type="narrator") and inserts with its id.
 */
import { describe, expect, test, } from "bun:test";
import type { Generated, } from "kysely";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../test-utils/insert-helpers";
import { injectNarration, } from "./transitions";

describe("injectNarration — real narrator actor, no FK drop", () => {
  test("inserts a narration message bound to a real narrator actor", async () => {
    createLogger({ level: "error", },);
    const { db, sqlite, } = await createTestDb();

    try {
      await insertUsers(db, "user", "User",);
      const userRow = await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow();
      const userId = userRow.id;

      // Seed the narrator actor the way world/chats provisioning does.
      await insertActors(db, "Narrator", {
        actor_type: "narrator" as unknown as Generated<"narrator">,
        agent_type: "narrator" as unknown as Generated<"narrator">,
        user_id: userId,
        owner_id: userId,
      },);
      const narrator = await db
        .selectFrom("actors",)
        .select("id",)
        .where("actor_type", "=", "narrator",)
        .executeTakeFirstOrThrow();

      await insertChats(db, "Split chat", userId,);
      const chat = await db.selectFrom("chats",).select("id",).limit(1,).executeTakeFirstOrThrow();

      await injectNarration(db, chat.id, "The party splits in two directions.",);

      const row = await db
        .selectFrom("messages",)
        .select(["id", "actor_id", "content_type",],)
        .where("chat_id", "=", chat.id,)
        .executeTakeFirst();
      expect(row,).toBeDefined();
      expect(row?.actor_id,).toBe(narrator.id,);
      expect(row?.content_type,).toBe("narration",);
    } finally {
      sqlite.close();
    }
  });

  test("no narrator actor → skips without throwing (non-fatal)", async () => {
    createLogger({ level: "error", },);
    const { db, sqlite, } = await createTestDb();

    try {
      await insertUsers(db, "user2", "User Two",);
      const userRow2 = await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow();
      const userId2 = userRow2.id;
      await insertActors(db, "Regular", { user_id: userId2, owner_id: userId2, },);
      await insertChats(db, "No narrator chat", userId2,);
      const chat2 = await db.selectFrom("chats",).select("id",).limit(1,).executeTakeFirstOrThrow();

      // Must not reject and must not insert anything.
      await injectNarration(db, chat2.id, "Narration without narrator.",);

      const count = await db
        .selectFrom("messages",)
        .select(db.fn.countAll<number>().as("total",),)
        .where("chat_id", "=", chat2.id,)
        .executeTakeFirst();
      expect(count?.total,).toBe(0,);
    } finally {
      sqlite.close();
    }
  });
});
