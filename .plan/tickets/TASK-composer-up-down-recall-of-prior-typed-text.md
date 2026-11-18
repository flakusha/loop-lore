<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: composer Up Down recall of prior typed text

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-composer-flows.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Arrow keys are consumed by mention, command and model popovers, but there is no composer history. Users cannot recall text they just typed after clearing or exploring the composer.

**Evidence (dev 2026-11-18):** chat-group.ts:192-259 handles arrows only for popovers; no history array; improve-undo and draft-restore already shipped, so the UI seam exists.

**Scope:** keep a bounded per-chat history array in the Alpine composer state; push on send; recall only after popover guards; reset on chat switch; add two focused tests.

**Acceptance Criteria:**

- [ ] Up recalls last sent text when no popover is open
- [ ] Down returns to the newer entry and then the empty draft
- [ ] popover navigation takes precedence
- [ ] history is scoped per chat

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)
