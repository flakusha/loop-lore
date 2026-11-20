<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP plan events support

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Preserve ACP agent `plan` events through narrowing, transcript and persistence.

**Context:** `plan` is a stable `session/update` variant emitted by codex-acp and Cursor; loop-lore drops it in narrowing. Gap G15 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:555-570`.

**Acceptance Criteria:**

- [ ] A `plan` notification narrows to a typed event preserving entry order and priority.
- [ ] The event is carried in the turn transcript and persisted alongside `thinking`.
- [ ] Pure test in `acp-session-update.test.ts` with no child process or DB.
