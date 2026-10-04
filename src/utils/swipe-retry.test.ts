// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { describe, expect, test, } from "bun:test";

import {
  isSwipeIndexUniqueViolation,
  retryBounded,
} from "./swipe-retry";

describe("retryBounded", () => {
  test("returns value on first-attempt success", async () => {
    let calls = 0;
    const outcome = await retryBounded({
      attempts: 8,
      isRetryable: () => true,
      onAttempt: async () => {
        calls++;
        return "done";
      },
    },);

    expect(outcome,).toEqual({ ok: true, value: "done", },);
    expect(calls,).toBe(1,);
  });

  test("retries retryable errors until success", async () => {
    let calls = 0;
    const outcome = await retryBounded({
      attempts: 8,
      isRetryable: () => true,
      onAttempt: async () => {
        calls++;
        if (calls < 3) { throw new Error("transient",); }
        return calls;
      },
    },);

    expect(outcome,).toEqual({ ok: true, value: 3, },);
    expect(calls,).toBe(3,);
  });

  test("caps attempts and returns lastError on exhaustion", async () => {
    let calls = 0;
    const boom = new Error("always",);
    const outcome = await retryBounded({
      attempts: 8,
      isRetryable: () => true,
      onAttempt: async () => {
        calls++;
        throw boom;
      },
    },);

    expect(outcome,).toEqual({ ok: false, lastError: boom, },);
    expect(calls,).toBe(8,);
  });

  test("rethrows immediately when predicate rejects the error", async () => {
    let calls = 0;
    const fatal = new Error("fatal",);
    let caught: unknown;
    try {
      await retryBounded({
        attempts: 8,
        isRetryable: (err,) => err !== fatal,
        onAttempt: async () => {
          calls++;
          throw fatal;
        },
      },);
    } catch (err) {
      caught = err;
    }

    expect(caught,).toBe(fatal,);
    expect(calls,).toBe(1,);
  });

  test("predicate gates which errors retry", async () => {
    let calls = 0;
    let caught: unknown;
    await retryBounded({
      attempts: 8,
      isRetryable: (err,) => (err as Error).message === "retry me",
      onAttempt: async () => {
        calls++;
        throw new Error(calls < 3 ? "retry me" : "fatal",);
      },
    },).catch((err,) => {
      caught = err;
    },);

    // Third attempt's "fatal" error is rethrown, not captured.
    const message = caught instanceof Error ? caught.message : String(caught,);
    expect(message,).toBe("fatal",);
    expect(calls,).toBe(3,);
  });

  test("zero attempts short-circuits without calling onAttempt", async () => {
    let calls = 0;
    const outcome = await retryBounded({
      attempts: 0,
      isRetryable: () => true,
      onAttempt: async () => {
        calls++;
        return null;
      },
    },);

    expect(outcome,).toEqual({ ok: false, lastError: undefined, },);
    expect(calls,).toBe(0,);
  });
});

describe("isSwipeIndexUniqueViolation", () => {
  test("matches swipe unique-violation forms", () => {
    expect(isSwipeIndexUniqueViolation(new Error("UNIQUE constraint failed: messages.swipe_index",),),).toBe(true,);
    expect(
      isSwipeIndexUniqueViolation(new Error("SQLITE_CONSTRAINT_UNIQUE: idx_messages_swipe_unique",),),
    ).toBe(true,);
  });

  test("does not match unrelated errors", () => {
    expect(isSwipeIndexUniqueViolation(new Error("UNIQUE constraint failed: messages.idempotency_key",),),).toBe(
      false,
    );

    expect(isSwipeIndexUniqueViolation(new Error("FOREIGN KEY constraint failed",),),).toBe(false,);
    expect(isSwipeIndexUniqueViolation("not an error",),).toBe(false,);
  });
});
