/**
 * Chat context — shared route options and auth-derived types.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

/** Type for auth-derived properties added by the `derive` hook in createApp */
export interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
