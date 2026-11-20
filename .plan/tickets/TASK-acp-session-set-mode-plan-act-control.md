<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: ACP session set_mode plan act control

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-external-harness-acp
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:** Add ACP `session/set_mode` (plan/act) and keep `current_mode_update` as an event.

**Context:** Stable ACP method used by omp, opencode, codex-acp, Cline and Cursor; loop-lore has no `session/set_mode` and drops `current_mode_update` in narrowing. Gap G13 in `.tmp/research/harness-parity/21-parity-gap-ranked.md:348-373`.

**Acceptance Criteria:**

- [ ] Adapter sends `session/set_mode` with a profile-configured mode id and records the reply.
- [ ] `current_mode_update` narrows to a typed event and surfaces in the transcript.
- [ ] Fake fixture asserts both the request and the notification; children reaped in `afterEach`.
