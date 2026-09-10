// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the auth-narrowing wrappers that fold the universal
 * `requireUserId + typeof narrow [+ optional resolve*Owner + denied check]`
 * triple into reusable helpers.
 */
import { describe, expect, test, } from "bun:test";
import { withOwnerAuth, withUserAuth, } from "./auth-narrowing";

describe("withUserAuth", () => {
  test("calls fn with userId from ctx", async () => {
    const result = await withUserAuth({ userId: "u-1", }, async (uid,) => {
      return `hello ${uid}`;
    },);
    expect(result,).toBe("hello u-1",);
  });

  test("supports sync fn returning a plain value", async () => {
    const result = await withUserAuth({ userId: "u-2", }, (uid,) => uid.toUpperCase(),);
    expect(result,).toBe("U-2",);
  });

  test("returns 401 Response when ctx has no userId", async () => {
    const fn = async () => "should-not-run";
    const result = await withUserAuth({}, fn,);
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });

  test("returns 401 Response when userId is null", async () => {
    const fn = async () => "should-not-run";
    const result = await withUserAuth({ userId: null, }, fn,);
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });
});

describe("withOwnerAuth", () => {
  test("calls fn when owner resolves to null (allowed)", async () => {
    const result = await withOwnerAuth(
      { userId: "u-1", },
      async () => null, // allowed
      async (uid,) => `ok ${uid}`,
    );
    expect(result,).toBe("ok u-1",);
  });

  test("returns denial Response from resolveOwner when owner check fails", async () => {
    const denial = new Response("denied", { status: 403, },);
    const result = await withOwnerAuth(
      { userId: "u-1", },
      async () => denial,
      async () => "should-not-run",
    );
    expect(result,).toBe(denial,);
  });

  test("returns 401 before invoking resolveOwner when no userId", async () => {
    let resolveCalled = false;
    const result = await withOwnerAuth(
      {},
      async () => {
        resolveCalled = true;
        return null;
      },
      async () => "should-not-run",
    );
    expect(resolveCalled,).toBe(false,);
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });

  test("passes the resolved userId to resolveOwner", async () => {
    const seen: string[] = [];
    await withOwnerAuth(
      { userId: "u-42", },
      async (uid,) => {
        seen.push(uid,);
        return null;
      },
      async () => undefined,
    );
    expect(seen,).toEqual(["u-42",],);
  });
});
