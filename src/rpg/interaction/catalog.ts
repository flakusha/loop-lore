// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { InteractionCategory, RelationshipEventType, } from "../../db/enums";

export interface InteractionRipple {
  event: RelationshipEventType;
  favorDelta: number;
  renownDelta: number;
  failureFavorDelta?: number;
  failureRenownDelta?: number;
}

export interface InteractionCommandDefinition {
  command: string;
  category: InteractionCategory;
  skill: string;
  difficulty: number;
  actionPoints: number;
  usage: string;
  target?: "required";
  ripple?: InteractionRipple;
}

/** The only registry needed to add a reference interaction verb. */
export const INTERACTION_COMMANDS: Record<string, InteractionCommandDefinition> = {
  forage: {
    command: "forage",
    category: InteractionCategory.Survival,
    skill: "survival",
    difficulty: 10,
    actionPoints: 1,
    usage: "Usage: `/forage [location]`",
  },
  evaluate: {
    command: "evaluate",
    category: InteractionCategory.Economy,
    skill: "intellect",
    difficulty: 10,
    actionPoints: 1,
    usage: "Usage: `/evaluate <item>`",
  },
  persuade: {
    command: "persuade",
    category: InteractionCategory.Social,
    skill: "persuasion",
    difficulty: 12,
    actionPoints: 1,
    usage: "Usage: `/persuade <target> [proposal]`",
    target: "required",
    ripple: {
      event: RelationshipEventType.Praised,
      favorDelta: 5,
      renownDelta: 1,
      failureFavorDelta: -2,
      failureRenownDelta: -1,
    },
  },
  hide: {
    command: "hide",
    category: InteractionCategory.Stealth,
    skill: "stealth",
    difficulty: 12,
    actionPoints: 1,
    usage: "Usage: `/hide [location]`",
  },
  study: {
    command: "study",
    category: InteractionCategory.Intellect,
    skill: "intellect",
    difficulty: 10,
    actionPoints: 1,
    usage: "Usage: `/study <subject>`",
  },
};

export const INTERACTION_SKILL_MATRIX = INTERACTION_COMMANDS;
