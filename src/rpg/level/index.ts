// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** LevelService — the character XP → level → stat pipeline. */

export { type AbilityName, ALL_ABILITIES, } from "../stats/types.js";
export {
  awardXpToActor,
  ensureCharacterStats,
} from "./service.js";
export {
  type AwardXpInput,
  type AwardXpResult,
  LevelServiceError,
  XP_TO_NEXT_MAX_SENTINEL,
} from "./types.js";
