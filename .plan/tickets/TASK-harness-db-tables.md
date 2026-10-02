<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Harness DB tables (runs + calls + embedding scope)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** `.plan/epics/epic-harness-integration.md`
**Summary:** JSONL → git+db cross-search in two iterations: Transport impl first, then `harness_runs`/`harness_calls` migration + `harness` MemoryScope wired into recall/injection.
**Context:** DB is Bun SQLite + Kysely, WAL+FK, 169 tables (`schema.ts` barrel, `schema-manifest.ts` SToT). Reuse: `logger/transports/file.ts` (JSONL append + rotation) + `Transport{write,flush}` + queue; `request_results`/`telemetry_events` column shapes; `memory/embeddings.ts` (`storeEmbedding`, `semanticRecall`) + `injection/decide.ts|select.ts` + `audit.ts`; `history-search.ts` chain reconstruction.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Iteration 1: new `Transport` impl (harness event → `harness_runs.jsonl`) reusing queue + rotation; one file, mirrors `file.ts`.
- [ ] Iteration 2: forward migration adds `harness_runs` + `harness_calls` (run id, git sha captured at dispatch — no git library, command, model, tokens, latency, error category); generated schemas untouched by hand; `migrations.test.ts` + roundtrip green.
- [ ] Harness call summaries stored via `storeEmbedding` + new `MemoryScope` (`harness`), recalled via `semanticRecall`, injected via the `selectMemoriesForInjection` importance+cap pattern.
- [ ] Run lineage via `recordAuditLog` + `reconstructMessageChain` patterns. Memory privacy gates (`shouldInjectMemory`) apply to harness scope.

## Related Files

- `src/logger/transports/`, `src/db/migrations/`, `src/db/schema-*.ts` (generated), `src/memory/embeddings.ts`, `injection/`, `history-search.ts`
- `epic-memory-knowledge-systems.md`, `src/db/migrations/README.md` (append-only policy)

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*
