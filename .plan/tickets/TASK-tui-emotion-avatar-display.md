<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: tui-emotion-avatar-display

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-emotion-avatar-message-binding
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI shows emotion avatars or expression markers on messages. Web reference: src/frontend/alpine/mood/avatars.ts plus actor-emotion-avatars.ts. Missing: no avatar or mood marker under src/tui. Acceptance: active emotion visible per message; bun test covers resolution.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
