<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Web editor: PTY terminal route (approach B)

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-browser-editor-support
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Epic: epic-browser-editor-support. WS /api/v1/terminal via native Bun.serve websocket handler plus server.upgrade (NOT Elysia .ws, fails under start.ts shape). Bun.spawn with terminal, byte relay, resize envelope, kill on disconnect/idle, xterm.js panel. Full context in tree/web-editor-term/.plan/epics/epic-browser-editor-support.md section B.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

git issue: 5bf3df5
