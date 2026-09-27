// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/mood.ts — barrel re-export of the canonical MoodService for the
 * rpg/ surface.
 *
 * TASK-041: the canonical mood service lives in Character Core at
 * `src/characters/services/mood-service/` (factory + declaration-merged
 * class). Re-exporting it under the `rpg/` namespace alongside `intimacy.ts`
 * gives NSFW services (settle.ts, participant-legs.ts, fulfill.ts,
 * logLevelChangeMood) a stable import path on the rpg/ surface, matching the
 * `import { MoodService } from "../rpg/mood"` shape the AC literal requires.
 */
export { MoodService, } from "../characters/services/mood-service";
