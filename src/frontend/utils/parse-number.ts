// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Browser entry point for the strict numeric parsers.
 *
 * Re-exports `src/utils/parse-number` — those helpers are pure and pull in no
 * Node built-ins, so the browser bundle inlines them directly. The mirror that
 * used to live here duplicated all four bodies; a fix to one silently skipped
 * the other.
 */
export {
  parseFloatOr,
  parseIntOr,
  safeParseFloat,
  safeParseInt,
} from "../../utils/parse-number";
export type { NumberResult, } from "../../utils/parse-number";
