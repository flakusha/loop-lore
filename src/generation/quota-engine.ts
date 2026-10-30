// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/quota-engine.ts — per-resource fixed-window quota counters.
//
// In-memory map is the routing-decision source of truth; `resource_quota_counters`
// persists it for durability across sessions. The check-and-increment in
// `consumeRequest` runs synchronously with no await between check and mutation,
// so concurrent callers cannot interleave and overshoot (single-threaded
// atomicity) — the DB persist happens after the decision, never before it.
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
   * Pre-call guard: reject when the request or token budget is spent, else
   * consume one request. Throws QuotaExceededError BEFORE any external call.
   * @param resourceId - resource being charged
   * @param quota - ceiling from the resource record
   */
  async consumeRequest(resourceId: string, quota: ResourceQuota,): Promise<void> {
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
    const state = this.rolled(resourceId,);
    state.tokens += tokens;
    await this.persist(resourceId, state,);
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
