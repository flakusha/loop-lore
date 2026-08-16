// src/assistant/commands/stats.ts
//
// /stats — Show the current character's RPG statistics.
//
// Character resolution (proposed model):
//   1. The impersonated character (chat_participants.impersonate_actor_id),
//      if the caller is currently impersonating someone.
//   2. Otherwise the first non-user participant in the chat — the character
//      the user is talking to (mirrors auto-gen `resolveActor` single-chat).
//
// Falls back to a helpful message when no character can be resolved or no
// `character_stats` row exists yet (stats are created lazily on first use).

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getCharacterStats, } from "../../rpg/service";
import { type CommandResult, registerCommand, } from "./registry";

registerCommand("stats", async (_args, ctx,): Promise<CommandResult> => {
  const db = ctx.db;
  if (!db) {
    return { systemMessage: "**Stats unavailable:** command context missing database.", handled: true, };
  }

  const resolved = await resolveStatCharacter(db, ctx.chatId, ctx.userId ?? "",);

  if (!resolved.characterId) {
    return {
      systemMessage: "**Stats:** no character found in this chat. Join a character to view stats.",
      handled: true,
    };
  }

  const stats = await getCharacterStats({ database: db, }, resolved.characterId,);
  if (!stats) {
    return {
      systemMessage:
        `**Stats** for ${resolved.characterName}:** no stats recorded yet. Stats are created when a character first enters play.`,
      handled: true,
    };
  }

  return {
    systemMessage: formatStats(resolved.characterName, stats,),
    action: "show-stats",
    actionPayload: { characterId: resolved.characterId, stats, },
    handled: true,
  };
},);

interface ResolvedStatCharacter {
  characterId: string | null;
  characterName: string;
}

/** Resolve the character whose stats should be shown. */
async function resolveStatCharacter(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<ResolvedStatCharacter> {
  // 1. Impersonated character takes precedence.
  const participant = await db
    .selectFrom("chat_participants",)
    .select(["impersonate_actor_id",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .executeTakeFirst();

  if (participant?.impersonate_actor_id) {
    const actor = await db
      .selectFrom("actors",)
      .select(["display_name",],)
      .where("id", "=", participant.impersonate_actor_id,)
      .executeTakeFirst();
    return {
      characterId: participant.impersonate_actor_id,
      characterName: actor?.display_name ?? "this character",
    };
  }

  // 2. First non-user participant (the character being talked to).
  const character = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("chat_participants.actor_id", "!=", actorId,)
    .select(["actors.id", "actors.display_name",],)
    .executeTakeFirst();

  return {
    characterId: character?.id ?? null,
    characterName: character?.display_name ?? "this character",
  };
}

interface StatRow {
  level: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  ac: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  xp: number;
  xpToNext: number;
}

/** Format a stats row as a readable markdown block. */
export function formatStats(name: string, s: StatRow,): string {
  return [
    `**${name} — Stats**`,
    `- **Level:** ${s.level}`,
    `- **HP:** ${s.hp}/${s.maxHp}`,
    `- **MP:** ${s.mp}/${s.maxMp}`,
    `- **AC:** ${s.ac}`,
    `- **STR** ${s.str} · **DEX** ${s.dex} · **CON** ${s.con}`,
    `- **INT** ${s.int} · **WIS** ${s.wis} · **CHA** ${s.cha}`,
    `- **XP:** ${s.xp}/${s.xpToNext}`,
  ].join("\n",);
}
