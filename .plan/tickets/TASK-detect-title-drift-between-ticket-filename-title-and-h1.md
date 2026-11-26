<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: detect title drift between ticket filename title and H1

**Status:** Done
**Scope:** Implement doc-schema and md-roundtrip tickets; verify installed giwt fixes
**Priority:** low
**Effort:** Small
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Nothing repairs drift between the ticket filename slug, the title line, and the H1 when they diverge after renames or edits. Add a drift finding (filename slug vs H1 vs index title) with a fix path. Research: .tmp/research/giwt-md-json-roundtrip-gaps-2026-11-26.md. Acceptance: drifted tickets are listed by a check; fix restores agreement.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-11-26 registry-driven close: git issue 6e93118 (registry tip: db2d884a2 Konstantin Fedotov Close issue)
