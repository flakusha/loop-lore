import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema.js";

export interface RpgServiceDeps {
  database: Kysely<DB>;
}
