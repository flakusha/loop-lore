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
