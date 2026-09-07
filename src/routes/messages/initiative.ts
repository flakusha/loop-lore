// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Initiative persistence for message creation.
 *
 * Extracted from post.ts (file-size ceiling).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import { log, } from "./helpers";

/**
 * Persist an initiative claim for the actor in the chat's main scene.
 * @param database
 * @param chatId
 * @param actorId
 */
export async function persistInitiative(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<void> {
  // Read the chat's persisted story_state to discover the active scene.
  // Falls back to "main" for chats with no scene metadata — preserves
  // existing single-scene behavior (BUG-chat-persist-init-hardcoded-scene).
  const chatRow = await database
    .selectFrom("chats",)
    .select("story_state",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  const parsed = jsonParseOr<{ currentSceneId?: string }>(chatRow?.story_state ?? "", {},);
  const currentScene = parsed.currentSceneId ?? "main";
  const existing = await database
    .selectFrom("group_initiatives",)
    .select("score",)
    .where("chat_id", "=", chatId,)
    .where("scene_id", "=", currentScene,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("group_initiatives",)
      .set({ score: existing.score + 1, updated_at: new Date().toISOString(), },)
      .where("chat_id", "=", chatId,)
      .where("scene_id", "=", currentScene,)
      .where("actor_id", "=", actorId,)
      .execute();
  } else {
    await database
      .insertInto("group_initiatives",)
      .values({
        chat_id: chatId,
        scene_id: currentScene,
        actor_id: actorId,
        score: 1,
      },)
      .execute();
  }

  log().info("Initiative claimed", { chatId, actorId, scene: currentScene, },);
}
