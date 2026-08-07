/**
 * NSFW Moderation — shared route options type.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
}
