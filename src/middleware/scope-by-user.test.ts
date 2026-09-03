// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { requireActorFromSession, } from "./scope-by-user";

describe("requireActorFromSession", () => {
  it("returns { userId } when ctx has a non-null userId", () => {
    const result = requireActorFromSession({ userId: "u-123", },);
    expect(result,).not.toBeInstanceOf(Response,);
    expect(result,).toEqual({ userId: "u-123", },);
  });

  it("returns a 401 Response when ctx.userId is null", () => {
    const result = requireActorFromSession({ userId: null, },);
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });

  it("returns a 401 Response when ctx.userId is undefined", () => {
    const result = requireActorFromSession({},);
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });

  it("returns a 401 Response when ctx.userId is empty string", () => {
    const result = requireActorFromSession({ userId: "", },);
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });

  it("never throws when ctx.userId is null/undefined/empty/missing", () => {
    // These are the realistic shapes an unauthenticated request can
    // take through the auth pipeline. The helper must return a 401
    // Response in all of them, never raise.
    expect(() => requireActorFromSession({ userId: null, },)).not.toThrow();
    expect(() => requireActorFromSession({ userId: undefined, },)).not.toThrow();
    expect(() => requireActorFromSession({ userId: "", },)).not.toThrow();
    expect(() => requireActorFromSession({},)).not.toThrow();
  });

  it("returns 401 when ctx.t is provided alongside null userId (localization still triggers)", () => {
    const result = requireActorFromSession(
      { userId: null, t: (k: string,) => `localized:${k}`, },
    );
    expect(result,).toBeInstanceOf(Response,);
    expect((result as Response).status,).toBe(401,);
  });
});
