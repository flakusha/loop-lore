import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Shared per-route options threaded into every character-io sub-plugin.
 */
export interface HandlerOpts {
  database: Kysely<DB>;
}
