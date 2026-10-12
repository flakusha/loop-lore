// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the tagged error infrastructure (`src/errors/tagged.ts`):
 * the throwable base, the type guard, and the exhaustiveness sentinel.
 */
import { describe, expect, test, } from "bun:test";
import { assertNeverTag, isTaggedError, TaggedError, } from "./tagged";

class StubNotFoundError extends TaggedError<"stub-not-found"> {
  readonly tag = "stub-not-found" as const;

  constructor(id: string,) {
    super(`Stub not found: ${id}`,);
  }
}

class StubDeniedError extends TaggedError<"stub-denied"> {
  readonly tag = "stub-denied" as const;

  constructor() {
    super("Denied",);
  }
}

type StubError = StubNotFoundError | StubDeniedError;

describe("TaggedError", () => {
  test("carries the literal tag and the message", () => {
    const err = new StubNotFoundError("abc",);
    expect(err.tag,).toBe("stub-not-found",);
    expect(err.message,).toBe("Stub not found: abc",);
  });

  test("name comes from the concrete class, not the base", () => {
    const err = new StubNotFoundError("abc",);
    expect(err.name,).toBe("StubNotFoundError",);
    expect(err,).toBeInstanceOf(Error,);
    expect(err,).toBeInstanceOf(TaggedError,);
  });

  test("isTaggedError accepts tagged errors and rejects plain values", () => {
    expect(isTaggedError(new StubDeniedError(),),).toBe(true,);
    expect(isTaggedError(new Error("plain",),),).toBe(false,);
    expect(isTaggedError("string failure",),).toBe(false,);
    expect(isTaggedError(null,),).toBe(false,);
  });

  test("narrowed tag union is exhaustive-switchable", () => {
    const map: { [E in StubError["tag"]]: number } = {
      "stub-not-found": 404,
      "stub-denied": 403,
    };

    for (const err of [new StubNotFoundError("x",), new StubDeniedError(),] as StubError[]) {
      expect(map[err.tag],).toBeTypeOf("number",);
    }
  });

  test("assertNeverTag throws on the unreachable branch", () => {
    expect(() => assertNeverTag("should-be-never" as never,)).toThrow(/Unhandled tagged error/,);
  });
});
