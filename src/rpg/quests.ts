// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/quests.ts — barrel re-export of the quest engine for the rpg/ surface.
 *
 * TASK-029 binds question-based gameplay to quest progression; the canonical
 * quest engine lives at `src/story/quest-engine/`. Re-exporting it under the
 * `rpg/` namespace keeps the chat/question caller imports stable
 * (`import { QuestEngine } from "./quests"`) and gives the rpg/ surface a
 * single place to grow quest-side helpers (question→quest routing, etc.).
 */

export { createQuestEngine, QuestEngine, } from "../story/quest-engine";
export type { QuestProgressEntry, } from "../story/quest-engine";
