<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Memory to lorebook one-click promote

**Status:** Done
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

ST memory-to-lore is manual everywhere (DeepWiki: vectors ext can include World Info, promotion is manual). Differentiator: one-click promote of a chat summary into a lorebook entry. Scope: assistant command or chat action taking a summary/message range, drafting entry (keys auto-suggested from content), user confirms before insert; reuse inclusion-group admission + activation scoring. Research: .tmp/research/metaapps-summary-2026-11-03.md gap 4, st-gap-validation-2026-11-03.md. Epic: epic-lorebook-inclusion-groups.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
