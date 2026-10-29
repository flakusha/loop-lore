<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: PTY spawn audit logging to harness exec-log

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. Wire every terminal PTY spawn (command, sandbox root, pid, session) into src/harness/exec-log.ts via recordExecRun. Admin-only route, allowlisted EDITOR spawn, log covers audit. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md Security section.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
