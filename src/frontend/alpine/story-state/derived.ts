/**
 * Story-state pure helpers.
 *
 * Derivation + UI glue shared by the story-state component: chat-id lookup,
 * toasts, quest-banner parsing, quality/quest display helpers, turn
 * summarization and participant mapping. Extracted so `story-state.ts` stays
 * under the 250L file-size guard.
 */

import { jsonParseOr, } from "../json";
import type { QuestBanner, StoryParticipant, StoryQuest, StoryTurnMeta, StoryTurnRow, } from "./types";

/** Participant row as returned by GET /api/v1/chats/:id/participants. */
export interface ParticipantRow {
  actor_id: string;
  name: string;
  display_name?: string;
  actor_type?: string;
}

/** Resolve the active chat id from the global Alpine `chat` store. */
export function activeChatId(): string | null {
  const alpine = (globalThis as { Alpine?: { store: (name: string,) => Record<string, unknown> } }).Alpine;
  const chat = alpine?.store("chat",) as { currentChat?: { id?: string } } | undefined;
  return chat?.currentChat?.id ?? null;
}

/** Post a toast via the app store (no-op when the store is unavailable). */
export function toast(message: string, type = "info",): void {
  try {
    const alpine =
      (globalThis as { Alpine?: { store: (name: string,) => { toast: (t: string, m: string,) => void } } }).Alpine;
    alpine?.store("app",)?.toast(type, message,);
  } catch {
    /* toast is best-effort */
  }
}

/** Parse quest_progress JSON from a turn into display banners. */
export function parseQuestBanners(raw: string,): QuestBanner[] {
  const entries = jsonParseOr<{ quest_name?: string; questName?: string; progress?: number }[]>(raw, [],);
  const banners: QuestBanner[] = [];
  for (const entry of entries) {
    if (typeof entry.progress !== "number") { continue; }
    banners.push({
      questName: entry.quest_name ?? entry.questName ?? "Quest",
      progress: Math.round(entry.progress,),
    },);
  }
  return banners;
}

/** CSS tier for a quality score: good (≥70) / mid (≥40) / low. */
export function qualityClass(score: number,): string {
  if (score >= 70) { return "is-good"; }
  if (score >= 40) { return "is-mid"; }
  return "is-low";
}

/** Quest progress clamped to 0..100. */
export function questProgressPct(quest: StoryQuest,): number {
  return Math.max(0, Math.min(100, Math.round(quest.progress,),),);
}

/** Derived state from the latest story turn (or an empty default). */
export interface TurnSummary {
  turnMeta: Record<string, StoryTurnMeta>;
  turnNumber: number | null;
  promptSent: string | null;
  running: boolean;
  banners: QuestBanner[];
}

/** Index turns by parent message id and derive latest-turn state. */
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

/** Map participant rows to turn-order actors plus the next actor's name. */
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
