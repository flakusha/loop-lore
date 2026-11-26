<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: caveats coverage metric for the ticket corpus

**Status:** Done
**Scope:** Implement doc-schema and md-roundtrip tickets; verify installed giwt fixes
**Priority:** medium
**Effort:** Small
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

checkTicketCaveats is inert without --diff-base, so most of the corpus has no machine answer to whether a ticket declares its caveats. Add a repo-wide caveats coverage metric (or un-scope the gate) so coverage is measurable outside diffs. Research: .tmp/research/giwt-md-json-roundtrip-gaps-2026-11-26.md (G9). Acceptance: one command reports caveats coverage across all tickets.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-26 registry-driven close: git issue 87ceebb (registry tip: fa7ca8679 Konstantin Fedotov Close issue)
