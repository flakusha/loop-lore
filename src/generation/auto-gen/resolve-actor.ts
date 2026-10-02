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
import { isMuted, } from "../../chat/moderation";
import type { DB, } from "../../db/schema";
import { selectNextGroupActor, } from "../../group-chat/turn-selector";
import { getLogger, } from "../../logger";

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
        .select(["actor_id", "muted_until",],)
        .where("chat_id", "=", chatId,)
        .where("actor_id", "=", cascadeActorId,)
        .executeTakeFirst();
      if (!membership) { return null; }
      // Outbound mute enforcement (TASK-chat-feature-moderation AC3): a
      // muted actor must not generate even when pre-selected by a cascade.
      if (isMuted(membership, Date.now(),)) {
        logMuteSuppress(chatId, cascadeActorId,);
        return null;
      }
      // Participant row survived but its actor row did not — still generate.
      const cascadeName = await actorName(database, cascadeActorId,);
      return { characterId: cascadeActorId, characterName: cascadeName ?? "Unknown", };
    }
    const selectedId = await selectNextGroupActor({ db: database, chatId, userMessage, },);
    if (!selectedId) { return null; }
    const selectedName = await actorName(database, selectedId,);
    if (!selectedName) { return null; }
    return { characterId: selectedId, characterName: selectedName, };
  }

  const character = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("chat_participants.actor_id", "!=", userId,)
    .select(["actors.id", "actors.display_name", "chat_participants.muted_until",],)
    .executeTakeFirst();
  if (!character) { return null; }
  // Outbound mute enforcement (TASK-chat-feature-moderation AC3): a muted
  // chat partner must not generate until muted_until elapses.
  if (isMuted(character, Date.now(),)) {
    logMuteSuppress(chatId, character.id,);
    return null;
  }
  return { characterId: character.id, characterName: character.display_name, };
}

/**
 * Structured log for an outbound-mute suppression (audit trail for the
 * moderation AC — generation deliberately did not run).
 * @param chatId
 * @param actorId
 */
function logMuteSuppress(chatId: string, actorId: string,): void {
  getLogger().child({ module: "auto-gen", },).info(
    "muted actor — outbound generation suppressed",
    { chatId, actorId, },
  );
}

/**
 * Look up an actor's display name.
 * @param database
 * @param actorId
 * @returns The display name, or null when the actor row is gone.
 */
async function actorName(database: Kysely<DB>, actorId: string,): Promise<string | null> {
  const row = await database
    .selectFrom("actors",)
    .select("display_name",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  return row?.display_name ?? null;
}
