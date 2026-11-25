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

Watch-folder ingest is optional: direct upload and explicit ingest paths stay supported and no consumer is required to route through a watched directory.

**Current state (2026-11-25):** this is a plan-only ticket; no watcher implementation was verified in the 2026-11-25 source review (`.tmp/research/full-cycle-app-integrations-2026-11-25/dcc-and-closed-loop.md:156,217`). The editor save grant (owner/run/base version/base hash/expiry/single-writer lease, stale and competing-save semantics) belongs to the narrow `TASK-editor-save-grant-and-conflict-receipt` candidate in `.tmp/research/full-cycle-app-integrations-2026-11-25/plan-promotion-map.md`; reference that grant here, do not implement or refile it in this ticket.

**Acceptance Criteria:**

- [ ] Watcher declares a write-quiescence stability threshold and ingests only after an atomic temp-to-final rename; partial writes are never ingested.
- [ ] Ingest hashes the complete file and checks the expected base hash supplied by the owning run/grant; a stale base yields a named conflict, never an overwrite.
- [ ] Idempotent ingest identity keyed by (consumer/run, logical asset, base hash, new content hash) prevents duplicate versions on retry or replay.
- [ ] Symlink and path targets are confined to the approved per-user working dir; outside targets are rejected.
- [ ] Watcher restart re-syncs from directory state without duplicate versions.
- [ ] Each accepted re-ingest creates an append-only version with editor/timestamp provenance under `TASK-asset-versioning`; no version is overwritten.
- [ ] Tests passing and documentation updated, including the optional-watching rule.
