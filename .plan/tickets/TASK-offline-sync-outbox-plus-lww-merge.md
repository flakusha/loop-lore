<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: offline-sync outbox plus LWW merge

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-federation-swarm-sync
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Owner epic: epic-federation-swarm-sync.md Phase D. Slices: sync_outbox/cursors/checkpoints/conflicts tables, LWW merge, selective-scope prefs over existing WS/SSE. Precondition: close synthesis section-4 item 8 (no .ws mount in elysia-app). Defer Yjs/Automerge collab text. Caveats: split-brain divergence, outbox unbounded growth, clock skew on LWW.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
