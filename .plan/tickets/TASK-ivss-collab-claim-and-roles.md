<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: IVSS collab claim and roles

**Status:** Not Started
**Priority:** medium
**Effort:** Large
**Epic:** epic-image-video-scenario-studio
**Tags:** ivss, collaboration, db
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Optimistic concurrency (version columns on scenario docs), transactional compare-and-swap shot claims, world_members.role column (viewer|editor|admin), and a shared-library flag on collections. No CRDT — full realtime co-editing was explicitly considered and deferred (2026-10-29); it is the future path if multi-master/realtime requirements emerge. AC: a concurrent doc edit returns 409 with the current doc; a shot claim is compare-and-swap (second claimer sees claimed-by-X); the viewer role cannot write anywhere.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
