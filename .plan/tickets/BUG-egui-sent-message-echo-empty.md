<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: egui sent-message echo empty

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

parse_sent_message (native/loop-lore-egui/src/api.rs:264) expects a data envelope the server never emits — responses.ts:93-108 flattens to {id,context,meta}. Echoed user row renders empty (api.rs:295). Evidence: .tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
