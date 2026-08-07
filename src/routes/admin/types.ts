import type { Config, } from "../../config/schema";
import type { Db, } from "../../db";

/** Shared per-route options threaded into every split sub-plugin. */
export interface AdminRouteOpts {
  database: Db;
  config: Config;
}
