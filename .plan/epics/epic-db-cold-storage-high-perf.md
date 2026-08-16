<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: DB as Cold Storage for Extreme-Performance API-Heavy Workloads

**Status:** 📝 Draft
**Priority:** Low (speculative — "far-fetched" scenario, only justified by measured need)
**Effort:** Large
**Type:** Research / Architecture Epic
**Tags:** performance, caching, hot-path, cold-storage, elysia, api, architecture, benchmark
**Proposed Epic Branch:** `epic/db-cold-storage-high-perf`
**Depends on:** Architecture (`epic-architecture.md`), API Routes (`epic-api-routes.md`), Testing & Benchmarking (`epic-testing-benchmarking.md`), Transport Expansion (`epic-transport-expansion.md`), DB Content Versioning (`epic-db-content-versioning.md`)
**Spec:** `docs/spec/architecture.md` (may drift — `src/` is authoritative)

---

## Summary

For the extreme-performance case (high concurrency, read-dominated, API-heavy traffic in
the **framework-based mode** — i.e. requests served through the Elysia app in
`src/elysia-app.ts`), treat the database as **"cold" storage**: the durable, correct source
of truth that is _not_ on the per-request hot path. A bounded **in-memory hot read layer**
sits in front of the DB; reads serve from memory, writes go through to the cold DB with
deterministic invalidation.

This is the classic **hot-cache / cold-store** split. The DB (`bun:sqlite` via Kysely,
`src/db/index.ts`) stays the system of record; the hot layer is an optimization that can be
turned off without changing semantics.

> **Why "far-fetched":** the default loop-lore deployment is single-user or a small
> self-hosted server. `bun:sqlite` in WAL mode is already fast for that scale, and every
> cache layer buys latency at the cost of invalidation-correctness risk. This epic is only
> worth executing if a **measured** read bottleneck on specific API-heavy endpoints exists —
> never preemptively. Everything here is a review of the steps, not a commitment to build.

---

## Problem

Today every API read hits the single global Kysely instance directly:

- `getDatabase()` in `src/db/index.ts` returns one shared `Kysely<DB>` over `bun:sqlite`
  (WAL, FK on). There is **no read cache** between routes and the DB.
- Read-heavy endpoints — `GET` message lists (`src/routes/messages/read.ts`, `selectAll` +
  cursor pagination), world/location reads (`src/routes/worlds/*.ts`, `locations.ts`), quest
  log (`src/views/quests.html`), gallery index — each translate to a fresh SQL query.
- Existing in-memory state is narrow and not a read cache: rate-limit sliding-window buckets
  (`src/middleware/rate-limit.ts`), provider-health cache (`src/admin/provider-health.ts`),
  TypeBox checker `WeakMap` (`src/frontend/alpine/chat-utils/validation.ts`), emotion
  job-store, VN image preloader.
- Framework mode adds per-request overhead on top of the query (routing, validation, auth,
  NSFW gate, i18n, response headers, compression).

At very high read concurrency the DB query becomes the bottleneck; the fix is to serve the
_working set_ from memory and reserve the DB for writes + cold reads. The DB is deliberately
"demoted" to cold storage.

---

## Design

### Hot / Cold Split

```
request → Elysia framework (auth → NSFW → rate-limit → i18n)
            │
            ▼
      [Hot Cache Layer]  ─── hit ──► respond from memory (µs)
            │ miss (single-flight)
            ▼
      [Cold DB]  Kysely / bun:sqlite (WAL) ── durable source of truth
```

- **Hot layer:** bounded in-memory LRU + TTL, keyed by a canonical cache key
  (`entity:type:id[:version]`). Read-through with **single-flight** (concurrent misses share
  one DB load — no thundering herd). Memory-bounded (max bytes / max entries) with eviction.
- **Cold layer:** the existing `getDatabase()` Kysely instance, untouched. Correctness and
  durability live here.
- **Write path:** mutations (`POST`/`PATCH`/`DELETE`) go straight to the cold DB, then
  **invalidate** the affected keys deterministically. TTL is the safety net for missed
  invalidation.

### Framework-Based Mode Integration

Implemented as an Elysia plugin (`src/app/register-plugins.ts`) or route-level middleware so
it composes with the existing `auth → NSFW → rate-limit → i18n` chain. Caching happens at the
**read-service / route boundary** — never inside the Kysely layer — so the DB layer stays the
pure cold store.

---

## Steps to Achieve (Review)

### 1. Measure and identify hot read paths

