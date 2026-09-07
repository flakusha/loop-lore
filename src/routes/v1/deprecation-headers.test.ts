// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Barrel-level deprecation header regression test.
 *
 * Proves `deprecationAfterHandle` is registered BEFORE the route plugins in
 * `v1Routes`: Elysia only wraps routes declared after the hook, so a
 * hook-last ordering silently emits no headers. If this test fails, the hook
 * was moved after the routes.
 */
import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { AsyncStore, } from "../../async/store";
import { createLogger, } from "../../logger";
import type { DB, } from "../../db/schema";
import { v1Routes, } from "./index";

/** */
function stubAsyncStore(): AsyncStore {
  return {
    track() {}, progress() {}, complete() {}, fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {}, async read() { return null; }, destroy() {},
  };
}

/**
 * @param db
 */
function createV1App(db: Kysely<DB>,): Elysia {
  const t = (k: string,) => k;
  return new Elysia({ name: "test-v1-deprecation", },)
    .derive(() => ({ userId: null, userRole: null, sessionId: null, locale: "en", t, }),)
    .use(v1Routes({ database: db, config: {} as never, asyncStore: stubAsyncStore(), },),) as unknown as Elysia;
}

describe("v1 deprecation headers", () => {
  test("flag on sets Sunset/Deprecation on barrel responses", async () => {
    createLogger({ level: "error", },);
    process.env.API_V1_DEPRECATED = "1";
    const { db, } = await createTestDb() as unknown as { db: Kysely<DB> };
    try {
      const res = await createV1App(db,).handle(new Request("http://localhost/api/v1/health",),);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Sunset"),).toBe("Sat, 01 Jan 2028 00:00:00 GMT",);
      expect(res.headers.get("Deprecation"),).toBe("true",);
    } finally {
      delete process.env.API_V1_DEPRECATED;
      await db.destroy();
    }
  },);

  test("flag off leaves responses unannotated", async () => {
    createLogger({ level: "error", },);
    delete process.env.API_V1_DEPRECATED;
    const { db, } = await createTestDb() as unknown as { db: Kysely<DB> };
    try {
      const res = await createV1App(db,).handle(new Request("http://localhost/api/v1/health",),);
      expect(res.status,).toBe(200,);
      expect(res.headers.get("Sunset"),).toBeNull();
      expect(res.headers.get("Deprecation"),).toBeNull();
    } finally {
      await db.destroy();
    }
  },);
},);
