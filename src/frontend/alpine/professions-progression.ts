// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Professions progression mirror for the Alpine panel.
 *
 * Thin frontend re-export of the server source of truth
 * (`src/rpg/crafting/professions/progression.ts`), so the bundle and the
 * pinning tests in `professions.test.ts` share one ladder. `professions.ts`
 * spreads these methods into the panel mixin.
 */
import { LEVEL_XP, MAX_LEVEL, } from "../../rpg/crafting/professions/progression";

import type { ProfessionView, } from "./types";

export {
  LEVEL_XP,
  MAX_LEVEL,
  progressionBonuses as professionBonuses,
  titleForLevel,
} from "../../rpg/crafting/professions/progression";

/** Level where the next title band starts, or null at the cap. */
export function nextTitleAt(level: number,): number | null {
  if (level >= MAX_LEVEL) {
    return null;
  }

  return Math.min(MAX_LEVEL, (Math.floor((level - 1) / 25,) + 1) * 25 + 1,);
}

/** Progress through the current level (0..1); 1 at the cap. */
export function xpProgress(profession: Pick<ProfessionView, "level" | "experience">,): number {
  if (profession.level >= MAX_LEVEL) {
    return 1;
  }

  return Math.min(1, Math.max(0, (profession.experience % LEVEL_XP) / LEVEL_XP,),);
}
