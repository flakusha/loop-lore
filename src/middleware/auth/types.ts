/**
 * Auth middleware types.
 */
import type { Kysely, } from "kysely";
import type { AuthConfig, } from "../../config/schema";
import type { DB, } from "../../db/schema";

export interface AuthenticateOpts {
  request: Request;
  database: Kysely<DB>;
  authConfig: AuthConfig;
}