- Add per-endpoint latency/throughput telemetry (reuse `src/telemetry/`); benchmark the
  current API-heavy GETs (messages list, world/location reads, quest log, gallery index).
- Establish a **baseline** (p50/p99 latency, req/s, memory) before any caching.
- **Gate:** only proceed if a real read bottleneck is measured. Otherwise stop — this epic is
  explicitly conditional.

### 2. Define the cacheability contract

- Canonical key: `entity:type:id` plus a version component (see step 5) for revalidation.
- **Per-user scoping:** auth'd reads (chat, messages, worlds, NSFW-gated content) must be
  keyed by owner/permission or cached only when the read is permission-invariant. Never cache
  across a permission boundary; a shared cache must not leak one user's rows to another.
- Only cache idempotent, read-only results that are safe to serve for ≥1 TTL.

### 3. Build the hot cache primitive

- Bounded LRU + TTL with a max-size/max-entry budget and eviction (a small, dependency-free
  module under `src/`; no new runtime deps — keeps "minimal local setup").
- **Single-flight** miss handling: one in-flight promise per key; duplicate concurrent
  misses await the same load.
- **Stampede protection:** TTL + a short negative-cache window for known-empty reads.
- Expose `get/set/del/invalidateKeyPattern/destroy` and a memory bound.

### 4. Integrate at the read boundary (framework mode)

- Wrap the hot read paths in an Elysia plugin/middleware so the existing chain
  (auth → NSFW → rate-limit → i18n) runs first; cache after those checks.
- DB access continues through `getDatabase()` (cold). Kysely schema/queries unchanged.
- Feature-flag the cache on/off (config) so it can be disabled without code change.

### 5. Write-through and deterministic invalidation

- On every mutation touching a cached entity, invalidate the affected keys by pattern
  (e.g. `messages:<chatId>:*`).
- **Respect optimistic locking** (`src/db/optimistic-locking.ts`): store the row `version`
  with the cached value; on read, if a fresh DB row shows a newer version, treat the cache as
  stale. This prevents serving stale writes.
- TTL as the backstop for any missed invalidation path.

### 6. Correctness hardening

- Invalidation ordering: invalidate **after** a successful DB commit, never before.
- No stale-after-delete: deleting an entity must invalidate every key pattern that could
  reference it.
- Consistency window: define and document the acceptable staleness (≈ TTL); the cold DB
  remains the source of truth for any consistency-sensitive read.

### 7. Observability

- Expose hit/miss ratio, invalidation count, eviction count, and current memory/entry count
  (reuse `src/telemetry/` + admin health cache pattern).
- Log/alert on pathological eviction (thrash) or a dropping hit rate — both indicate the
  cache is not helping.

### 8. Benchmark and justify

- Re-run the step-1 benchmark after the cache is in place; compare p50/p99, req/s, memory.
- **Acceptance:** measurable improvement on the hot endpoints with bounded memory and no
  regression on correctness tests. If the improvement is marginal, **revert** — do not keep
  the cache for its own sake.
- Run the full AGENTS.md gates (`bun run check`, unit tests) — the cache must not break the
  existing test suite (which exercises the DB directly via `createTestDb`).

### 9. Optional horizontal scale (deferred, not in scope)

- If multiple instances share traffic, a single-process in-memory cache is not shared; a
  network hot store (Redis) would be required. That contradicts the "minimal local setup"
  philosophy and adds a dependency — explicitly **out of scope** unless multi-node is a real
  requirement. For a single node, in-process memory is the boring/safe default.

---

## Rationale / When NOT to do this

- Typical deployment is single-user or small self-host; `bun:sqlite` WAL is already fast for
  that scale. Adding a cache layer is **negative value** unless a measured bottleneck exists.
- Caches introduce invalidation-correctness risk (stale reads, cross-user leakage if scoping
  is wrong). This epic is a **review of steps**, framed as far-fetched, and must be gated on
  the step-1 benchmark.
- The correct posture: **wait for evidence, then apply the hot/cold split only to the proven
  hot endpoints.**

---

## Related Epics

- `epic-architecture.md` — overall architecture, transport, middleware
- `epic-api-routes.md` — API surface being cached
- `epic-testing-benchmarking.md` — benchmark harness for step 1/8
- `epic-transport-expansion.md` — HTTP/1.1 + HTTP/2 + WS serving the framework
- `epic-db-content-versioning.md` — optimistic locking / version-aware invalidation

## Tickets

_TBD — create implementation tickets only after the step-1 benchmark justifies the epic._
