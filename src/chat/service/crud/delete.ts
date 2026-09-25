// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { emitPluginEvent, } from "../../../plugins/event-bus";
import { registry, } from "../../../plugins/registry";
/**
 * Delete a chat and all its related data (cascade).
 *
 * Wraps the cascade in a single `db.transaction().execute()` so a mid-flight
 * failure rolls back every child table. Without the wrapper, nine sequential
 * `await database.deleteFrom(...).execute()` calls commit independently — a
 * throw on the seventh leaves `chat_participants`, `chats`, and the in-between
 * tables inconsistent, surfacing as orphan rows on the next delete attempt.
 * Task: TASK-deletechat-runs-9-sequential-deletes-without-transaction-orp.
 * @param database
 * @param chatId
 */
export async function deleteChat(database: Kysely<DB>, chatId: string,): Promise<void> {
  await database.transaction().execute((trx,) => {
    return (
      trx.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute(),
        trx
          .deleteFrom("world_states",)
          .where((eb,) =>
            eb.or([
              eb(
                "trigger_message_id",
                "in",
                trx.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,),
              ),
              eb(
                "trigger_turn_id",
                "in",
                trx.selectFrom("story_turns",).select("id",).where("chat_id", "=", chatId,),
              ),
            ],)
          )
          .execute(),
        trx.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute(),
        trx.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute(),
        trx.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute(),
        trx.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute(),
        trx
          .deleteFrom("asset_links",)
          .where("entity_type", "=", "chat",)
          .where("entity_id", "=", chatId,)
          .execute(),
        trx.deleteFrom("messages",).where("chat_id", "=", chatId,).execute(),
        trx.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute(),
        trx.deleteFrom("chats",).where("id", "=", chatId,).execute()
    );
  },);

  // FEAT-048: emit chat.deleted after the cascade completes so plugins see
  // the canonical post-delete state. Per-handler errors do not affect outcome.
  await emitPluginEvent(registry.getAllEventHandlers(), "chat.deleted", { chatId, },);
}
