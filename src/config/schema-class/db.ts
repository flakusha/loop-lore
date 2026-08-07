// src/config/schema-class/db.ts — database section defaults
import { DbType, } from "../../db/enums";
import { DATA_DIR, } from "../constants";
import type { DbConfig as DatabaseConfig, } from "../schema";

export const DB_DEFAULTS = {
  type: DbType.Sqlite,
  sqliteFilename: `${DATA_DIR}/loop-lore.db`,
} satisfies DatabaseConfig;
