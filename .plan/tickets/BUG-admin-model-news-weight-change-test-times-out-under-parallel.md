<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: admin model-news weight-change test times out under parallel-coverage load

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** flaky-test, load-induced
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Load-induced flake, not a product bug. Companion leg of coverage-per-module gate (run-1182435-mw51qjsn): (fail) admin model-news routes > GET weight-change returns false for unknown model [5000.07ms] — test timed out after 5000ms. Log: tree/professions-service-routes/.tmp/run-1182435-mw51qjsn/check-fail-coverage-per-module-line.log lines 161-163. Test: src/routes/admin/news.test.ts:75-82 (GET /api/admin/model-news/weight-change/nope, trivial in-memory handler — no I/O to legitimately take 5s). Companion run 13031 pass / 1 fail vs diff-scoped rerun 13154 pass / 0 fail; the coverage floor never rendered due to short-circuit on the companion failure. Suspect CPU starvation under 4x parallel bun test with coverage. Fix direction: quarantine/retry or raise timeout for this file under parallel-coverage load; do NOT change handler semantics. Do NOT edit the news test itself in the professions-service-routes lane. Caveats: TOCTOU n/a (in-memory read); security n/a; authorization n/a (admin-gated route, test-only); parallelism — root cause is parallel-load starvation; lock/unlock n/a; partial failure — gate short-circuits floor render; rollback n/a; stale state n/a; data races n/a; idempotency n/a; observability — log path cited above.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
