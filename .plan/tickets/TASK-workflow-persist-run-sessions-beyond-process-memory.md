<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workflow: persist run sessions beyond process memory

**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** Medium

## Summary

Workflow runs live in an in-memory Map in src/assistant/workflow-session.ts (one active run per chat). Restart wipes runs; multi-process deployments lose them mid-flow. Scope: persist sessions (DB table or chat-scoped kv) with TTL/abandon, rehydrate on dispatch. Acceptance: restart-safe runs; stale-run expiry; tests cover round trip.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
