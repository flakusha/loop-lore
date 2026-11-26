<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: plan validate: warn on unknown ticket headers

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-unified-spec-framework
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Unknown **Header:** lines are silently accepted and the object form drops them, so header vocabulary grows by default: Status Note reached 898 files plus 287 Assignee, 123 Scope, 81 Depends on. Add a warn-level unknown-header finding (allow-list per record type) so new headers become visible prose instead of silently dropped fields. Research: .tmp/research/giwt-md-json-roundtrip-gaps-2026-11-26.md (G10). Acceptance: plan validate reports unknown headers; the four headers above are either allow-listed or flagged.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
