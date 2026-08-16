// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
  config: { auth: AuthConfig };
}

export type Row = Record<string, unknown>;

export interface ImportCounts {
  world: number;
  locations: number;
  world_lore_entries: number;
  quests: number;
  world_states: number;
  location_states: number;
}
