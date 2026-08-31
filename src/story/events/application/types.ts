// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Event Application — Types
 *
 * Applied event result and apply-events options.
 */
import type { Kysely, Transaction, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { WorldEvent, } from "../../types";

/** */
export interface AppliedEvent {
  event: WorldEvent;
  applied: boolean;
  error?: string;
}

/** */
export interface ApplyEventsOpts {
  db: Kysely<DB>;
  worldId: string;
  events: WorldEvent[];
  trx?: Transaction<DB>;
  /** Provenance tag for the world timeline; null or absent → unattributed. */
  storyId?: string | null;
}
