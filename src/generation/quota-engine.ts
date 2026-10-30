// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/quota-engine.ts — per-resource fixed-window quota counters.
//
// Durability first: the DB row (`resource_quota_counters`) is the source of
// truth. `rolled()` keeps an in-memory fast path, but every `consumeRequest`
// re-reads the row through `refreshFromDb` BEFORE the guard, so two engine
// instances (or a process restart) observe the same counters. The refresh is
// also the lazy window rollover: an expired window reads back as zeroed (and
// persists the reset, so the quota gauge never shows a stale spent window).
// In-process concurrency is serialized by a promise chain (ponytail:
// single-process lock; multi-process needs a guarded DB write).
// See epic-resource-provision.md (Quota Enforcement Points).

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { safeJsonParse, } from "../utils";
import { toDate, } from "../utils/date";

/** Rejection when a resource has exhausted its per-minute quota. */
export class QuotaExceededError extends Error {
  readonly resourceId: string;
  readonly kind: string;
  readonly limit: number;
  constructor(opts: { resourceId: string; kind: string; limit: number },) {
    super(`Quota exceeded for resource "${opts.resourceId}": ${opts.kind} limit ${opts.limit} reached`,);
    this.name = "QuotaExceededError";
    this.resourceId = opts.resourceId;
    this.kind = opts.kind;
    this.limit = opts.limit;
  }
}

/** Quota ceiling from the resource record's `quota` JSON envelope. */
export interface ResourceQuota {
  requestsPerMinute: number;
  tokensPerMinute?: number;
}

interface Counter {
  windowStart: number;
  requests: number;
  tokens: number;
}

/** Chain keepalive: later consume/record calls still serialize after a rejection. */
function keepChainAlive(): void {
  /* promise-chain keepalive, intentionally empty */
}

export interface QuotaEngineOpts {
  /** Fixed-window length in ms (default 60_000). */
  windowMs?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Optional persistence handle; without it the engine is memory-only. */
  db?: Kysely<DB> | null;
}

/**
 * Parse the `quota` JSON envelope stored on a resource record.
 * @param raw - the stored JSON envelope
 * @param resourceId - owning resource, for the error message only
 * @throws {Error} `invalid quota envelope` when the JSON is corrupt
 */
export function parseQuota(raw: string, resourceId = "?",): ResourceQuota {
  const result = safeJsonParse<Partial<ResourceQuota>>(raw,);
  if (!result.ok) {
    throw new Error(`Invalid quota envelope for resource "${resourceId}"`,);
  }

  const parsed = result.value;

  // Negative ceilings are data corruption, not a deny-all: clamp to the
  // same unlimited (0) the missing-field path produces.
  return {
    requestsPerMinute: Math.max(0, parsed.requestsPerMinute ?? 0,),
    tokensPerMinute: parsed.tokensPerMinute === undefined ? undefined : Math.max(0, parsed.tokensPerMinute,),
  };
}

export class QuotaEngine {
  private readonly counters = new Map<string, Counter>();
  private readonly windowMs: number;
  private readonly clock: () => number;
  private db: Kysely<DB> | null;
  /** Serializes consume/record pairs in-process; the DB row is the authority. */
  private chain: Promise<void> = Promise.resolve();

  constructor(opts?: QuotaEngineOpts,) {
    this.windowMs = opts?.windowMs ?? 60_000;
    this.clock = opts?.now ?? Date.now;
    this.db = opts?.db ?? null;
  }

  /** Swap the persistence handle (tests bind a fixture DB). */
  bindDb(db: Kysely<DB> | null,): void {
    this.db = db;
  }

  /** Load persisted counters into memory (cold-start hydration). */
  async hydrate(): Promise<void> {
    if (!this.db) { return; }
    const rows = await this.db
      .selectFrom("resource_quota_counters",)
      .select(["resource_id", "window_start", "requests", "tokens",],)
      .execute();

    for (const row of rows) {
      this.counters.set(row.resource_id, {
        windowStart: Number(row.window_start,),
        requests: row.requests,
        tokens: row.tokens,
      },);
    }
  }

  /** Current in-memory counter (rolls the window first). Test seam. */
  peek(resourceId: string,): Counter {
    return this.rolled(resourceId,);
  }

  /**
   * Roll a DB row into the fixed window: an expired window reads back as
   * zeroed. Returns null when the window expired (caller persists the reset).
   */
  private rollRow(row: { window_start: string; requests: number; tokens: number },): Counter | null {
    const now = this.clock();
    const windowStart = Number(row.window_start,);
    if (!Number.isFinite(windowStart,) || now - windowStart >= this.windowMs) { return null; }
    return { windowStart, requests: row.requests, tokens: row.tokens, };
  }

