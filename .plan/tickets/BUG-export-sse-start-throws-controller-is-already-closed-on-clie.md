<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: export-sse start throws Controller is already closed on client disconnect

**Status:** ✅ Done
**Priority:** Medium
**Effort:** Medium

## Summary

src/routes/export-sse/start.ts: polling interval throws when the client disconnects mid-stream (enqueue/close after cancel). Found during unit-test-coverage-2; caused an unhandled error in module runs. Fix: guard enqueue/close with a closed flag or try/catch around controller ops.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Resolution

SSE poller reworked: closed flag + safeEnqueue/teardown guard all controller ops; disconnect mid-stream tears down quietly instead of throwing from the interval tick.
Landed on `fix-transport-bugs` (transport-domain batch, 2026-09-08).
