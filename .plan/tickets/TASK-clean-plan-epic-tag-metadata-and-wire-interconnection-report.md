<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: clean plan epic tag metadata and wire interconnection reporting

**Status:** In Progress
**Priority:** medium
**Effort:** Medium
**Tags:** plan, cleanup, documentation
**Upstream:** giwt/FEAT-plan-links-derive-and-validate-producers-consumers-siblings

**Summary:**

Problem: .plan ticket index has dirty epic values such as (if applicable) and prose captured into Epic fields; .plan README counts are stale; generated code-map and feature matrix have no derived human graph.

Scope: normalize Status/Priority/Effort/Tags/Epic fields with existing giwt metadata tooling; reject (if applicable) and prose as epic values; regenerate code-map and feature matrix; update .plan README and research-unified-spec-framework to document producer/consumer/sibling derivation; keep ticket/epic counts qualitative.

Implementation record (2026-10-16, worktree plan-interconnection-tickets):

- Ran `giwt sync --fix` in the linked worktree; the cleanup ticket was adopted into the index computation, but giwt intentionally deferred `index.json` writing to post-merge regeneration on the target branch.
- Ran `giwt plan metadata`; no Labels/Epic markdown rewrites, 3 tag and 3 epic index projections were counted.
- Ran `giwt plan normalize-statuses`; 1092 index status values were normalized, 20 unresolved values remain intentionally untouched pending alias decisions.
- Regenerated `.plan/feature-matrix.md`, `.plan/code-map.json`, and `.plan/epics-index.md`.
- Updated `.plan/README.md` and `.plan/research-unified-spec-framework.md`.
- Validation: `backlog sync`, `plan matrix --check`, `plan code-map --check`, and `plan gen-docs --check` pass. `plan validate` passes with `--skip-gates tickets`; the `tickets` gate remains red in the linked worktree because giwt defers index writes there. Final index reconciliation must run in the main checkout or post-merge.

Acceptance criteria:

- giwt sync --fix, plan metadata, plan normalize-statuses, plan code-map, plan matrix, plan validate, and backlog sync pass from the worktree
- In a linked worktree, the unresolved `tickets` gate caused by deferred `index.json` writing is documented, and `plan validate --skip-gates tickets` passes
- The main checkout/post-merge run of `giwt sync --fix`, `giwt plan matrix`, and `giwt plan code-map` reconciles the deferred index
- No index entry has Epic equal to (if applicable), **Related**, or another prose fragment
- feature-matrix.md and code-map.json are fresh
- .plan README no longer asserts volatile ticket/epic counts
- Research note reference: .tmp/research_interconnect_feature_request.md

**Possible Caveats and Issues to Avoid:**

- TOCTOU: generated code-map/feature matrix can become stale while metadata cleanup edits files; regenerate after edits and refuse stale plans.
- Security: reject absolute paths, symlink escapes, and prose pretending to be an Epic or Related identifier.
- Authorization: metadata cleanup must not rewrite ownership/git-issue state without explicit `--fix`.
- Parallelism: concurrent ticket/issue writes can invalidate index.json; run sync from a worktree and fail closed on fingerprint mismatch.
- Lock/unlock lifecycle: no long-held locks; generated artifacts are rewritten and committed as one plan-only batch.
- Partial failure: preserve existing metadata if a rewrite fails; no half-normalized ticket files.
- Rollback: index and generated files must be reproducible from `.plan/` sources.
- Stale plan states: normalize only canonical vocabulary; do not infer status from prose.
- Data races: deterministic read/parse/order before writing index and generated docs.
- Idempotency: repeated `sync --fix`, metadata, code-map, matrix, and backlog sync must not drift.
- Observability: name every dirty ticket file and invalid field value.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
