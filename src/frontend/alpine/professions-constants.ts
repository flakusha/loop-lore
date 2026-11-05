// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared professions-panel constants.
 *
 * Split from `professions.ts` for the 250-line size ceiling; re-exported
 * there so panel and template imports keep working.
 */

/** XP granted per "Add XP" click (GM/testing affordance, per the ticket). */
export const PROFESSION_XP_STEP = 50;

/** Crafting disciplines accepted by POST /api/rpg/professions (t.Enum schema). */
export const PROFESSION_DISCIPLINES = [
  "alchemy",
  "smithing",
  "enchanting",
  "cooking",
  "tailoring",
  "woodworking",
  "jewelry",
  "engineering",
] as const;

// professions-panel.html binds through the ChatState scope, but the
// IIFE-wrapped bundle keeps module scopes private — expose for direct binds.
(globalThis as Record<string, unknown>).PROFESSION_DISCIPLINES = PROFESSION_DISCIPLINES;