  /** Re-read the persisted row; rolls an expired window on the read path. */
  private async refreshFromDb(resourceId: string,): Promise<void> {
    if (!this.db) { return; }
    const row = await this.db
      .selectFrom("resource_quota_counters",)
      .select(["window_start", "requests", "tokens",],)
      .where("resource_id", "=", resourceId,)
      .executeTakeFirst();

    if (!row) {
      this.counters.delete(resourceId,);
      return;
    }

    const rolled = this.rollRow(row,);
    if (!rolled) {
      // Expired: the window reads back as zeroed. Persist the reset so a
      // second instance (or the quota gauge) never sees the stale window.
      const fresh: Counter = { windowStart: this.clock(), requests: 0, tokens: 0, };
      this.counters.set(resourceId, fresh,);
      await this.persist(resourceId, fresh,);
      return;
    }

    this.counters.set(resourceId, rolled,);
  }

  /** Current counter; consults the DB row first when a handle is bound. Test seam. */
  async readCounter(resourceId: string,): Promise<Counter> {
    await this.refreshFromDb(resourceId,);
    return this.rolled(resourceId,);
  }

  /**
   * Pre-call guard: DB row is re-read BEFORE the check (two instances see
   * the same usage), then reject when the request or token budget is spent,
   * else consume one request. Throws QuotaExceededError BEFORE any call.
   * @param resourceId - resource being charged
   * @param quota - ceiling from the resource record
   */
  async consumeRequest(resourceId: string, quota: ResourceQuota,): Promise<void> {
    const ticket = this.chain.then(() => this.consumeInner(resourceId, quota,));
    // Keep the chain alive across a rejection so later calls still serialize.
    this.chain = ticket.then(keepChainAlive, keepChainAlive,);
    return ticket;
  }

  private async consumeInner(resourceId: string, quota: ResourceQuota,): Promise<void> {
    await this.refreshFromDb(resourceId,);
    const state = this.rolled(resourceId,);
    if (quota.requestsPerMinute > 0 && state.requests >= quota.requestsPerMinute) {
      throw new QuotaExceededError({ resourceId, kind: "requests", limit: quota.requestsPerMinute, },);
    }

    if (quota.tokensPerMinute !== undefined && state.tokens >= quota.tokensPerMinute) {
      throw new QuotaExceededError({ resourceId, kind: "tokens", limit: quota.tokensPerMinute, },);
    }

    state.requests += 1;
    await this.persist(resourceId, state,);
  }

  /**
   * Post-call accounting: add the response's token usage. Never throws — the
   * call already happened, so this records truthfully even when over budget
   * (the next pre-call guard then rejects).
   * @param resourceId - resource to charge
   * @param tokens - total tokens from the provider usage block
   */
  async recordTokenUsage(resourceId: string, tokens: number,): Promise<void> {
    if (tokens <= 0) { return; }
    const ticket = this.chain.then(() => this.recordInner(resourceId, tokens,));
    this.chain = ticket.then(keepChainAlive, keepChainAlive,);
    return ticket;
  }

  private async recordInner(resourceId: string, tokens: number,): Promise<void> {
    await this.refreshFromDb(resourceId,);
    const state = this.rolled(resourceId,);
    state.tokens += tokens;
    await this.persist(resourceId, state,);
  }

  /** Drop the cached counter (quota-override path). DB delete happens at the call site. */
  invalidate(resourceId: string,): void {
    this.counters.delete(resourceId,);
  }

  /** Lazy fixed-window rollover: an expired window resets to zero. */
  private rolled(resourceId: string,): Counter {
    const now = this.clock();
    let state = this.counters.get(resourceId,);
    if (!state) {
      state = { windowStart: now, requests: 0, tokens: 0, };
      this.counters.set(resourceId, state,);
      return state;
    }

    if (now - state.windowStart >= this.windowMs) {
      state.windowStart = now;
      state.requests = 0;
      state.tokens = 0;
    }

    return state;
  }

  private async persist(resourceId: string, state: Counter,): Promise<void> {
    if (!this.db) { return; }
    await this.db
      .insertInto("resource_quota_counters",)
      .values({
        resource_id: resourceId,
        window_start: String(state.windowStart,),
        requests: state.requests,
        tokens: state.tokens,
        updated_at: toDate(this.clock(),).toISOString(),
      },)
      .onConflict((oc,) =>
        oc.column("resource_id",).doUpdateSet({
          window_start: String(state.windowStart,),
          requests: state.requests,
          tokens: state.tokens,
          updated_at: toDate(this.clock(),).toISOString(),
        },)
      )
      .execute();
  }
}

/**
 * Process-wide quota engine shared by the production dispatch path.
 * Bound once per process to the app DB at startup (bindSharedQuotaEngine);
 * tests inject their own engine instead.
 */
let sharedEngine: QuotaEngine | null = null;

/** The shared engine, creating (unbound) on first use. */
export function getQuotaEngine(): QuotaEngine {
  if (!sharedEngine) { sharedEngine = new QuotaEngine(); }
  return sharedEngine;
}

/** Bind the shared engine to the app DB. Call once at startup. */
export function bindSharedQuotaEngine(db: Kysely<DB> | null,): QuotaEngine {
  const engine = getQuotaEngine();
  engine.bindDb(db,);
  return engine;
}

/** Drop one resource from the shared engine (quota-override path). */
export function invalidateSharedQuota(resourceId: string,): void {
  sharedEngine?.invalidate(resourceId,);
}
