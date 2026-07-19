// src/config/sections/database.ts — Database config section

import { DbType } from "../../db/enums";
import { DATA_DIR } from "../constants";
import type { DbConfig as DatabaseConfig } from "../schema";

export const DATABASE_DEFAULTS = {
  type: DbType.Sqlite,
  sqliteFilename: `${DATA_DIR}/loop-lore.db`,
} satisfies DatabaseConfig;

export class DatabaseSection implements DatabaseConfig {
  type = DATABASE_DEFAULTS.type;
  sqliteFilename = DATABASE_DEFAULTS.sqliteFilename;
  url?: string;

  constructor(overrides?: Partial<DatabaseConfig>) {
    Object.assign(this, overrides);
  }
}

export const databaseMeta = {
  type: "object" as const,
  description: "Database configuration",
  properties: {
    type: {
      type: "string",
      enum: ["sqlite", "postgres"],
      default: DATABASE_DEFAULTS.type,
      description: "Database type",
    },
    sqliteFilename: {
      type: "string",
      default: DATABASE_DEFAULTS.sqliteFilename,
      description: "SQLite database file path",
    },
    url: { type: "string", description: "PostgreSQL connection URL" },
  },
  required: ["type", "sqliteFilename"] as const,
};
