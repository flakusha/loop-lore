// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Column Type Overrides
 *
 * Maps table.column -> TypeScript enum type.
 * Used by generate-db-types.ts to produce schema-*.ts interfaces.
 *
 * Only add entries for columns that use enum types from enums.ts.
 * Columns not listed here default to their SQLite type (text->string,
 * integer->number, real->number).
 *
 * The data lives in ./column-types-part1.ts and ./column-types-part2.ts to
 * stay under the per-file line limit. This module is the only import surface.
 */

import { PART_1, } from "./column-types-part1";
import { PART_2, } from "./column-types-part2";

export const COLUMN_TYPE_OVERRIDES: Record<string, Record<string, string>> = {
  ...PART_1,
  ...PART_2,
};
