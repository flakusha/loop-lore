// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { BodyBuild, } from "../../../db/enums";
import type { BodyProfile, } from "./types";

/**
 * Calculate effective encounter duration based on stamina + endurance.
 * @param profile
 */
export function calculateEncounterDuration(profile: BodyProfile,): number {
  return Math.floor((profile.stamina + profile.endurance) / 10,);
}

/**
 * Calculate available positions/actions based on flexibility + build.
 * @param profile
 */
export function calculateAvailableActions(profile: BodyProfile,): number {
  const base = Math.floor(profile.flexibility / 10,);
  const buildBonuses: Record<BodyBuild, number> = {
    [BodyBuild.Athletic]: 2,
    [BodyBuild.Slim]: 1,
    [BodyBuild.Heavy]: -1,
    [BodyBuild.Average]: 0,
    [BodyBuild.Curvy]: 0,
    [BodyBuild.Muscular]: 0,
  };
  const buildBonus = buildBonuses[profile.build];
  return Math.max(1, base + buildBonus,);
}

/**
 * Calculate arousal buildup modifier from sensitivity + body.
 * @param profile
 */
export function calculateArousalModifier(profile: BodyProfile,): number {
  return 0.5 + (profile.sensitivity / 100) * 1.5;
}
