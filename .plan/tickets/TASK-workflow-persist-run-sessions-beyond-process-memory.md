<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Workflow: persist run sessions beyond process memory

**Status:** ✅ Done (shipped: part 021 `workflow_sessions` table — numbered past search-unified's unmerged 020; src/assistant/workflow-session-store.ts write-through/rehydrate/lazy TTL expiry; dispatch rehydrates before routing; `/workflow` status/cancel/confirm resolve persisted runs. Verified: migration roundtrip + store/dispatch tests green.)
**Priority:** Medium
**Effort:** Medium

## Summary

Workflow runs live in an in-memory Map in src/assistant/workflow-session.ts (one active run per chat). Restart wipes runs; multi-process deployments lose them mid-flow. Scope: persist sessions (DB table or chat-scoped kv) with TTL/abandon, rehydrate on dispatch. Acceptance: restart-safe runs; stale-run expiry; tests cover round trip.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
