// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the error classes in `routes/http-utils/status.ts`.
 *
 * `StaleChatKeyError` is what the message store raises for a client-supplied
 * `key_id` that is not a live key of the chat, so the class identity and the
 * message it carries are contract, not decoration — the error middleware maps
 * the class to the `STALE_CHAT_KEY` code the client recovers from.
 */
import { describe, expect, test, } from "bun:test";
import { BadRequestError, StaleChatKeyError, } from "./status";

describe("BadRequestError", () => {
  test("is an Error that carries the message and its own name", () => {
    const err = new BadRequestError("bad request",);

    expect(err,).toBeInstanceOf(Error,);
    expect(err.name,).toBe("BadRequestError",);
    expect(err.message,).toBe("bad request",);
  });

  test("falls back to a generic message", () => {
    expect(new BadRequestError().message,).toBe("Bad request",);
  });

  test("keeps the cause it was given", () => {
    const cause = new Error("root cause",);
    expect(new BadRequestError("bad request", { cause, },).cause,).toBe(cause,);
  });
});

describe("StaleChatKeyError", () => {
  test("is an Error that carries the message and its own name", () => {
    const err = new StaleChatKeyError("Encrypted content names a key that is not a live key of this chat",);

    expect(err,).toBeInstanceOf(Error,);
    expect(err.name,).toBe("StaleChatKeyError",);
    expect(err.message,).toBe("Encrypted content names a key that is not a live key of this chat",);
  });

  test("falls back to a generic message", () => {
    expect(new StaleChatKeyError().message,).toBe("Stale chat key",);
  });

  test("keeps the cause it was given", () => {
    const cause = new Error("root cause",);
    expect(new StaleChatKeyError("stale chat key", { cause, },).cause,).toBe(cause,);
  });
});
