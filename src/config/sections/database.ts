// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/database.ts — Database config section

import { DbType, } from "../../db/enums";
import { DATA_DIR, } from "../constants";

export const DATABASE_DEFAULTS = {
  type: DbType.Sqlite,
  sqliteFilename: `${DATA_DIR}/loop-lore.db`,
};

/** */
export class DatabaseSection {
  type: DbType = DATABASE_DEFAULTS.type;
  sqliteFilename = DATABASE_DEFAULTS.sqliteFilename;
  url?: string;

  /**
   * @param overrides
   */
  constructor(overrides?: Partial<DatabaseSection>,) {
    Object.assign(this, overrides,);
  }
}

export type DbConfig = DatabaseSection;

export const databaseMeta = {
  type: "object" as const,
  description: "Database configuration",
  properties: {
    type: {
      type: "string",
      enum: ["sqlite", "postgres",],
      default: DATABASE_DEFAULTS.type,
      description: "Database type",
    },
    sqliteFilename: {
      type: "string",
      default: DATABASE_DEFAULTS.sqliteFilename,
      description: "SQLite database file path",
    },
    url: { type: "string", description: "PostgreSQL connection URL", },
  },
  required: ["type", "sqliteFilename",] as const,
};
