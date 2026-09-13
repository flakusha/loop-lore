// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { titleUntitledChatFromFirstMessage, } from "../../chat/title-suggest";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { handleSceneTransitions, } from "./handle-scene-transitions";
import { autoRenameChat, type ChatRecord, } from "./transitions";

/**
 * Post-insert chat side effects for a new user message: rule-based direct
 * rename, advisory AUX title for untitled non-direct chats (fire-and-forget,
 * never throws), scene-transition detection. Extracted from create.ts, which
 * sits at the size-gate limit.
 */
export async function runPostInsertChatEffects(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  messageId: string,
  effectiveContent: string,
  chatRecord: ChatRecord | undefined,
): Promise<void> {
  await autoRenameChat(database, chatId, effectiveContent, chatRecord,);
  void titleUntitledChatFromFirstMessage({
    config,
    db: database,
    chatId,
    userId: actorId,
    chatRecord: chatRecord
      ? { name: chatRecord.name, mode: chatRecord.mode, }
      : undefined,
    firstMessage: effectiveContent,
  },);
  await handleSceneTransitions(database, config, chatId, actorId, effectiveContent, chatRecord, messageId,);
}
