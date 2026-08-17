// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import type { GenDeps, } from "./deps";

/**
 * Options for story-mode generation using GameMasterService for full GM
 * orchestration (turn selection, GM decision, quality evaluation, world-event
 * extraction, quest tracking, escalation).
 */
export interface StoryModeOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  parentMessageId: string | null;
  userId: string;
  gmConfig: string | null;
  worldId: string | null;
  deps: GenDeps;
}
