// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { autoTranslateText, buildTranslateDeps, } from "../../chat/auto-translate";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

/**
 * Translate inbound user content when the chat opted in via
 * PATCH /chats/:id/auto-translate. Runs after slash-command dispatch so
 * command text is never rewritten. Degrades to the original content when
 * unset or when translation fails.
 * @param database
 * @param config
 * @param chatId
 * @param actorId
 * @param filteredContent - Profanity-filtered message text.
 * @returns The storable content (translated or original).
 */
export async function translateInboundContent(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  filteredContent: string,
): Promise<string> {
  const storyRow = await database
    .selectFrom("chats",)
    .select("story_state",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  const outcome = await autoTranslateText({
    text: filteredContent,
    storyState: storyRow?.story_state ?? null,
    chatId,
    deps: await buildTranslateDeps(database, config, actorId,),
  },);
  return outcome.text;
}
