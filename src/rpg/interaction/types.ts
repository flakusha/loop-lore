// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { InteractionCategory, InteractionOutcome, } from "../../db/enums";
import type { AdvantageMode, DiceRollResult, } from "../dice";

export interface InteractionModifier {
  source: string;
  value: number;
}

export interface InteractionContext {
  actorId: string;
  chatId: string;
  worldId: string | null;
  targetActorId: string | null;
  locationId: string | null;
  actionPoints: number;
  skill: string;
  difficulty: number;
  advantage: AdvantageMode;
  modifiers: InteractionModifier[];
}

export interface MaterialRequirement {
  itemName: string;
  quantity: number;
}

export interface ResolvedInteraction {
  context: InteractionContext;
  roll: DiceRollResult;
  outcome: Exclude<InteractionOutcome, "blocked">;
  margin: number;
}

export interface InteractionResolution {
  id: string | null;
  context: InteractionContext | null;
  roll: DiceRollResult | null;
  outcome: InteractionOutcome;
  margin: number | null;
  stateChanges: Record<string, unknown>;
  systemMessage: string;
}

export interface InteractionSummary {
  command: string;
  category: InteractionCategory;
  skill: string;
  difficulty: number;
  rollTotal: number | null;
  rollMargin: number | null;
  advantage: AdvantageMode;
  outcome: InteractionOutcome;
  modifiers: InteractionModifier[];
  stateChanges: Record<string, unknown>;
}

export type InteractionStateChange = (
  resolution: ResolvedInteraction,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export interface InteractionService {
  resolve(params: ResolveInteractionParams,): Promise<InteractionResolution>;
  recent(params: RecentInteractionParams,): Promise<InteractionSummary[]>;
}

export interface ResolveInteractionParams {
  command: string;
  category: InteractionCategory;
  actorId: string;
  chatId: string;
  worldId?: string | null;
  targetActorId?: string | null;
  locationId?: string | null;
  actionPoints?: number;
  skill: string;
  difficulty: number;
  advantage?: AdvantageMode;
  modifiers?: InteractionModifier[];
  requirements?: MaterialRequirement[];
  stateChange?: InteractionStateChange;
}

export interface RecentInteractionParams {
  chatId: string;
  limit?: number;
}
