// src/config/schema/db.ts — Database config type
//
// Exported publicly as `DbConfig` to preserve the original public surface.

import type { DbType as DbTypeT, } from "../../db/enums";

interface DatabaseConfig {
  type: DbTypeT;
  sqliteFilename: string;
  url?: string;
}

export type { DatabaseConfig as DbConfig, };
