// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Quota engine: window reset, concurrency-safety, DB persistence.
import { describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, } from "../test-utils/create-test-db";
import { parseQuota, QuotaEngine, QuotaExceededError, } from "./quota-engine";

const QUOTA = { requestsPerMinute: 2, tokensPerMinute: 100, };

describe("parseQuota", () => {
  test("corrupt JSON throws a resource-attributed error", () => {
    let message: string | undefined;
    try {
      parseQuota("not-json{{{", "r-9",);
    } catch (error) {
      if (error instanceof Error) { message = error.message; }
    }

    expect(message,).toBe('Invalid quota envelope for resource "r-9"',);
  });

  test("negative ceilings clamp to unlimited", () => {
    expect(parseQuota('{"requestsPerMinute":-1}',),).toEqual({ requestsPerMinute: 0, tokensPerMinute: undefined, },);
  });
});

describe("quota-engine", () => {
  test("rejects the third request in a limit-2 window", async () => {
    const engine = new QuotaEngine();
    await engine.consumeRequest("r1", QUOTA,);
    await engine.consumeRequest("r1", QUOTA,);
    let thrown: unknown;
    try {
      await engine.consumeRequest("r1", QUOTA,);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(QuotaExceededError,);
  });

  test("window boundary resets counters", async () => {
    let now = 1_000_000;
    const engine = new QuotaEngine({ windowMs: 60_000, now: () => now, },);
    await engine.consumeRequest("r1", QUOTA,);
    await engine.consumeRequest("r1", QUOTA,);
    now += 60_001;
    await engine.consumeRequest("r1", QUOTA,);
    expect(engine.peek("r1",).requests,).toBe(1,);
  });

  test("concurrent increments never overshoot the limit", async () => {
    const engine = new QuotaEngine();
    const attempts = await Promise.allSettled(
      Array.from({ length: 10, }, () => engine.consumeRequest("r1", QUOTA,),),
    );

    const fulfilled = attempts.filter((a,) => a.status === "fulfilled").length;
    expect(fulfilled,).toBe(2,);
    expect(engine.peek("r1",).requests,).toBe(2,);
  });

  test("counters persist to resource_quota_counters and hydrate", async () => {
    const fixture = await createTestDb();
    try {
      const writer = new QuotaEngine({ db: fixture.db, },);
      await writer.consumeRequest("r1", QUOTA,);
      await writer.recordTokenUsage("r1", 30,);
      const rows = await fixture.db
        .selectFrom("resource_quota_counters",)
        .select(["resource_id", "requests", "tokens",],)
        .where("resource_id", "=", "r1",)
        .execute();

      expect(rows.length,).toBe(1,);
      expect(rows[0]!.requests,).toBe(1,);
      expect(rows[0]!.tokens,).toBe(30,);
      const reader = new QuotaEngine({ db: fixture.db, },);
      await reader.hydrate();
      expect(reader.peek("r1",).requests,).toBe(1,);
      expect(reader.peek("r1",).tokens,).toBe(30,);
    } finally {
      await destroyTestDb(fixture,);
    }
  });
});
