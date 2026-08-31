// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { TurnManagerState, } from "../types";

/** */
export interface TurnManagerOptions {
  db: Kysely<DB>;
  chatId: string;
  /** Quality thresholds for regeneration (story mode only) */
  maxRegenerations?: number;
}

/** Handle for the manager's runtime state, threaded into dispatcher modules. */
export interface TurnManagerHost {
  db: Kysely<DB>;
  chatId: string;
  maxRegenerations: number;
  state: TurnManagerState | null;
}
