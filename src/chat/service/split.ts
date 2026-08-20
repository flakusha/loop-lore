// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Party Split / Reunion (C7 Phase 3 — group-chat VN party migration)
 *
 * Party split: creates N branched chats directly, each with a different subset
 * of participants. A narration message is injected into each branch and the
 * parent chat.
 *
 * Party reunion: merges messages from a source chat into the primary chat
 * in chronological order, deduplicates participants, and archives the source.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { copyMessagesToPrimary, createBranchChat, mergeParticipantsIntoPrimary, } from "./split-utils";
import { injectNarration, } from "./transitions";
import type { ServiceError, } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

/** One branch in a party split. */
export interface SplitBranch {
  locationId: string;
  actorIds: string[];
  name?: string;
}

/** Parameters for party split. */
export interface SplitPartyParams {
  chatId: string;
  actorId: string;
  branches: SplitBranch[];
}

/** Successful split result. */
export interface SplitSuccess {
  ok: true;
  branches: { chatId: string; locationId: string; participantCount: number }[];
  splitNarration: string;
}

/** Result type for party split. */
export type SplitPartyResult = SplitSuccess | ServiceError;

/** Parameters for party reunion. */
export interface ReunitePartyParams {
  primaryChatId: string;
  secondaryChatId: string;
  actorId: string;
}

/** Successful reunion result. */
export interface ReuniteSuccess {
  ok: true;
  mergedMessageCount: number;
  reunionNarration: string;
}

/** Result type for party reunion. */
export type ReunitePartyResult = ReuniteSuccess | ServiceError;

// ── Party Split ────────────────────────────────────────────────────────────

/**
 * Split a party into N sub-parties at different locations.
 *
 * Each branch creates a new chat with `parent_chat_id = sourceChatId`, copying
 * the source chat's type, mode, and GM config. Participants not in a branch's
 * actor list are excluded. The source chat receives a "party split" narration;
 * each branch receives a "party splits — [name]" narration.
 *
 * Ownership guard: only the chat owner may split.
 */
export async function splitParty(
  database: Kysely<DB>,
  params: SplitPartyParams,
): Promise<SplitPartyResult> {
  const { chatId, actorId, branches, } = params;

  const chat = await database
    .selectFrom("chats",)
    .select(["id", "name", "created_by", "type", "mode", "gm_config", "visual_novel", "world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { code: "not_found", message: "Chat not found", };
  }

  if (chat.created_by !== actorId) {
    return { code: "forbidden", message: "Only the chat owner can split the party", };
  }

  if (branches.length < 2) {
    return { code: "bad_request", message: "At least two branches are required", };
  }

  const branchResults: { chatId: string; locationId: string; participantCount: number }[] = [];

  for (const branch of branches) {
    if (branch.actorIds.length === 0) { continue; }

    const result = await createBranchChat(
      database,
      chatId,
      {
        type: chat.type,
        mode: chat.mode,
        gm_config: chat.gm_config,
        visual_novel: chat.visual_novel,
        world_id: chat.world_id,
      },
      branch.name ?? "Unknown",
      branch.locationId,
      branch.actorIds,
      actorId,
    );

    branchResults.push(result,);
  }

  const allNames: string[] = Array.from(branches, b => b.name ?? "Unknown",);

  await injectNarration(
    database,
    chatId,
    `The party splits into separate groups: ${allNames.join(", ",)}.`,
  );

  return {
    ok: true,
    branches: branchResults,
    splitNarration: `The party splits into: ${allNames.join(", ",)}.`,
  };
}

// ── Party Reunion ──────────────────────────────────────────────────────────

/**
 * Reunite split parties: merge messages from the secondary chat into the
 * primary chat in chronological order, deduplicate participants, and post
 * a reunion narration in both chats.
 *
 * Ownership guard: only the primary chat owner may initiate reunion.
 */
export async function reuniteChats(
  database: Kysely<DB>,
  params: ReunitePartyParams,
): Promise<ReunitePartyResult> {
  const { primaryChatId, secondaryChatId, actorId, } = params;

  const primary = await database
    .selectFrom("chats",)
    .select(["id", "created_by",],)
    .where("id", "=", primaryChatId,)
    .executeTakeFirst();

  const secondary = await database
    .selectFrom("chats",)
    .select(["id",],)
    .where("id", "=", secondaryChatId,)
    .executeTakeFirst();

  if (!primary) { return { code: "not_found", message: "Primary chat not found", }; }
  if (!secondary) { return { code: "not_found", message: "Secondary chat not found", }; }

  if (primary.created_by !== actorId) {
    return { code: "forbidden", message: "Only the primary chat owner can initiate a reunion", };
  }

  const mergedCount = await copyMessagesToPrimary(database, primaryChatId, secondaryChatId,);
  await mergeParticipantsIntoPrimary(database, primaryChatId, secondaryChatId,);

  await injectNarration(
    database,
    primaryChatId,
    "The party reunites! The separate groups come back together.",
  );

  await injectNarration(
    database,
    secondaryChatId,
    "The party has reunited elsewhere. This branch is now archived.",
  );

  return {
    ok: true,
    mergedMessageCount: mergedCount,
    reunionNarration: "The party reunites! The separate groups come back together.",
  };
}
