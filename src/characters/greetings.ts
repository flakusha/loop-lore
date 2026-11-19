// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Alternate-greeting helpers shared by chat creation (server-side seeding)
 * and the new-chat picker (client-side option building).
 *
 * `actors.alternate_greetings` is a JSON-encoded text column, while import
 * and export paths also pass already-parsed arrays around — both shapes are
 * accepted here.
 */
import { jsonParseOr, } from "../utils";

/**
 * Normalize a stored `alternate_greetings` value into non-empty strings.
 * @param raw - JSON string, already-parsed array, or null/undefined
 * @returns greetings in stored order; blank/non-string entries are dropped
 */
export function parseAlternateGreetings(raw: unknown,): string[] {
  let value = raw;
  if (typeof value === "string") {
    if (value.trim() === "") { return []; }
    value = jsonParseOr<unknown>(value, [],);
  }

  if (!Array.isArray(value,)) { return []; }

  return value.filter((entry,): entry is string => typeof entry === "string" && entry.trim() !== "");
}

/**
 * Resolve the greeting to seed for one character. An explicit, in-range
 * index picks an alternate; anything else (absent, negative, out of range)
 * falls back to the character's primary `welcome_message`.
 * @param raw - the `alternate_greetings` column value
 * @param primary - the character's `welcome_message`
 * @param index - zero-based alternate greeting index, when explicitly selected
 * @returns the greeting text to insert
 */
export function resolveGreeting(raw: unknown, primary: string, index?: number | null,): string {
  if (typeof index === "number" && Number.isInteger(index,) && index >= 0) {
    const alternate = parseAlternateGreetings(raw,)[index];
    if (alternate !== undefined) { return alternate; }
  }

  return primary;
}
