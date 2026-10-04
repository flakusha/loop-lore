// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state pure helpers.
 *
 * Derivation + UI glue shared by the story-state component: chat-id lookup,
 * toasts, quest-banner parsing, quality/quest display helpers, turn
 * summarization and participant mapping. Extracted so `story-state.ts` stays
 * under the 250L file-size guard.
 */

import { jsonParseOr, } from "../json";
import type {
  QuestBanner,
  QuestMilestone,
  StoryParticipant,
  StoryQuest,
  StoryTurnMeta,
  StoryTurnRow,
} from "./types";

/** Participant row as returned by GET /api/v1/chats/:id/participants. */
export interface ParticipantRow {
  actor_id: string;
  name: string;
  display_name?: string;
  actor_type?: string;
}

/**
 * Resolve the active chat id from the global Alpine `chat` store.
 * @returns {string | null}
 */
export function activeChatId(): string | null {
  const alpine = (globalThis as { Alpine?: { store: (name: string,) => Record<string, unknown> } }).Alpine;
  const chat = alpine?.store("chat",) as { currentChat?: { id?: string } } | undefined;
  const fromStore = chat?.currentChat?.id;
  if (fromStore) { return fromStore; }
  // The chat page is always entered as /views/chat?chatid=<id> (chat list, new
  // chat, notification links). storyState() initializes before chatState's
  // async selectChat fills the store, so without this fallback the story panel
  // bails out and never loads on a fresh page load.
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? "";
  return new URLSearchParams(search,).get("chatid",) || null;
}

/**
 * Post a toast via the app store (no-op when the store is unavailable).
 * @param message
 * @param type
 * @returns {void}
 */
export function toast(message: string, type = "info",): void {
  try {
    const alpine =
      (globalThis as { Alpine?: { store: (name: string,) => { toast: (t: string, m: string,) => void } } }).Alpine;

    alpine?.store("app",)?.toast(type, message,);
  } catch {
    /* toast is best-effort */
  }
}

/**
 * Parse quest_progress JSON from a turn into display banners.
 * @param raw
 * @returns {QuestBanner[]}
 */
export function parseQuestBanners(raw: string,): QuestBanner[] {
  const entries = jsonParseOr<{ quest_name?: string; questName?: string; progress?: number }[]>(raw, [],);
  if (!Array.isArray(entries,)) { return []; }
  const banners: QuestBanner[] = [];
  for (const entry of entries) {
    if (typeof entry?.progress !== "number") { continue; }
    const name = entry.quest_name;
    const altName = entry.questName;
    banners.push({
      questName: typeof name === "string" ? name : typeof altName === "string" ? altName : "Quest",
      progress: Math.round(entry.progress,),
    },);
  }

  return banners;
}

/**
 * CSS tier for a quality score: good (≥70) / mid (≥40) / low.
 * @param score
 * @returns {string}
 */
export function qualityClass(score: number,): string {
  if (score >= 70) { return "is-good"; }
  if (score >= 40) { return "is-mid"; }
  return "is-low";
}

/**
 * Quest progress clamped to 0..100.
 *
 * Percentage of `target` when one is present; falls back to the raw
 * `progress` value for legacy rows without a target (progress is already a
 * percentage in that shape).
 * @param quest
 * @returns {number}
 */
export function questProgressPct(quest: StoryQuest,): number {
  const pct = typeof quest.target === "number" && quest.target > 0
    ? (quest.progress / quest.target) * 100
    : quest.progress;

  return Math.max(0, Math.min(100, Math.round(pct,),),);
}

/** Rewards JSON as stored on a quest row (`rewards` column). */
interface QuestRewardShape {
  xp?: number;
  items?: { itemId: string; quantity: number }[];
}

/**
 * Parse a quest's narrative-hook milestones (`narrative_hooks` JSON).
 * @param quest
 * @returns {QuestMilestone[]}
 */
export function questMilestones(quest: StoryQuest,): QuestMilestone[] {
  const parsed = jsonParseOr<{ progress?: number; narrative?: string }[]>(quest.narrative_hooks ?? "[]", [],);
  if (!Array.isArray(parsed,)) { return []; }
  const milestones: QuestMilestone[] = [];
  for (const entry of parsed) {
    if (typeof entry?.progress === "number" && typeof entry.narrative === "string") {
      milestones.push({ progress: entry.progress, narrative: entry.narrative, },);
    }
  }

  return milestones;
}

/**
 * Human-readable reward chips from a quest's `rewards` JSON.
 * @param quest
 * @returns {string[]}
 */
export function questRewardChips(quest: StoryQuest,): string[] {
  // The `rewards` column stores whatever JSON the quest create/patch body
  // carried (no shape validation server-side), so a scalar / array / null
  // payload must degrade to "no chips" instead of throwing inside an Alpine
  // `x-for` render, which would blank the whole GM quests tab.
  const rewards = jsonParseOr<QuestRewardShape>(quest.rewards ?? "{}", {},);
  if (typeof rewards !== "object" || rewards === null) { return []; }
  const chips: string[] = [];
  if (typeof rewards.xp === "number" && rewards.xp > 0) { chips.push(`+${rewards.xp} XP`,); }
  for (const item of Array.isArray(rewards.items,) ? rewards.items : []) {
    if (typeof item?.itemId !== "string" || typeof item.quantity !== "number") { continue; }
    chips.push(`${item.itemId} \u00d7${item.quantity}`,);
  }

  return chips;
}

/** Derived state from the latest story turn (or an empty default). */
export interface TurnSummary {
  turnMeta: Record<string, StoryTurnMeta>;
  turnNumber: number | null;
  promptSent: string | null;
  running: boolean;
  banners: QuestBanner[];
}

/**
 * Index turns by parent message id and derive latest-turn state.
 * @param turns
 * @returns {TurnSummary}
 */
export function summarizeTurns(turns: StoryTurnRow[],): TurnSummary {
  const turnMeta: Record<string, StoryTurnMeta> = {};
  let latest: StoryTurnRow | null = null;
  for (const turn of turns) {
    if (turn.parent_message_id) {
      turnMeta[turn.parent_message_id] = {
        turnNumber: turn.turn_number,
        qualityScore: turn.quality_score ?? null,
        promptSent: turn.prompt_sent ?? "",
        status: turn.status,
      };
    }

    if (!latest || turn.turn_number > latest.turn_number) { latest = turn; }
  }

  if (!latest) {
    return { turnMeta, turnNumber: null, promptSent: null, running: false, banners: [], };
  }

  return {
    turnMeta,
    turnNumber: latest.turn_number,
    promptSent: latest.prompt_sent ?? null,
    running: latest.status === "pending" || latest.status === "in_progress",
    banners: parseQuestBanners(latest.quest_progress,),
  };
}

/**
 * Map participant rows to turn-order actors plus the next actor's name.
 * @param participants
 * @returns {{ actors: StoryParticipant[]; nextActorName: string | null; }}
 */
export function mapParticipants(
  participants: ParticipantRow[],
): { actors: StoryParticipant[]; nextActorName: string | null } {
  const actors: StoryParticipant[] = Array.from(participants, (p, index,) => ({
    id: p.actor_id,
    name: p.display_name ?? p.name,
    type: p.actor_type ?? "character",
    role: p.actor_type === "assistant" ? "gm" : "player",
    isActive: index === 0,
    order: index,
  }),);

  return { actors, nextActorName: actors[0]?.name ?? null, };
}
