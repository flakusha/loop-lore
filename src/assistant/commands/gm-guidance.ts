// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/gm-guidance.ts
//
// Human-Game-Master narrative steering slash commands:
//   /guide <direction>              — add a narrative direction constraint
//   /constraint <rule>              — add a narrative constraint
//   /scene <description>            — set the scene description
//   /target <character>             — set the character to respond next
//   /priority <character> <level>   — set a participant's turn priority
//   /skip <character>               — record a turn-skip for a character
//
// All of these dispatch to EXISTING backends — no new endpoints or state:
// the first five patch `gm_config.gmGuidance` via the same `updateGmGuidance`
// call as `PUT /api/v1/chats/:id/gm-guidance`; `/skip` records the existing
// turn-skip event (`recordTurnSkip`), the only backend concept for sitting a
// character out.
//
// None of them register a `requiredRole`: that tier is `owner`-gated, which
// would exclude the moderation-tier `gm` participant that
// `checkChatSettingsAccess` deliberately admits. The shared access check is
// the authority instead (see `loadGmTarget`).

import type { Kysely, } from "kysely";
import { checkChatSettingsAccess, updateGmGuidance, } from "../../chat/service";
import { recordTurnSkip, } from "../../chat/service/crud/turn-skip";
import type { GmConfig, GmGuidance, } from "../../chat/types/config";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/** Per-participant turn priority, mirroring `GmGuidance.turnPriority`. */
type TurnPriority = "high" | "medium" | "low";

/** Resolved command target: the chat row is a story chat the caller may steer. */
interface GmTarget {
  db: Kysely<DB>;
  chatId: string;
  userId: string;
  guidance: GmGuidance;
}

/**
 * Every command returns the same handled system-message result shape. @param text
 * @param text
 */
function message(text: string,): CommandResult {
  return { systemMessage: text, handled: true, };
}

/**
 * @param values @param value
 * @param value
 */
function appendUnique(values: readonly string[], value: string,): string[] {
  return values.includes(value,) ? [...values,] : [...values, value,];
}

/** @param value */
function isTurnPriority(value: string | undefined,): value is TurnPriority {
  return value === "high" || value === "medium" || value === "low";
}

/**
 * Resolve the caller's story chat and current GM guidance, or the error
 * result to return. Authority mirrors the HTTP gm-guidance route
 * (`checkChatSettingsAccess`): chat creator, owner or GM participant. The
 * HTTP route additionally admits site admins via its `userRole` argument;
 * `CommandContext` carries no site role, so that branch is unreachable here
 * (fail-closed).
 * @param ctx
 */
async function loadGmTarget(ctx: CommandContext,): Promise<GmTarget | CommandResult> {
  const db = ctx.db;
  if (!db) { return message("**GM guidance unavailable:** command context missing database.",); }
  const userId = ctx.userId;
  if (!userId) { return message("**GM guidance unavailable:** command context missing user.",); }

  const access = await checkChatSettingsAccess(db, ctx.chatId, userId, null,);
  if (!access.ok) {
    return message(`**Permission denied:** ${access.error.message}.`,);
  }

  const row = await db
    .selectFrom("chats",)
    .select("gm_config",)
    .where("id", "=", ctx.chatId,)
    .executeTakeFirst();

  const parsed = row?.gm_config ? safeJsonParse<GmConfig>(row.gm_config,) : null;
  const config = parsed?.ok ? parsed.value : null;
  // Story mode is signalled by `chats.mode = "story"` OR `gm_config.storyMode`
  // (the story panel treats either signal as story mode), so accept both
  // instead of rejecting a story chat whose `mode` column reads "direct".
  if (ctx.activeChat?.mode !== "story" && config?.storyMode !== true) {
    return message("**GM guidance unavailable:** this is not a story chat.",);
  }

  const existing = config?.gmGuidance;
  const guidance: GmGuidance = {
    constraints: existing?.constraints ?? [],
    turnPriority: existing?.turnPriority ?? {},
  };

  if (existing?.targetCharacter !== undefined) { guidance.targetCharacter = existing.targetCharacter; }
  if (existing?.sceneDescription !== undefined) { guidance.sceneDescription = existing.sceneDescription; }
  return { db, chatId: ctx.chatId, userId, guidance, };
}

/**
 * Persist a merged guidance patch and return the confirmation message. @param target @param patch @param ok
 * @param target
 * @param patch
 * @param ok
 */
async function saveGuidance(
  target: GmTarget,
  patch: Partial<GmGuidance>,
  ok: string,
): Promise<CommandResult> {
  const gmGuidance: GmGuidance = { ...target.guidance, ...patch, };
  const result = await updateGmGuidance(target.db, target.chatId, { gmGuidance, },);
  if ("code" in result) { return message(`**GM guidance failed:** ${result.message}`,); }
  return message(ok,);
}

