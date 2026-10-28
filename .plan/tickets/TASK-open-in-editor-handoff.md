<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Open-in-editor handoff

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-3d-generation
**Tags:** 3d, bridge
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Export-to-working-dir plus open-in-editor action (the bridge epic owns watch/re-ingest; this epic owns the export, manifest, and re-ingest acceptance). AC: an edited file re-ingested via watch creates a NEW asset version linked by lineage (never overwrites); provenance records the editor round-trip; NSFW rating of the source propagates to the derivative.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
