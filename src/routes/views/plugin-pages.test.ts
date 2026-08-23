// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `pagesRoutes` (/views/nsfw-moderation) — ensures the inline
 * `requirePermission("admin.system")` beforeHandle plus the outer
 * adminViewGuard block deny non-admins. Regression for
 * WIRE-nsfw-audit-page-missing-inline-authz.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Elysia, } from "elysia";
import { createLogger, setGlobalLogger, } from "../../logger";
import { pagesRoutes, } from "./plugin-pages";

function fakeDb(): unknown {
  // Denial paths short-circuit before any DB access.
  return new Proxy({}, {
    get() {
      throw new Error("Unexpected DB access in plugin-pages test",);
    },
  },);
}

describe("pagesRoutes /views/nsfw-moderation authz", () => {
  let app: Elysia;
  let originalLogger: ReturnType<typeof createLogger> | null = null;

  beforeEach(() => {
    setGlobalLogger(createLogger({ level: "fatal", },),);
    app = pagesRoutes(fakeDb() as unknown as Parameters<typeof pagesRoutes>[0],) as unknown as Elysia;
  },);

  afterEach(() => {
    if (originalLogger) { setGlobalLogger(originalLogger,); }
  },);

  it("denies non-admin user (302 redirect or 403)", async () => {
    const res = await app.handle(
      new Request("http://test/views/nsfw-moderation", {
        headers: { "x-user-role": "user", "x-user-id": "u1", },
      },),
    );
    expect([302, 403,],).toContain(res.status,);
  });

  it("denies null role (302 redirect or 403)", async () => {
    const res = await app.handle(
      new Request("http://test/views/nsfw-moderation", {
        headers: { "x-user-id": "u1", },
      },),
    );
    expect([302, 403,],).toContain(res.status,);
  });
});
