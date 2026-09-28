<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: DB read-path benchmark baseline (the gate the cold-cache epic requires)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-db-cold-storage-high-perf
**Tags:** benchmark, performance, database, prerequisite

**Summary:** The cold-cache epic is explicitly gated on a step-1 baseline that has never been taken, and it has no tickets at all. Without the measurement, the epic can never be started or stopped honestly.
**Context:** Found while reviewing the DB-split epics. `epic-db-cold-storage-high-perf.md` is honest about being speculative - "_TBD - create implementation tickets only after the step-1 benchmark justifies the epic_" - but the benchmark it gates on does not exist and no ticket tracks creating it. The result is an epic that can never advance and cannot be closed.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Evidence

- `epic-db-cold-storage-high-perf.md:96-102` (step 1) and `:152-157` (step 8) both require p50/p99 latency, req/s, and memory for the API-heavy GET paths; step 1 carries a hard gate: "_only proceed if a real read bottleneck is measured. Otherwise stop._"
- `scripts/run-benchmarks.ts` discovers `tests/benchmarks/*.bench.ts`; that directory holds exactly two benches (`blake3.bench.ts`, `zstd.bench.ts`) - both CPU/native, neither touches the DB or the HTTP layer. There is no read-path benchmark.
- `FEAT-e2e-performance-benchmarks.md` names the targets ("API p50 < 20ms", "Full non-LLM round-trip < 1ms") but is a load/soak-testing feature ticket, not this measurement.
- The candidate hot paths named by the epic are real: `src/routes/messages/read.ts:164,213` (`selectAll()` with cursor pagination), plus world/location reads and the gallery index.

## Fix Shape

Add benches under `tests/benchmarks/` following the existing `.bench.ts` convention:

- seeded in-memory/temp-file SQLite fixture with representative row counts for `messages`, `message_search_tokens`, `actor_memories`, `memory_embeddings`
- p50/p99 + row-throughput for the message-list read and the world/location read queries
- a report committed to the ticket so the baseline is comparable later

Deliberately out of scope here: the cache itself. This ticket only produces the numbers the epic's gate consumes.

## Acceptance Criteria

- [ ] Read-path bench exists, runs via `bun run bench`, and prints p50/p99 per named hot read.
- [ ] Baseline numbers recorded in this ticket.
- [ ] `epic-db-cold-storage-high-perf.md` step-1 gate either satisfied (tickets can be created) or explicitly failed (epic closable as "not worth it").
- [ ] `bun run check` green.

## Related

- `epic-db-cold-storage-high-perf.md`
- `FEAT-e2e-performance-benchmarks.md`


git issue: ca8b2ba
