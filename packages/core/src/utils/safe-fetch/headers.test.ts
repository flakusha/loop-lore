/**
 * Tests for utils/safe-fetch/headers.ts — buildAuthHeaders
 *
 * Covers CSRF token, bearer token precedence, and extra header merging.
 */
import { describe, expect, test, } from "bun:test";
import { buildAuthHeaders, } from "./headers";

describe("buildAuthHeaders — no auth", () => {
  test("returns empty object for undefined auth", () => {
    expect(buildAuthHeaders(undefined,),).toEqual({},);
  });

  test("returns empty object for empty auth", () => {
    expect(buildAuthHeaders({},),).toEqual({},);
  });
});

describe("buildAuthHeaders — token precedence", () => {
  test("injects CSRF token", () => {
    expect(buildAuthHeaders({ csrfToken: "csrf-abc", },),).toEqual({ "X-CSRF-Token": "csrf-abc", },);
  });

  test("sessionToken maps to Bearer Authorization", () => {
    expect(buildAuthHeaders({ sessionToken: "sess-1", },),).toEqual({
      Authorization: "Bearer sess-1",
    },);
  });

  test("apiKey maps to Bearer Authorization", () => {
    expect(buildAuthHeaders({ apiKey: "key-1", },),).toEqual({
      Authorization: "Bearer key-1",
    },);
  });

  test("sessionToken takes precedence over apiKey", () => {
    expect(buildAuthHeaders({ sessionToken: "sess-1", apiKey: "key-1", },),).toEqual({
      Authorization: "Bearer sess-1",
    },);
  });

  test("explicit authorization overrides sessionToken and apiKey", () => {
    expect(buildAuthHeaders({
      sessionToken: "sess-1",
      apiKey: "key-1",
      authorization: "Bearer custom",
    },),).toEqual({ Authorization: "Bearer custom", },);
  });
});

describe("buildAuthHeaders — extra headers", () => {
  test("merges extraHeaders with auth headers", () => {
    expect(buildAuthHeaders({
      csrfToken: "csrf-abc",
      sessionToken: "sess-1",
      extraHeaders: { "X-Custom": "yes", },
    },),).toEqual({
      "X-CSRF-Token": "csrf-abc",
      Authorization: "Bearer sess-1",
      "X-Custom": "yes",
    },);
  });

  test("extraHeaders override auth-derived headers (merged last)", () => {
    expect(buildAuthHeaders({
      sessionToken: "sess-1",
      extraHeaders: { Authorization: "Bearer extra", },
    },),).toEqual({ Authorization: "Bearer extra", },);
  });
});
