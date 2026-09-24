// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export { INTERACTION_COMMANDS, INTERACTION_SKILL_MATRIX, } from "./catalog";
export type {
  InteractionCommandDefinition,
  InteractionRipple,
} from "./catalog";
export { getRecentInteractions, InteractionService, resolveInteraction, } from "./service";
export type {
  InteractionContext,
  InteractionModifier,
  InteractionResolution,
  InteractionService as InteractionServiceContract,
  InteractionStateChange,
  InteractionSummary,
  MaterialRequirement,
  RecentInteractionParams,
  ResolvedInteraction,
  ResolveInteractionParams,
} from "./types";
