<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(server): exit non-zero on uncaughtException/unhandledRejection shutdown

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-server-lifecycle-hardening

**Summary:**

Sources: stream-a #10. Where: src/server/start.ts:215-233, :243-263 (shared shutdown ends process.exit(0) on all paths). Gap: crash-path shutdowns report success, so orchestrators and alerting never fire on uncaughtException/unhandledRejection - the process looks cleanly stopped. Acceptance: shutdown takes an exit code: 0 for SIGTERM/SIGINT/SIGHUP, non-zero for crash paths; observable process exit code differs between clean stop and crash. Priority: medium - supervisor/alerting visibility; one-line-class fix with outsized observability value.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
