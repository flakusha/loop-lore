// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Profession progression — the pure 5-tier ladder from
 * `.plan/epics/epic-crafting-professions.md` (§ Profession Progression).
 *
 * Levels 1-100; each level costs {@link LEVEL_XP} experience. The title and
 * the four bonus families (success / quality / speed / material saving) are
 * derived from the level alone, so every consumer (service, crafting process,
 * routes) sees the same numbers.
 */

import { ProfessionTitle, } from "../../../db/enums-crafting.js";
import type { ProfessionBonuses, ProfessionProgression, } from "./types";

/** Experience required per profession level. */
export const LEVEL_XP = 100;

/** Hard level cap — Grandmaster. */
export const MAX_LEVEL = 100;

/** Title bands: 1-25, 26-50, 51-75, 76-99, 100 (epic ladder). */
const TITLE_BANDS: ReadonlyArray<{ min: number; title: ProfessionTitle }> = [
  { min: 76, title: ProfessionTitle.Master, },
  { min: 51, title: ProfessionTitle.Expert, },
  { min: 26, title: ProfessionTitle.Journeyman, },
  { min: 1, title: ProfessionTitle.Apprentice, },
];

/**
 * Title for a profession level.
 * @param level
 * @returns the band title (Grandmaster at the cap)
 * @throws {Error} When the level is outside 1..{@link MAX_LEVEL}
 */
export function titleForLevel(level: number,): ProfessionTitle {
  if (!Number.isInteger(level,) || level < 1 || level > MAX_LEVEL) {
    throw new Error(`Profession level out of range: ${level}`,);
  }

  if (level === MAX_LEVEL) { return ProfessionTitle.Grandmaster; }

  return TITLE_BANDS.find(b => level >= b.min)!.title;
}

/**
 * Level bonuses (fractions 0..1) from the epic ladder:
 * Journeyman +5% success, Expert +10% quality, Master +15% speed,
 * Grandmaster +20% all.
 * @param level
 * @returns the bonus set for that level
 * @throws {Error} When the level is outside 1..{@link MAX_LEVEL}
 */
export function progressionBonuses(level: number,): ProfessionBonuses {
  const title = titleForLevel(level,);
  const zero: ProfessionBonuses = { success: 0, quality: 0, speed: 0, materialSaving: 0, };
  switch (title) {
    case ProfessionTitle.Apprentice:
      return zero;
    case ProfessionTitle.Journeyman:
      return { ...zero, success: 0.05, };
    case ProfessionTitle.Expert:
      return { ...zero, quality: 0.10, };
    case ProfessionTitle.Master:
      return { ...zero, speed: 0.15, };
    case ProfessionTitle.Grandmaster:
      return { success: 0.20, quality: 0.20, speed: 0.20, materialSaving: 0.20, };
  }
}

/**
 * Experience still needed to reach the next level.
 * @param level
 * @returns the XP gap in units of {@link LEVEL_XP}, or null at the cap
 * @throws {Error} When the level is outside 1..{@link MAX_LEVEL}
 */
export function xpForNextLevel(level: number,): number | null {
  titleForLevel(level,);
  if (level === MAX_LEVEL) { return null; }
  return LEVEL_XP;
}

/**
 * Full progression snapshot for a level.
 * @param level
 * @returns level, title, bonuses and the next title band threshold
 * @throws {Error} When the level is outside 1..{@link MAX_LEVEL}
 */
export function getProgression(level: number,): ProfessionProgression {
  const title = titleForLevel(level,);
  return {
    level,
    title,
    bonuses: progressionBonuses(level,),
    nextTitleAt: level === MAX_LEVEL ? null : Math.min(MAX_LEVEL, (Math.floor((level - 1) / 25,) + 1) * 25 + 1,),
  };
}
