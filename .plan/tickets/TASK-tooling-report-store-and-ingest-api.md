<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tooling report store and ingest API

**Status:** In Progress
**Priority:** high
**Effort:** Medium
**Epic:** epic-recursive-self-improvement
**Tags:** harness, rsi
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

TASK: tooling report store and ingest API

**Effort:** Medium
**Summary:** Add a categorized, queryable, deduped cross-source report store (DB table + JSONL spool) and a POST/GET ingest API so the assistant, harness, giwt, and check runner can report tooling failures, exhausted retries, persistent failures, and performance issues into one place. RSI #20 (cluster miner) consumes this store instead of log_entries.
**Context:** Review: .tmp/research/rsi-report-api-and-harness-report-device-2026-11-20.md. Prior art: xd://report_issue (oh-my-pi, ~/.omp/autoqa.db grievances table, consent-gated, pushes to qa.omp.sh); harness exec log (in-process only, no attempt dimension); giwt ledger (tree .ledger.jsonl); check report (.tmp/check-report.json, scratchpad-only). HTTP-writable observability stores exist already (telemetry events, frontend logs); this is the first HTTP-writable TOOLING-FAILURE store. Harness routes already write DB rows (settings, escalation decisions).
**Acceptance Criteria:**

- [ ] Migration 113 creates tooling_reports table with columns: id, ts, source (assistant|harness|giwt|check), category (tooling_failure|retry_exhausted|persistent_failure|performance), tool, attempt, max_attempts, detail, duration_ms, profile, branch, git_sha, instance_id, dedupe_key, count, last_seen.
- [ ] dedupe_key upsert increments count and refreshes last_seen (idempotent).
- [ ] JSONL spool at `<instance-dir>`/harness/reports.jsonl (best-effort, swallow errors).
- [ ] POST /api/v1/harness/reports (auth-gated) validates payload; GET with pagination (cap 200) and filters source/category/tool/dedupe_key.
- [ ] Instance isolation: rows scoped by instance_id; cross-instance reads forbidden.
- [ ] Rate limit on POST; tests for schema rejection, dedupe, isolation, spool failure.
- [ ] RSI #20 amended to consume tooling_reports (persistent_failure clustering).

**Files:**

- src/db/migrations/113_tooling_reports.ts
- src/routes/harness/reports.ts (or extend index)
- src/harness/reports.ts
- src/harness/types.ts
- generated DB artifacts (db:sync-types / db:sync-manifest), docs/reference/api.md, CHANGELOG.md
- tests

**Notes / Verification:**

- Fold into agent_actions (#9) if that lands first; otherwise standalone table.
- Do NOT add a device:// scheme; reuse xd://report_issue. Do NOT add a second failure store.
