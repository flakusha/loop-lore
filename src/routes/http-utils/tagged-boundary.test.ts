// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the tagged route-error boundary
 * (`src/routes/http-utils/tagged-boundary.ts`): mapped statuses per family
 * tag, and the sanitized-500 contract for unexpected errors — the response
 * body must never carry internal error text.
 */
import { describe, expect, test, } from "bun:test";
import { TaggedError, } from "../../errors/tagged";
import type { ErrorStatusMap, } from "./tagged-boundary";
import { taggedErrorBoundary, } from "./tagged-boundary";

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

const STUB_STATUS: ErrorStatusMap<StubError> = {
  "stub-not-found": 404,
  "stub-denied": 403,
};

function boundary(): (error: unknown,) => Response {
  return taggedErrorBoundary<StubError>({ module: "test.boundary", statusByTag: STUB_STATUS, },);
}

async function bodyOf(response: Response,): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("taggedErrorBoundary", () => {
  test("maps each family tag to its HTTP status", () => {
    const notFound = boundary()(new StubNotFoundError("abc",),);
    expect(notFound.status,).toBe(404,);

    const denied = boundary()(new StubDeniedError(),);
    expect(denied.status,).toBe(403,);
  });

  test("tagged error message rides in the response body", async () => {
    const body = await bodyOf(boundary()(new StubNotFoundError("abc",),),);
    expect(body.error,).toBe("Stub not found: abc",);
  });

  test("unexpected error becomes a sanitized 500 without internals", async () => {
    const response = boundary()(new Error("sqlite: no such table: actor_items",),);
    expect(response.status,).toBe(500,);
    const body = await bodyOf(response,);
    expect(JSON.stringify(body,),).not.toContain("sqlite",);
    expect(JSON.stringify(body,),).not.toContain("no such table",);
    expect(body.error,).toBe("Internal server error",);
  });

  test("foreign tagged errors fall through to the sanitized 500", async () => {
    class ForeignError extends TaggedError<"other-family"> {
      readonly tag = "other-family" as const;

      constructor() {
        super("foreign",);
      }
    }

    const response = boundary()(new ForeignError(),);
    expect(response.status,).toBe(500,);
  });
});
