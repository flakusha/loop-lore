// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/db.ts — database JSON Schema section
import { DATA_DIR, } from "../../constants";

export const db = {
  type: "object",
  description: "Database configuration",
  properties: {
    type: {
      type: "string",
      enum: ["sqlite", "postgres",],
      default: "sqlite",
      description: "Database type",
    },
    sqliteFilename: {
      type: "string",
      default: `${DATA_DIR}/loop-lore.db`,
      description: "SQLite database file path",
    },
    url: { type: "string", description: "PostgreSQL connection URL", },
  },
  required: ["type", "sqliteFilename",],
};
