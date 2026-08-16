// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World State Service — Types
 *
 * Shared dispatcher state handle.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Mutable view of the world state service's db handle threaded to dispatchers */
export interface WorldState {
  db: Kysely<DB>;
}
