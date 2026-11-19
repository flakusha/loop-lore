<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: composer Up Down recall of prior typed text

**Status:** Done
**Priority:** medium
**Effort:** Small
**Epic:** epic-chat-composer-flows.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Arrow keys are consumed by mention, command and model popovers, but there is no composer history. Users cannot recall text they just typed after clearing or exploring the composer.

**Evidence (dev 2026-11-18):** chat-group.ts:192-259 handles arrows only for popovers; no history array; improve-undo and draft-restore already shipped, so the UI seam exists.

**Scope:** keep a bounded per-chat history array in the Alpine composer state; push on send; recall only after popover guards; reset on chat switch; add two focused tests.

**Acceptance Criteria:**

- [x] Up recalls last sent text when no popover is open
- [x] Down returns to the newer entry and then the empty draft
- [x] popover navigation takes precedence
- [x] history is scoped per chat

**Context:**

Shipped on branch `composer-history`. Sent lines are pushed by `rememberComposerText` in `src/frontend/alpine/composer-history.ts`; `recallComposerHistory` walks the per-chat map, clamps the cursor at the ends, and saves the draft. Popover ownership is checked before recall. Focused tests cover recall, chat scoping, and popover precedence; scoped verification gate `bun run check --diff-base a7bef74b0` is green apart from pre-existing baseline debt in `tests - coverage gaps`.
