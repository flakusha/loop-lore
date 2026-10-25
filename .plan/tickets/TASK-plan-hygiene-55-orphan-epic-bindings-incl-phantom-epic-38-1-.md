<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: plan hygiene: ~55 orphan epic bindings (incl. phantom EPIC-38) + 1 actionable sync issue

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Plan hygiene: repair the advisory failures reported by `bun run plan:validate` / `plan-ticket-index` in the 2026-10-25 gate run.

**Files:**

- .plan/tickets/*.md epic bindings (orphans)
- .tmp/run-40245-mvnullh2/check-fail-plan-validate.log
- .tmp/run-40245-mvnullh2/check-fail-plan-ticket-index-sync.log

**Evidence:**

- plan-validate advisory: orphan epic bindings ~55 total, incl. FEAT-065-PROMPT-LIBRARY-EXPANDED / FEAT-065-SUB-AUDIO / FEAT-065-SUB-VIDEO → "EPIC-38" (no epic .md file — phantom), FEAT-2026-001/002/003 → binding ":" (gates.md gate table).
- plan-ticket-index (sync) advisory: `giwt sync` exit 1: "1 actionable issue(s) found, 4254 advisory ... 3977 tickets, 0 fixed, 1 remaining" (gates.md).

**Fix:**

Point the ~55 orphan bindings at existing epic .md files (or drop the binding where the epic was never created; create/remove phantom EPIC-38 references); run `bun run plan:sync:fix` / `plan:validate:fix` and resolve the one actionable sync issue.

**Review:** .tmp/reviews/2026-10-25/ (2026-10-25 round) — gates.md (advisories).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
