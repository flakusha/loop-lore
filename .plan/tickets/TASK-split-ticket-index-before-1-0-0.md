<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: Split ticket index before 1.0.0

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Caveats:** TOCTOU: shard writes must be atomic across files. Security: n/a. Authorization: n/a. Parallelism: plan gates share the giwt index lock. Partial failure: shard writes roll back together. Rollback: restore the single-file index from git. Observability: `plan:sync` report shows shard counts.

**Summary:**

The tracked .plan/tickets/index.json is ~2.2 MB and churns every plan sync. Split into per-type shards before release. Prerequisite: giwt sync tooling must read/write shards (giwt-repo work per operator ruling). Acceptance: shards + single sync entry point, plan:validate + plan:sync green, no 2MB single-file churn.

**Context:**

Operator ruling 2026-11-19: the index split is required before 1.0.0 (tracker decision log). The single tracked `.plan/tickets/index.json` is ~2.2 MB and is rewritten on every plan sync. Per the standing operator ruling, sync-tooling changes belong in the giwt repo, not this repo; this ticket tracks the loop-lore-side cutover once giwt supports shards. Alternatives: keep one file (rejected — operator required the split); generate shards but keep a merged tracked index (rejected — no churn reduction).

**Acceptance Criteria:**

- [ ] giwt sync supports shard read/write (upstream prerequisite recorded).
- [ ] `.plan/tickets/index.json` is replaced by type shards; `plan:sync` and `plan:validate` green.
- [ ] No single 2 MB tracked snapshot churns on every sync; priority/matrix/code-map consumers read shards.
- [ ] Release tracker decision log references the completed split.
