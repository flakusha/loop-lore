<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: sync-instance-resolution-rule-and-drop-ignored-sqlitefilename

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-deployment-topologies.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

The guide and the shipped example configs document a DB knob the runtime never reads. Rewrite `docs/guide/installation.md` macOS/Linux quick-start (clone / cd / install / migrate / dev), drop the no-op `SQLITE_FILENAME` from the `.env` block, and name the three knobs that actually move the DB: `LOOP_LORE_DB_PATH`, `LOOP_LORE_STATE_DIR`, `XDG_STATE_HOME`. State that `config.db.sqliteFilename` is ignored, with a link to `docs/guide/state-and-instances.md`. Comment out (do not delete) `sqliteFilename` in all four example configs plus `configs/env.example.yaml`, using the repo WARNING style.

**Context:**

- This ticket TRACKS LANDING the implementation, it does not rebuild it. The implementation already exists in the dev tree, UNCOMMITTED (sibling lane `instance-doc-and-config-drift`, 6 files: `docs/guide/installation.md`, `configs/config.example.toml`, `configs/config.example.yaml`, `configs/config.database.example.toml`, `configs/config.database.example.yaml`, `configs/env.example.yaml`).
- Authoritative rule (committed): `docs/guide/state-and-instances.md`.
- Out of scope: `docs/spec/implementation.md:356`, `docs/spec/implementation.md:401`.
- Epic: `epic-deployment-topologies.md` (Status Not Started); docs-only either way.

**Related:**

- `.tmp/research/06-next-steps-proposal.md:84` (the original spec, §3c)
- `docs/guide/state-and-instances.md` (authoritative instance-resolution rule)
- honkbox `TASK-loop-lore-provider-smoke.md` (Status: proposed) — closest honkbox instance/data-dir analogue (per-run temp data dirs for both apps); honkbox has no `sqliteFilename` analogue

**Acceptance Criteria:**

- [ ] `docs/guide/installation.md` macOS/Linux quick-start covers clone / cd / install / migrate / dev and no longer tells the reader to set `SQLITE_FILENAME`.
- [ ] The guide names `LOOP_LORE_DB_PATH`, `LOOP_LORE_STATE_DIR`, `XDG_STATE_HOME` as the knobs that move the DB, and states `config.db.sqliteFilename` is ignored with a link to `docs/guide/state-and-instances.md`.
- [ ] `sqliteFilename` is commented out (not deleted) in the four example configs and `configs/env.example.yaml`, with the repo WARNING comment style.
- [ ] The six-file sibling-lane implementation lands with this ticket; no unrelated files are touched.
- [ ] `docs/spec/implementation.md:356` and `:401` are left alone.
- [ ] Tests passing, docs updated.
