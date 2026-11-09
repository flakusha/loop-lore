<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: RenPy export model gather from DB

**Status:** Not Started
**Priority:** high
**Effort:** M
**Epic:** epic-renpy-export
**Tags:** renpy, export, plugin
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

DB layer in plugins/core/renpy-export: caller-owned chats only (batchExportChats parity, created_by=userId filter), active branch root-to-tip path via walkMessagePath, sibling branches sharing parent_message_id become menu stubs grouped by fork, participants joined to actors for display names, avatar bytes via getAssetData with loadConfig uploadDir with encrypted assets skipped; vn_choices left out of v1 (scene_index is a client-side ordinal, not message-anchored).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
