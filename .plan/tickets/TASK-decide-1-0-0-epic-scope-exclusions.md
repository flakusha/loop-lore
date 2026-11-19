<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Decide 1.0.0 epic scope exclusions

**Status:** In Progress
**Scope:** Record bounded local multi-instance scope and gallery OUT recommendation
**Priority:** high
**Effort:** Small

**Summary:**

Decide which Not-Started epics are explicitly OUT of release 1.0.0 and record the ruling in the release tracker.

**Context:** The release tracker lists open questions; the OUT list is still undecided. Without it, scope cannot be closed.

**Acceptance Criteria:**

- [ ] Ruling recorded in the 1.0.0 tracker with the excluded epic slugs.
- [ ] Included epics that remain open are named with owners.
- [ ] Tracker open-question entry resolved.

**Caveats:** TOCTOU: n/a, decision only. Security: n/a. Authorization: operator decision. Parallelism: none. Partial failure: n/a. Rollback: n/a. Observability: tracker is source of truth.

## Ruling (2026-11-19, partial)

- **Local multi-instance: IN 1.0.0, bounded to isolation.** Instance selection
  (`--instance` / `LOOP_LORE_INSTANCE`), per-instance state root (own SQLite DB,
  uploads, certs, backups, harness exec log), the two-instance dev harness and
  runbook, and a release note of the guarantee and its limits. OUT: state
  sharing/sync, cross-instance messaging or federation (including two local
  peers over the federation mesh), supervisor/orchestrator/controller/comm node,
  multi-process decomposition and remote peers. Boundary wording and
  release-note link: `docs/guide/two-instance-federation.md` § "1.0.0 scope
  (bounded)".
- **Gallery backlog: OUT of 1.0.0.** All enhancement items (fuzzy
  search/pagination, structured editor, download+review, review/approval queue,
  minors sweep, generation linkage/set-and-3D) are post-1.0.0.
  `TASK-gallery-download-review.md` is stale — download already shipped — and
  needs a re-scope to review-only in its own lane; this records the
  recommendation only.
- **Relay/swarm node mode and remote federation: OUT of 1.0.0.**
  `FEAT-relay-swarm-node-mode` and federation/mesh work stay post-1.0.0.
- **Remaining operator input:** the full Not-Started epic OUT slug list is
  deliberately NOT invented here. It stays open question 2 in
  `TASK-epic-release-1-0-0.md`; only the three scope decisions above are
  settled.
