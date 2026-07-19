/**
 * Tests for Elysia auth guard plugin structure.
 *
 * Lightweight tests — the auth guard is a thin wrapper around
 * the existing authenticate() function (tested via e2e).
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { authGuard } from "./elysia-auth";

describe("authGuard", () => {
  test("exports a function", () => {
    expect(typeof authGuard).toBe("function");
  });

  test("returns an Elysia plugin", () => {
    const db = {} as never;
    const config = {
      auth: { required: false, demoUsername: "demo", maxSessionsPerUser: 10, sessionTimeoutHours: 24 },
    } as never;
    const plugin = authGuard({ database: db, config });
    expect(plugin).toBeInstanceOf(Elysia);
  });

  test("can be used with .use()", () => {
    const db = {} as never;
    const config = {
      auth: { required: false, demoUsername: "demo", maxSessionsPerUser: 10, sessionTimeoutHours: 24 },
    } as never;
    const app = new Elysia();
    expect(() => app.use(authGuard({ database: db, config }))).not.toThrow();
  });
});
