// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor/character selection for auto-generation.
 *
 * Resolves which actor generates the next message: for group chats either a
 * pre-selected cascade actor or the next actor by turn selection; for single
 * chats the non-user participant. Returns null when no actor can be chosen
 * (caller bails out of generation).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { selectNextGroupActor, } from "../../group-chat/turn-selector";

/** */
export interface ResolveActorOpts {
  /** Chat row subset read by the caller (type is used for branch selection). */
  type: string | undefined;
  /** Pre-selected cascade actor (overrides turn selection). */
  cascadeActorId?: string;
  /** User's message text — used for group-chat turn selection. */
  userMessage?: string;
  chatId: string;
  userId: string;
}

/** */
export interface ResolvedActor {
  characterId: string;
  characterName: string;
}

/**
 * Resolve the actor that should generate the next message.
 * @param database
 * @param opts
 * @returns The resolved actor, or null when no eligible actor exists (group
 *   turn selection yielded nothing, or the single-chat participant is missing).
 */
export async function resolveActor(
  database: Kysely<DB>,
  opts: ResolveActorOpts,
): Promise<ResolvedActor | null> {
  const { type, cascadeActorId, userMessage, chatId, userId, } = opts;

  if (type === "group") {
    if (cascadeActorId) {
      // Cascade mode: use the pre-selected actor, but verify it is still a
      // participant — the id arrives from the prior cascade depth and may be
      // stale (actor left) or forged (direct triggerAutoGeneration call).
      const membership = await database
        .selectFrom("chat_participants",)
        .select("actor_id",)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", cascadeActorId,)
        .executeTakeFirst();
      if (!membership) { return null; }
      const selected = await database
        .selectFrom("actors",)
        .select(["display_name",],)
        .where("id", "=", cascadeActorId,)
        .executeTakeFirst();
      return {
        characterId: cascadeActorId,
        characterName: selected?.display_name ?? "Unknown",
      };
    }
    const selectedId = await selectNextGroupActor({ db: database, chatId, userMessage, },);
    if (!selectedId) { return null; }
    const selected = await database
      .selectFrom("actors",)
      .select(["display_name",],)
      .where("id", "=", selectedId,)
      .executeTakeFirst();
    if (!selected) { return null; }
    return { characterId: selectedId, characterName: selected.display_name, };
  }

  const character = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("chat_participants.actor_id", "!=", userId,)
    .select(["actors.id", "actors.display_name",],)
    .executeTakeFirst();
  if (!character) { return null; }
  return { characterId: character.id, characterName: character.display_name, };
}
