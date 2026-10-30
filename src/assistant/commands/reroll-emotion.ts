// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/reroll-emotion.ts
//
// /reroll-emotion — re-roll an actor's emotion-avatar slots from chat.
//
// Delegates to the emotion-avatar SERVICE (`EmotionAvatarService`, the same
// call the regenerate HTTP route makes) — never to the HTTP route itself.
// Actor resolution follows the command context: an explicit `@Name`/id token
// must be a participant of this chat (group-chat @mention, gm-guidance
// precedent); otherwise the impersonated `currentCharacter`, else the first
// non-user participant (/stats precedent). The result carries the same
// `regenerate-emotion-avatars` action the actor panel dispatches, so the
// avatar event renders in chat through the existing avatar action handler.

import type { Kysely, } from "kysely";
import { AvatarService, } from "../../characters/services/avatar-service";
import { EmotionAvatarService, } from "../../characters/services/emotion-avatar-service";
import { EmotionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/**
 * Resolve the re-roll target: an explicit @Name/id token must name a
 * participant of this chat; otherwise the impersonated currentCharacter,
 * else the first non-user participant.
 * @param options
 * @param options.db
 * @param options.chatId
 * @param options.token
 * @param options.currentCharacterId
 * @returns Actor id plus display name, or null when no actor resolves.
 */
async function resolveTargetActor(options: {
  db: Kysely<DB>;
  chatId: string;
  token: string | undefined;
  currentCharacterId: string | undefined;
},): Promise<{ id: string; displayName: string } | null> {
  const { db, chatId, token, currentCharacterId, } = options;
  if (token) {
    const needle = token.replace(/^@/, "",).toLowerCase();
    const participants = await db
      .selectFrom("chat_participants",)
      .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
      .select(["chat_participants.actor_id", "actors.display_name",],)
      .where("chat_participants.chat_id", "=", chatId,)
      .execute();

    for (const p of participants) {
      if (p.actor_id === token || p.display_name.toLowerCase() === needle) {
        return { id: p.actor_id, displayName: p.display_name, };
      }
    }

    return null;
  }

  if (currentCharacterId) {
    const actor = await db
      .selectFrom("actors",)
      .select(["display_name",],)
      .where("id", "=", currentCharacterId,)
      .executeTakeFirst();

    if (actor) { return { id: currentCharacterId, displayName: actor.display_name, }; }
  }

  const character = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["actors.id", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.actor_type", "!=", "user",)
    .executeTakeFirst();

  return character ? { id: character.id, displayName: character.display_name, } : null;
}

/**
 * Split raw args into an optional actor token plus emotion slots. A leading
 * token that is not a known emotion names the actor; the rest must be valid
 * slots. Throws the user-facing message when a slot is unknown.
 * @param args - Raw command args.
 * @returns Actor token plus validated lowercase slots.
 * @throws {Error} user-facing message for unknown slots.
 */
function splitActorAndSlots(args: string[],): { actorToken: string | undefined; emotions: EmotionType[] | undefined } {
  const slots = Object.values(EmotionType,);
  const [first, ...rest] = args;
  const actorToken = first !== undefined && !slots.includes(first.toLowerCase() as EmotionType,) ? first : undefined;
  const slotTokens = actorToken !== undefined ? rest : args;
  const invalid = slotTokens.filter((slot,) => !slots.includes(slot.toLowerCase() as EmotionType,));
  if (invalid.length > 0) {
    throw new Error(`**Reroll failed:** unknown emotion slot "${invalid[0]}". Valid slots: ${slots.join(", ",)}.`,);
  }

  const emotions = slotTokens.length > 0
    ? slotTokens.map((slot,) => slot.toLowerCase()) as EmotionType[]
    : undefined;

  return { actorToken, emotions, };
}

/**
 * Start the slot-replace batch through the service and build the avatar
 * action result the chat renders through the existing avatar action handler.
 * @param options
 * @param options.db
 * @param options.target
 * @param options.baseAvatarId
 * @param options.emotions
 * @returns The success result, or a failure message when the service throws.
 */
async function startReroll(options: {
  db: Kysely<DB>;
  target: { id: string; displayName: string };
  baseAvatarId: string;
  emotions: EmotionType[] | undefined;
},): Promise<CommandResult> {
  const service = new EmotionAvatarService(options.db,);
  let jobId: string;
  try {
    jobId = await service.startBatchGeneration({
      actorId: options.target.id,
      baseAvatarId: options.baseAvatarId,
      emotions: options.emotions,
      replace: true,
    },);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Failed to start regeneration";
    return { systemMessage: `**Reroll failed:** ${detail}`, handled: true, };
  }

  const { target, baseAvatarId, emotions, } = options;
  return {
    systemMessage: `**Re-rolling ${emotions ? emotions.join(", ",) : "all emotions"} for ${target.displayName}.**`,
    action: "regenerate-emotion-avatars",
    actionPayload: { actorId: target.id, baseAvatarId, emotions: emotions ?? null, jobId, },
    handled: true,
  };
}

/**
 * Core /reroll-emotion logic (exported for tests).
 * @param args
 * @param ctx
 * @returns Command result with the regenerate action or an error message.
 */
export async function runRerollEmotion(args: string[], ctx: CommandContext,): Promise<CommandResult> {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Reroll unavailable:** command context missing database.", handled: true, };
  }

  let actorToken: string | undefined;
  let emotions: EmotionType[] | undefined;
  try {
    ({ actorToken, emotions, } = splitActorAndSlots(args,));
  } catch (error) {
    return { systemMessage: error instanceof Error ? error.message : "**Reroll failed.**", handled: true, };
  }

  const target = await resolveTargetActor({
    db,
    chatId: ctx.chatId,
    token: actorToken,
    currentCharacterId: ctx.currentCharacter?.id,
  },);

  if (!target) {
    const detail = actorToken
      ? `character "${actorToken}" is not a participant of this chat.`
      : "no character found in this chat. Mention a participant: /reroll-emotion @Name [emotion...].";

    return { systemMessage: `**Reroll failed:** ${detail}`, handled: true, };
  }

  // Re-roll derives from an existing avatar: the actor's primary avatar
  // (route parity: character-emotion-avatars regenerate).
  const baseAvatar = await new AvatarService(db,).getAvatars(target.id,);
  const baseAvatarId = baseAvatar.find((avatar,) => avatar.isPrimary)?.id;
  if (!baseAvatarId) {
    return {
      systemMessage: `**Reroll failed:** ${target.displayName} has no primary avatar to re-roll from.`,
      handled: true,
    };
  }

  return await startReroll({ db, target, baseAvatarId, emotions, },);
}

registerCommand("reroll-emotion", async (args, ctx,): Promise<CommandResult> => {
  return await runRerollEmotion(args, ctx,);
},);
