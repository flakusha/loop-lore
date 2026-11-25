<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness DB tables (runs + calls + embedding scope)

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Summary:** JSONL → git+db cross-search in two iterations: Transport impl first, then `harness_runs`/`harness_calls` migration + `harness` MemoryScope wired into recall/injection.

**Status Note:** 2026-11-25 re-scope to iteration 2 only. Iteration 1 SHIPPED: the JSONL exec-log transport exists (`src/harness/exec-log.ts`, `executions.jsonl` append) and the `harness` MemoryScope is live (`src/memory/types.ts:27-37`, wired by `src/memory/harness-recall.ts:83` with the provisioning guard `src/memory/provision.ts:195-197`). Iteration 2 remains: NO `harness_runs`/`harness_calls` migration exists (no grep hit under `src/db`), so the forward migration plus its read path are the whole residual scope of this ticket.
**Context:** DB is Bun SQLite + Kysely, WAL+FK, 169 tables (`schema.ts` barrel, `schema-manifest.ts` SToT). Reuse: `logger/transports/file.ts` (JSONL append + rotation) + `Transport{write,flush}` + queue; `request_results`/`telemetry_events` column shapes; `memory/embeddings.ts` (`storeEmbedding`, `semanticRecall`) + `injection/decide.ts|select.ts` + `audit.ts`; `history-search.ts` chain reconstruction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Iteration 1: SUPERSEDED in shape — the JSONL exec-log transport shipped (`src/harness/exec-log.ts`, `executions.jsonl` append) rather than a separate `Transport` impl writing `harness_runs.jsonl`; no new transport work remains.
- [ ] Iteration 2 (the only remaining scope): forward migration adds `harness_runs` + `harness_calls` (run id, git sha captured at dispatch — no git library, command, model, tokens, latency, error category); generated schemas untouched by hand; `migrations.test.ts` + roundtrip green.
- [x] `harness` MemoryScope shipped and wired (`src/memory/types.ts:27-37`, store/recall `src/memory/harness-recall.ts:83`, provisioning guard `src/memory/provision.ts:195-197`).
- [ ] Run lineage via `recordAuditLog` + `reconstructMessageChain` patterns. Memory privacy gates (`shouldInjectMemory`) apply to harness scope.

## Related Files

- `src/logger/transports/`, `src/db/migrations/`, `src/db/schema-*.ts` (generated), `src/memory/embeddings.ts`, `injection/`, `history-search.ts`
- `epic-memory-knowledge-systems.md`, `src/db/migrations/README.md` (append-only policy)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 55d6d79