/**
 * Resolve a chat participant by actor id or display name.
 * @param db
 * @param chatId
 * @param nameOrId
 */
async function resolveActorId(
  db: Kysely<DB>,
  chatId: string,
  nameOrId: string,
): Promise<string | null> {
  const participants = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  const needle = nameOrId.toLowerCase();
  for (const p of participants) {
    if (p.actor_id === nameOrId || p.display_name.toLowerCase() === needle) { return p.actor_id; }
  }

  return null;
}

/** @param guidance */
function describeGuidance(guidance: GmGuidance,): string {
  const priorities = Object.entries(guidance.turnPriority,);
  const priorityText = priorities.length > 0
    ? priorities.map(([id, level,],) => `${id}=${level}`).join(", ",)
    : "\u2014";

  return [
    "**GM guidance**",
    `- Scene: ${guidance.sceneDescription ?? "\u2014"}`,
    `- Target: ${guidance.targetCharacter ?? "anyone"}`,
    `- Turn priority: ${priorityText}`,
    `- Constraints: ${guidance.constraints.length > 0 ? guidance.constraints.join("; ",) : "\u2014"}`,
  ].join("\n",);
}

registerCommand("guide", async (args, ctx,): Promise<CommandResult> => {
  const target = await loadGmTarget(ctx,);
  if (!("db" in target)) { return target; }
  const direction = args.join(" ",).trim();
  if (direction.length === 0) { return message(describeGuidance(target.guidance,),); }
  return await saveGuidance(
    target,
    { constraints: appendUnique(target.guidance.constraints, direction,), },
    `**GM guidance:** added direction — ${direction}`,
  );
},);

registerCommand("constraint", async (args, ctx,): Promise<CommandResult> => {
  const target = await loadGmTarget(ctx,);
  if (!("db" in target)) { return target; }
  const rule = args.join(" ",).trim();
  if (rule.length === 0) { return message("Usage: `/constraint <rule>`",); }
  return await saveGuidance(
    target,
    { constraints: appendUnique(target.guidance.constraints, rule,), },
    `**GM guidance:** added constraint — ${rule}`,
  );
},);

registerCommand("scene", async (args, ctx,): Promise<CommandResult> => {
  const target = await loadGmTarget(ctx,);
  if (!("db" in target)) { return target; }
  const scene = args.join(" ",).trim();
  if (scene.length === 0) { return message("Usage: `/scene <description>`",); }
  return await saveGuidance(target, { sceneDescription: scene, }, `**GM guidance:** scene set — ${scene}`,);
},);

registerCommand("target", async (args, ctx,): Promise<CommandResult> => {
  const target = await loadGmTarget(ctx,);
  if (!("db" in target)) { return target; }
  const character = args.join(" ",).trim();
  if (character.length === 0) { return message("Usage: `/target <character>`",); }
  return await saveGuidance(target, { targetCharacter: character, }, `**GM guidance:** targeting ${character}.`,);
},);

registerCommand("priority", async (args, ctx,): Promise<CommandResult> => {
  const target = await loadGmTarget(ctx,);
  if (!("db" in target)) { return target; }
  const character = args[0];
  const level = args[1]?.toLowerCase();
  if (!character || !isTurnPriority(level,)) {
    return message("Usage: `/priority <character> <high|medium|low>`",);
  }

  const actorId = await resolveActorId(target.db, target.chatId, character,);
  if (!actorId) {
    return message(`**GM guidance:** character "${character}" is not a participant of this chat.`,);
  }

  return await saveGuidance(
    target,
    { turnPriority: { ...target.guidance.turnPriority, [actorId]: level, }, },
    `**GM guidance:** ${character} turn priority set to ${level}.`,
  );
},);

registerCommand("skip", async (args, ctx,): Promise<CommandResult> => {
  const target = await loadGmTarget(ctx,);
  if (!("db" in target)) { return target; }
  const character = args.join(" ",).trim();
  if (character.length === 0) { return message("Usage: `/skip <character>`",); }
  const actorId = await resolveActorId(target.db, target.chatId, character,);
  if (!actorId) {
    return message(`**Skip failed:** character "${character}" is not a participant of this chat.`,);
  }

  const result = await recordTurnSkip(target.db, {
    chatId: target.chatId,
    actorId,
    mode: "advance",
    userId: target.userId,
    userRole: null,
  },);

  if (!result.ok) { return message(`**Skip failed:** ${result.message}`,); }
  return message(
    `**GM guidance:** ${character} skips this beat${result.deduped ? " (already recorded)" : ""}.`,
  );
},);
