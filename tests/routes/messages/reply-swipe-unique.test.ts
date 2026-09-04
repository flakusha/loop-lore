// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { isSwipeIndexUniqueViolation, } from "../../../src/routes/messages/reply";

describe("isSwipeIndexUniqueViolation", () => {
  test("returns true for Kysely text form on swipe_index", () => {
    const err = new Error("UNIQUE constraint failed: messages.swipe_index",);
    expect(isSwipeIndexUniqueViolation(err,)).toBe(true,);
  });

  test("returns true for Kysely text form on chat_id", () => {
    const err = new Error("UNIQUE constraint failed: messages.chat_id",);
    expect(isSwipeIndexUniqueViolation(err,)).toBe(true,);
  });

  test("returns true for Kysely text form on parent_id", () => {
    const err = new Error("UNIQUE constraint failed: messages.parent_id",);
    expect(isSwipeIndexUniqueViolation(err,)).toBe(true,);
  });

  test("returns true for SQLITE_CONSTRAINT_UNIQUE on idx_messages_swipe_unique", () => {
    const err = new Error("SQLITE_CONSTRAINT_UNIQUE: idx_messages_swipe_unique",);
    expect(isSwipeIndexUniqueViolation(err,)).toBe(true,);
  });

  test("returns false for unrelated UNIQUE violation on idempotency_key", () => {
    // Important: must NOT match — this is a real conflict, not a swipe race.
    const err = new Error("UNIQUE constraint failed: messages.idempotency_key",);
    expect(isSwipeIndexUniqueViolation(err,)).toBe(false,);
  });

  test("returns false for FK violation", () => {
    const err = new Error("FOREIGN KEY constraint failed: messages.chat_id",);
    expect(isSwipeIndexUniqueViolation(err,)).toBe(false,);
  });

  test("returns false for non-Error values", () => {
    expect(isSwipeIndexUniqueViolation("some string",)).toBe(false,);
    expect(isSwipeIndexUniqueViolation(null,)).toBe(false,);
    expect(isSwipeIndexUniqueViolation(undefined,)).toBe(false,);
    expect(isSwipeIndexUniqueViolation({ message: "UNIQUE constraint failed: messages.swipe_index" },)).toBe(false,);
  });

  test("returns false for generic Error without unique-violation text", () => {
    expect(isSwipeIndexUniqueViolation(new Error("DB connection lost",),)).toBe(false,);
    expect(isSwipeIndexUniqueViolation(new Error("encryption failed",),)).toBe(false,);
  });
});
