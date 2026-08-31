// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/seeding/chats.ts — config-driven chat seeding
//
// Creates configured chats (TASK-content-seeding-environment-overrides) on
// startup, linking prepopulated users' mirror actors as participants.
//
// Idempotent per (createdBy, name): a chat with the same display name already
// created by the first participant is skipped. Unknown participants are skipped
// with a warning — but only if at least one participant resolves; a chat with
// no resolvable participants is skipped entirely.

import type { Kysely, } from "kysely";
import type { SeedChat, } from "../config/schema";
import type { DB, } from "../db/schema";
import type { Logger, } from "../logger";
import { uid, } from "../utils";
import { recordSeedAudit, } from "./audit";

/**
 * Seed chats (with participants) from config.
 * @param database - Kysely instance
 * @param chats - Chat definitions (participants referenced by username)
 * @param userById - Username → user id map
 * @param log - Logger child
 * @returns number of chats created
 */
export async function seedChats(
  database: Kysely<DB>,
  chats: readonly SeedChat[],
  userById: ReadonlyMap<string, string>,
  log: Logger,
): Promise<number> {
  let created = 0;
  for (const chat of chats) {
    // Resolve participant usernames → user actor ids (actor id == user id).
    const participantIds: string[] = [];
    for (const username of chat.participants) {
      const userId = userById.get(username,);
      if (userId) {
        participantIds.push(userId,);
      } else {
        log.warn(`Chat participant "${username}" not found — omitting`,);
      }
    }
    if (participantIds.length === 0) {
      log.warn(`Skipping chat with no resolvable participants`,);
      continue;
    }

    const name = chat.name ?? chat.participants.join(", ",);
    const createdBy = participantIds[0]!;

    const existing = await database
      .selectFrom("chats",)
      .select("id",)
      .where("created_by", "=", createdBy,)
      .where("name", "=", name,)
      .executeTakeFirst();
    if (existing) {
      log.debug(`Chat "${name}" already exists — skipping`,);
      continue;
    }

    const chatId = uid();
    await database
      .insertInto("chats",)
      .values({
        id: chatId,
        name,
        type: chat.type ?? "direct",
        mode: chat.type ?? "direct",
        created_by: createdBy,
        world_id: null,
        current_location_id: null,
        story_state: null,
        gm_config: null,
        turn_strategy: null,
        max_turns: null,
        auto_advance: null,
        parent_chat_id: null,
        is_pinned: "unpinned",
        encryption_level: "none",
        response_length_preset: "medium",
        response_length_custom: null,
        context_max_tokens: null,
      },)
      .execute();

    for (const actorId of participantIds) {
      await database
        .insertInto("chat_participants",)
        .values({
          chat_id: chatId,
          actor_id: actorId,
          role_in_chat: "member",
        },)
        .execute();
    }
    await recordSeedAudit(database, "chat", chatId, {
      name,
      participants: chat.participants,
    },);

    created += 1;
    log.info(`Seeded chat "${name}" (${participantIds.length} participants)`,);
  }
  return created;
}
