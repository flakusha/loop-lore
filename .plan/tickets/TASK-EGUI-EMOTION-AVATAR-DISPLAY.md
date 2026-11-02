<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: egui-emotion-avatar-display

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-emotion-avatar-message-binding
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

egui shows emotion avatars on messages. Web reference: src/frontend/alpine/mood/avatars.ts plus actor-emotion-avatars.ts. Missing: no avatar view in native/loop-lore-egui. Acceptance: active emotion avatar visible per message; rust test covers resolution.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

Imported from git issue 5590c96.

git issue: 5590c96
