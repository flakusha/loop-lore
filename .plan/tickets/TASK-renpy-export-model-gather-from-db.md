<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export model gather from DB

**Status:** In Progress
**Priority:** high
**Effort:** M
**Epic:** epic-renpy-export
**Tags:** renpy, export, plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DB layer in plugins/core/renpy-export (model.ts): unknown chats throw (route maps to 404), active branch root-to-tip path via the same parent_id walk as the branch service, remaining chats fall back to created_at order, sibling branches become menu stubs, participants joined to actors for deduped speaker slugs, public avatars bundled as bytes (missing files keep the define without bytes); implemented + tested (model.test.ts, 5 tests).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
