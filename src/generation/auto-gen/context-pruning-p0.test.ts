// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** P0 regressions: promoted messages reach the memory store; model window resolver. */
import { describe, expect, test, } from "bun:test";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { checkAndPruneContext, } from "./context-pruning";

/** Isolated chat + participant owner. */
async function fixture(title: string,) {
  const { db, sqlite, } = await createTestDb();
  await insertUsers(db, "p0-user", "P0 User",);
  const user = await db.selectFrom("users",).select("id",).executeTakeFirstOrThrow();
  await insertActors(db, "P0 Actor", { user_id: user.id, owner_id: user.id, },);
  const actor = await db.selectFrom("actors",).select("id",).executeTakeFirstOrThrow();
  await insertChats(db, title, user.id,);
  const chat = await db
    .selectFrom("chats",)
    .select("id",)
    .limit(1,)
    .executeTakeFirstOrThrow();

  await insertChatParticipants(db, chat.id, actor.id,);
  return { actor, chat, db, sqlite, };
}

describe("checkAndPruneContext — P0 regressions", () => {
  test("promoted messages are stored by the ownership-checked writer", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const f = await fixture("Promotion chat",);
    try {
      for (let i = 0; i < 4; i++) {
        await insertMessages(
          f.db,
          f.chat.id,
          f.actor.id,
          "user",
          `${"x".repeat(24_000,)}-${i} lore decide fear castle`,
          {
            id: `promote-${i}`,
            token_count_total: 32_000,
          },
        );
      }

      const triggered = await checkAndPruneContext(f.db, f.chat.id, "promo-request",);
      expect(triggered,).toBe(true,);

      const stored = await f.db
        .selectFrom("actor_memories",)
        .select(["actor_id", "content",],)
        .where("actor_id", "=", f.actor.id,)
        .execute();

      expect(stored.some((m,) => m.content.includes("lore decide fear castle",)),).toBe(true,);
    } finally {
      f.sqlite.close();
    }
  });

  test("uses the registered model context window instead of 32K", async () => {
    try {
      createLogger({ level: "error", },);
    } catch { /* already initialized */ }

    const f = await fixture("Window chat",);
    const provider = "p0-window-provider";
    const model = "p0-window-model";
    try {
      await f.db.insertInto("model_capabilities",).values({
        id: "p0-window-cap",
        provider_id: provider,
        model_id: model,
        context_window: 10_000,
        max_output: null,
        supports_tools: null,
        supports_vision: null,
        supports_thinking: null,
        modalities: null,
        param_size: null,
        owned_by: null,
        notes: null,
        last_seen: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        native_locale: null,
      },).execute();

      for (let i = 0; i < 4; i++) {
        await insertMessages(f.db, f.chat.id, f.actor.id, "user", `short-${i}`, {
          token_count_total: 2500,
          provider,
          model_id: model,
        },);
      }

      // 10_000 / 10_000 = imminent; 10_000 / 32_000 would be healthy.
      expect(await checkAndPruneContext(f.db, f.chat.id,),).toBe(true,);
    } finally {
      f.sqlite.close();
    }
  });
});
