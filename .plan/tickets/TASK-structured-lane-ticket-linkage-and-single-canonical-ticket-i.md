<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: structured lane-ticket linkage and single canonical ticket id

**Status:** Done
**Scope:** Implement doc-schema and md-roundtrip tickets; verify installed giwt fixes
**Priority:** high
**Effort:** Medium
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Proposal section 4 and addendum ordering: intercom LANE files link to tickets by free text, and tickets carry a split identity (filename slug vs extid vs git-issue number) with nothing repairing drift. Define one canonical id threaded through lane files, ticket files, index, and issues, plus a structured lane-to-ticket link (claim field: who holds the claim). Research: .tmp/research/lolo-harness-coordination-surface-2026-11-26.md section 9, .tmp/research/lolo-harness-doc-schema-addendum-md-roundtrip-2026-11-26.md. Acceptance: every open LANE resolves to a ticket id; id drift is detected by a check.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-26 registry-driven close: git issue 23ab3c9 (registry tip: ebbbfaa73 Konstantin Fedotov Close issue)
