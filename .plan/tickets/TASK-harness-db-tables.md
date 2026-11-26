<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness DB tables (runs + calls + embedding scope)

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Epic:** epic-harness-integration
**Summary:** JSONL → git+db cross-search in two iterations: Transport impl first, then `harness_runs`/`harness_calls` migration + `harness` MemoryScope wired into recall/injection.

**Status Note:** 2026-11-25 reconcile: iteration 1 (JSONL transport + `harness` memory scope) shipped as before, and iteration 2 DB shape SHIPPED — `src/db/migrations/018_harness_runs_calls.ts:24-87` creates `harness_runs`/`harness_calls` with git sha/command/model/token/latency/error columns, FK and index; generated types at `src/db/schema.ts:276-277` + `src/db/schema-core.ts:2397,2424`; contract tests at `src/db/harness-runs-calls.test.ts:31-155`. Residual scope is only the runtime write/read path: no producer outside test helpers (`src/test-utils/insert-helpers.ts:6958-7025`) and no harness-run lineage through `reconstructMessageChain` (`src/memory/history-search.ts:147-207`).
**Context:** DB is Bun SQLite + Kysely, WAL+FK, 169 tables (`schema.ts` barrel, `schema-manifest.ts` SToT). Reuse: `logger/transports/file.ts` (JSONL append + rotation) + `Transport{write,flush}` + queue; `request_results`/`telemetry_events` column shapes; `memory/embeddings.ts` (`storeEmbedding`, `semanticRecall`) + `injection/decide.ts|select.ts` + `audit.ts`; `history-search.ts` chain reconstruction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Iteration 1: SUPERSEDED in shape — the JSONL exec-log transport shipped (`src/harness/exec-log.ts`, `executions.jsonl` append) rather than a separate `Transport` impl writing `harness_runs.jsonl`; no new transport work remains.
- [ ] Iteration 2 (the only remaining scope): forward migration adds `harness_runs` + `harness_calls` (run id, git sha captured at dispatch — no git library, command, model, tokens, latency, error category); generated schemas untouched by hand; `migrations.test.ts` + roundtrip green.
- [x] `harness` MemoryScope shipped and wired (`src/memory/types.ts:27-37`, store/recall `src/memory/harness-recall.ts:83`, provisioning guard `src/memory/provision.ts:195-197`).
- [ ] Run lineage via `recordAuditLog` + `reconstructMessageChain` patterns. Memory privacy gates (`shouldInjectMemory`) apply to harness scope.

## 2026-11-25 residual scope

Shipped: migration 018, generated schema/manifest types and the 3-case
contract test (column contract, FK + down/up roundtrip, rejected bad writes).
Residual: runtime producers and the lineage/privacy read path — the only
`harness_runs`/`harness_calls` inserts outside the migration test are test
helpers (`src/test-utils/insert-helpers.ts:6958-7025`), and
`src/memory/history-search.ts:147-207` has no harness-run caller. Status
stays In Progress until that path lands.

## Related Files

- `src/logger/transports/`, `src/db/migrations/`, `src/db/schema-*.ts` (generated), `src/memory/embeddings.ts`, `injection/`, `history-search.ts`
- `epic-memory-knowledge-systems.md`, `src/db/migrations/README.md` (append-only policy)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*


git issue: 55d6d79
