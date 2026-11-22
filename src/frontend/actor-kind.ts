// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { ActorType, AgentType, } from "../db/enums-core/actors";

/** The subset of an `/api/v1/actors` row the kind filters inspect. */
export interface KindableActor {
  id?: string;
  actor_type?: string;
  agent_type?: string;
}

/**
 * Narrow actor rows by participant kind. Pure: no DOM, no mutation of the
 * input array. Unknown/missing kind behaves like "all".
 *
 * - "user" / "character": the row's `actor_type`.
 * - "assistant": LLM-driven rows (`agent_type = "ai"`) — the cast that serves
 *   the `assistant_group` / `llm_only_group` / `llm_only_group_gm` chats.
 * - "plain": every row that is not LLM-driven (rows without an `agent_type`
 *   included).
 * @param actors
 * @param kind - "all" | "user" | "character" | "assistant" | "plain"
 * @returns the rows matching the kind
 */
export function filterActorsByKind<T extends KindableActor,>(actors: T[], kind: string,): T[] {
  switch (kind) {
    case "user":
      return actors.filter((a,) => a.actor_type === ActorType.User);
    case "character":
      return actors.filter((a,) => a.actor_type === ActorType.Character);
    case "assistant":
      return actors.filter((a,) => a.agent_type === AgentType.Ai);
    case "plain":
      return actors.filter((a,) => a.agent_type !== AgentType.Ai);
    default:
      return actors;
  }
}
