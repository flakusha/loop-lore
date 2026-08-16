// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Decision strategy registry — source of truth for GM modes.
 *
 * Add a mode: create a strategy file under ./ and add one line here. The
 * GameMasterService dispatches by config.type instead of a switch.
 */
import { GameMasterType, } from "../../../db/enums";
import { humanDecision, } from "./human";
import { hybridDecision, } from "./hybrid";
import { llmDecision, } from "./llm";
import type { GmDecisionStrategy, } from "./types";

export const GM_DECISIONS: Record<GameMasterType, GmDecisionStrategy> = {
  [GameMasterType.Llm]: llmDecision,
  [GameMasterType.Human]: humanDecision,
  [GameMasterType.Hybrid]: hybridDecision,
};
