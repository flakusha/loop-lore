<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Bridge file-watch roundtrip

**Status:** Not Started
**Priority:** high
**Effort:** Large
**Epic:** epic-external-creative-tool-bridge
**Tags:** bridge, assets
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

Watch-folder plus versioned re-ingest over per-user working dirs (chokidar-class watcher semantics: awaitWriteFinish stability threshold, atomic temp-rename handling); re-ingest creates new asset versions with lineage and provenance (editor, timestamp) plus collision/rename handling. AC: a simulated editor save (partial write then stable) ingests exactly once; re-ingest never overwrites; watcher crash recovery re-syncs from dir state without duplicates.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
