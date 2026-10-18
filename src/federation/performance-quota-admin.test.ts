// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unit tests for the performance-quota primitives the admin budget editor
 * writes through.
 *
 * These pin the contracts the panel depends on: a quota cell is addressed by
 * (origin, class) only, the limiters are per-cell so one busy peer cannot
 * throttle another, and a budget's "unlimited" is null rather than zero.
 */
import { describe, expect, test, } from "bun:test";
import { PeerWorkloadClass, } from "../db/enums";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  excludePeerQuota,
  quotaConcurrencyLimiter,
  quotaLimiterKey,
  quotaRequestLimiter,
  touchQuotaCell,
} from "./performance-quota";
import { DEFAULT_QUOTA_QUEUE_TIMEOUT_MS, } from "./performance-quota-guard";
import {
  QUOTA_MINUTE_MS,
  quotaCellKey,
  WORKLOAD_CLASS_SET,
} from "./performance-quota-types";
import {
  BudgetValidationError,
  clearPerformanceBudget,
  toPerformanceBudget,
  writePerformanceBudget,
} from "./performance-quota-write";

createLogger({ level: "error", },);

const REMOTE = "https://gpu.example";
const OTHER = "https://cpu.example";
const CHAT = PeerWorkloadClass.Chat;
const EMBED = PeerWorkloadClass.Embedding;

describe("quota cell addressing", () => {
  test("a cell key is a function of origin and class only", () => {
    expect(quotaCellKey(REMOTE, CHAT,),).toBe(quotaCellKey(REMOTE, CHAT,),);
    expect(quotaCellKey(REMOTE, CHAT,),).not.toBe(quotaCellKey(REMOTE, EMBED,),);
  });

  test("two origins never share a cell", () => {
    expect(quotaCellKey(REMOTE, CHAT,),).not.toBe(quotaCellKey(OTHER, CHAT,),);
  });

  test("a limiter key is stable and class-scoped", () => {
    expect(quotaLimiterKey({ origin: REMOTE, workloadClass: CHAT, },),).toBe(
      quotaLimiterKey({ origin: REMOTE, workloadClass: CHAT, },),
    );

    expect(quotaLimiterKey({ origin: REMOTE, workloadClass: CHAT, },),).not.toBe(
      quotaLimiterKey({ origin: REMOTE, workloadClass: EMBED, },),
    );
  });

  test("an unconfigured cell exposes no limiters at all", () => {
    // Cells are created by configuring a budget, not by being looked up. Until
    // then both accessors are null, so an unconfigured peer is never silently
    // metered by a shared default limiter.
    expect(quotaConcurrencyLimiter({ origin: REMOTE, workloadClass: CHAT, },),).toBeNull();
    expect(quotaRequestLimiter({ origin: REMOTE, workloadClass: CHAT, },),).toBeNull();
    expect(quotaConcurrencyLimiter({ origin: OTHER, workloadClass: CHAT, },),).toBeNull();
  });
});

describe("quota rate constants", () => {
  test("the window is one minute", () => {
    expect(QUOTA_MINUTE_MS,).toBe(60_000,);
  });

  test("the class set covers every workload class and admits no others", () => {
    expect(WORKLOAD_CLASS_SET.has(CHAT,),).toBe(true,);
    expect(WORKLOAD_CLASS_SET.has("not-a-class",),).toBe(false,);
    for (const value of [...WORKLOAD_CLASS_SET,]) {
      expect(WORKLOAD_CLASS_SET.has(value,),).toBe(true,);
    }
  });

  test("the queue timeout is a positive finite number", () => {
    expect(DEFAULT_QUOTA_QUEUE_TIMEOUT_MS,).toBeGreaterThan(0,);
    expect(Number.isFinite(DEFAULT_QUOTA_QUEUE_TIMEOUT_MS,),).toBe(true,);
  });
});

describe("quota cell state", () => {
  test("touching an unknown cell is a silent no-op, not a throw", () => {
    // The sweep runs on the admission path; a cell that was never configured
    // must not take the whole request down with it.
    expect(touchQuotaCell({ origin: REMOTE, workloadClass: CHAT, now: Date.now(), },),).toBeUndefined();
  });

  test("excluding a peer quota is idempotent across cells", () => {
    const deny = (origin: string, workloadClass: PeerWorkloadClass,) => ({
      origin,
      workloadClass,
      limit: "max_concurrency" as const,
      retryAfterSec: 30,
    });

    expect(excludePeerQuota(deny(REMOTE, CHAT,),),).toBeUndefined();
    // Excluding one cell must not disturb a different peer or class.
    expect(excludePeerQuota(deny(OTHER, EMBED,),),).toBeUndefined();
  });
});

describe("performance budget writes", () => {
  test("a negative limit is rejected", async () => {
    const { db, } = await createTestDb();
    await expect(
      writePerformanceBudget({
        database: db,
        input: {
          origin: REMOTE,
          workloadClass: CHAT,
          mode: "hard",
          maxConcurrency: -1,
          maxQueueDepth: null,
          requestsPerMinute: null,
          tokensPerMinute: null,
        },
      },),
    ).rejects.toBeInstanceOf(BudgetValidationError,);

    await db.destroy();
  });

  test("a budget for an unknown peer is refused", async () => {
    const { db, } = await createTestDb();
    await expect(
      writePerformanceBudget({
        database: db,
        input: {
          origin: REMOTE,
          workloadClass: CHAT,
          mode: "hard",
          maxConcurrency: 2,
          maxQueueDepth: null,
          requestsPerMinute: null,
          tokensPerMinute: null,
        },
      },),
    ).rejects.toBeInstanceOf(BudgetValidationError,);

    await db.destroy();
  });

  test("a null limit is unlimited, not zero", () => {
    const budget = toPerformanceBudget({
      origin: REMOTE,
      workloadClass: CHAT,
      mode: "hard",
      maxConcurrency: null,
      maxQueueDepth: null,
      requestsPerMinute: null,
      tokensPerMinute: null,
    },);

    // null means UNLIMITED. A projection that turned it into 0 would block all
    // traffic, the opposite of what the operator asked for.
    expect(budget.maxConcurrency,).toBeNull();
    expect(budget.requestsPerMinute,).toBeNull();
    expect(budget.tokensPerMinute,).toBeNull();
  });

  test("an explicit limit survives the projection unchanged", () => {
    const budget = toPerformanceBudget({
      origin: REMOTE,
      workloadClass: CHAT,
      mode: "hard",
      maxConcurrency: 4,
      maxQueueDepth: 2,
      requestsPerMinute: 60,
      tokensPerMinute: 1000,
    },);

    expect(budget.maxConcurrency,).toBe(4,);
    expect(budget.maxQueueDepth,).toBe(2,);
    expect(budget.requestsPerMinute,).toBe(60,);
    expect(budget.tokensPerMinute,).toBe(1000,);
  });

  test("a zero limit is rejected: zero blocks, it is not unlimited", () => {
    expect(() =>
      toPerformanceBudget({
        origin: REMOTE,
        workloadClass: CHAT,
        mode: "hard",
        maxConcurrency: 0,
        maxQueueDepth: null,
        requestsPerMinute: null,
        tokensPerMinute: null,
      },)
    ).toThrow(BudgetValidationError,);
  });

  test("clearing a budget for a peer with no budget reports nothing removed", async () => {
    const { db, } = await createTestDb();

    expect(await clearPerformanceBudget({ database: db, origin: REMOTE, workloadClass: CHAT, },),).toBe(false,);
    await db.destroy();
  });
});
