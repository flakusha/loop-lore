/**
 * User routes — shared options type.
 */
import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";

export interface UsersRoutesOpts {
  database: Db;
  config: Config;
}
