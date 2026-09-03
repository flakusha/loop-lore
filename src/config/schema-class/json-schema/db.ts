// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema-class/json-schema/db.ts — database JSON Schema section
// Default paths are emitted as `${DATA_DIR}/...` placeholders, not the
// resolved absolute path, so the published JSON Schema is portable across
// dev checkouts / worktrees / CI machines. Consumers resolve `DATA_DIR` at
// runtime via `path.resolve(<repo>/loop-lore-data)` (see src/config/constants.ts).

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
      default: "${DATA_DIR}/loop-lore.db",
      description:
        "SQLite database file path. DATA_DIR resolves to <repo>/loop-lore-data at runtime. Overridden by LOOP_LORE_DB_PATH env var.",
    },
    url: { type: "string", description: "PostgreSQL connection URL", },
  },
  required: ["type", "sqliteFilename",],
};
