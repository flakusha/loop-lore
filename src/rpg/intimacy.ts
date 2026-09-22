// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/intimacy.ts — barrel re-export of the intimacy subsystem for the
 * rpg/ surface.
 *
 * TASK-033: the canonical intimacy service lives at `src/rpg/intimacy/service`.
 * Re-exporting it under the `rpg/` namespace (alongside `quests.ts`) gives
 * the rpg surface a single import path and lets routes reach the service
 * via `import { IntimacyService } from "../rpg/intimacy"`.
 */

export { IntimacyLevel, } from "../db/enums-character/nsfw";
export { IntimacyService, } from "./intimacy";
export {
  INTIMACY_THRESHOLDS,
} from "./intimacy/service";
export type {
  ApplyIntimacyActionOpts,
  ApplyIntimacyResult,
  IntimacyAction,
  IntimacyHistoryEntry,
  IntimacyPair,
  IntimacyThreshold,
} from "./intimacy/service";
