// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Group-chat turn-order resolver (C1 — chat-type matrix UI remainder).
 *
 * Computes a READ-ONLY view of the current turn order for a group chat so the
 * frontend can render a turn-order indicator. Deliberately reuses the pure
 * strategy functions from `STRATEGY_MAP` (single source of truth) rather than
 * re-deriving selection order client-side, so the indicator cannot drift from
 * `src/turning/turn-strategies.ts`.
 *
 * IMPORTANT: this is a *peek* only. It must never call `TurnManager.selectNextActor`
 * (which mutates turn state: increments `currentTurn`, persists `currentActorId`,
 * decrements initiative). The strategy functions themselves are pure, so calling
 * them here has zero side effects.
 */
import type { Kysely, } from "kysely";
import type { TurnStrategy, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { STRATEGY_MAP, } from "../../turning/turn-strategies";
import type { GroupTurnContext, } from "../../turning/types";

/** One ordered slot in the turn-order indicator. */
export interface TurnOrderSlot {
  actor_id: string;
  display_name: string;
  actor_type: string;
  talkativity: number;
  /** True when this actor produced the most recent visible message. */
  isCurrent: boolean;
  /** True when the strategy would select this actor next. */
  isNext: boolean;
}

/** The computed turn-order view returned to the frontend. */
export interface GroupTurnOrder {
  strategy: TurnStrategy | null;
  /** Actor id of the most recent visible message (current speaker). */
  currentActorId: string | null;
  /** Actor id the strategy would select next (pure peek, never persisted). */
  nextActorId: string | null;
  /** Participants in display order (round-robin order by role). */
  order: TurnOrderSlot[];
}

/**
 * Resolve the current turn order for a group chat.
 * @param db
 * @param chatId
 * @returns A read-only snapshot; `null` when the chat is not a group chat or
 *   has no AI participants eligible for turn selection.
 */
export async function resolveGroupTurnOrder(
  db: Kysely<DB>,
  chatId: string,
): Promise<GroupTurnOrder | null> {
  const chat = await db
    .selectFrom("chats",)
    .select(["type", "turn_strategy",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (chat?.type !== "group") { return null; }

  const strategy = chat.turn_strategy;

  // AI participants (non-user) — same eligibility as group turn selection.
  const participants = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select([
      "chat_participants.actor_id",
      "chat_participants.talkativity",
      "chat_participants.initiative",
      "actors.display_name",
      "actors.actor_type",
      "actors.agent_type",
    ],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "!=", "none",)
    .execute();

  if (participants.length === 0) { return null; }

  // Current speaker = actor of the most recent visible message.
  const lastMsg = await db
    .selectFrom("messages",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();

  const currentActorId = lastMsg?.actor_id ?? null;

  // Turn strategy inputs (same shapes STRATEGY_MAP expects).
  const turnParticipants = Array.from(participants, (p,) => ({
    actorId: p.actor_id,
    type: p.actor_type,
    agentType: p.agent_type,
    talkativity: p.talkativity ?? 5,
    initiativeScore: p.initiative,
  }),);

  // Display order: round-robin by role (narrator/ai/npc first), then name.
  const typeOrder: Record<string, number> = { narrator: 0, ai: 1, npc: 2, };
  const ordered = [...turnParticipants,].sort((a, b,) => {
    const aOrder = typeOrder[a.agentType] ?? 99;
    const bOrder = typeOrder[b.agentType] ?? 99;
    if (aOrder !== bOrder) { return aOrder - bOrder; }
    return a.actorId.localeCompare(b.actorId,);
  },);

  // Pure strategy peek — the "next" actor per the active strategy. Never
  // persists; currentActorId feeds the strategy as the "current" actor.
  const context: GroupTurnContext = { chatMode: "group", isPaused: false, };
  const selectFn = strategy ? STRATEGY_MAP[strategy] : null;
  const nextActorId = selectFn
    ? selectFn(turnParticipants, currentActorId, 0, Array.from(ordered, (p,) => p.actorId,), context,)
    : null;

  const order: TurnOrderSlot[] = Array.from(ordered, (p,) => ({
    actor_id: p.actorId,
    display_name: participants.find((x,) => x.actor_id === p.actorId)?.display_name ?? p.actorId,
    actor_type: p.type,
    talkativity: p.talkativity,
    isCurrent: p.actorId === currentActorId,
    isNext: p.actorId === nextActorId,
  }),);

  return {
    strategy,
    currentActorId,
    nextActorId,
    order,
  };
}
