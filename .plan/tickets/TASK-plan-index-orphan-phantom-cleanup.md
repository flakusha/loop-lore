<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: plan index — prune pre-existing phantom entries

**Status:** Done
**Priority:** medium
**Effort:** Small (giwt change + manual review)
**Summary:** Audit and drop the phantom entries then present in `.plan/tickets/index.json` — entries where the index has `extid` + `git_issue` but the corresponding `.plan/tickets/*.md` (or `.plan/epics/*.md`) file does not exist with that exact extid. These phantoms predate `giwt sync --fix --import` adoption; the entries are uppercase-cased extids (`EPIC-2D-SPRITE-WORLD`) whose lowercase `.md` files (`epic-2d-sprite-world.md`) never made it into the index because the sync dropped them on a case-sensitive match.
**Context:** At filing time, every `giwt sync` (without `--fix`) reported a large phantom backlog. The `tickets` gate in `giwt plan validate` uses `giwt sync` exit code as its pass/fail signal, so the gate stayed red until the phantoms were pruned. The phantoms are stale uppercase names; the real `.md` files exist with lowercase names. Sync `--fix` tries to relocate them via case-variant patterns but does NOT drop them when relocation fails. This ticket closes the gap.

Identified during debt-cleanup-2026-09-24 work; pre-existing dev state confirmed by running `bun run plan:validate` on dev HEAD before the worktree branched. Not introduced by any recent change.

**Acceptance Criteria:**
- [ ] `giwt sync` (without `--fix`) reports 0 phantom entries.
- [ ] `giwt plan validate` `tickets` gate passes on dev.
- [ ] Each drop is logged with the extid + reason in the run record (`.tmp/giwt/runs/…-sync/meta.json`).
- [ ] A `--keep-stale` flag on `giwt sync --fix` preserves existing behaviour for the case where an operator deliberately wants to drop phantoms manually.
- [ ] The 297 phantoms are reviewed in batches of 50 (per epic family) and either (a) confirmed-pruned, (b) relocated to an existing lowercase `.md`, or (c) reissued as a new epic stub file. The audit log records which path each extid took.
- [ ] Tests cover the drop + relocate + reissue paths; the audit log format is locked.
- [ ] `bun run check` green on giwt.

**Epic:** epic-task-management-integration
**Tags:** planning, giwt, tooling, index, cleanup, debt, audit
**Related:** TASK-plan-index-tagging-binding-reconciliation, TASK-MANAGEMENT-INTEGRATION, src/tickets/sync-index.ts:421-454 (the phantom-relocate block in `runSync`)

## Resolution (2026-10-10)

Closed Wontfix — the premise is stale. A fresh `bun run plan:sync` (run in the
task-mgmt-integration worktree, current dev base) reports no orphan files and
no phantom entries; only advisories remain (placeholder hashes, orphan git
issues, foreign issues, unbound entries). The phantom backlog this ticket was
filed to prune no longer exists — resolved in the interim by `giwt sync --fix`
phantom relocation/import — so there is nothing to audit, drop, or gate. The
live tagging/binding scope continues in
`TASK-plan-index-tagging-binding-reconciliation`.


git issue: d398180

**Resolved:** 2026-10-10 registry-driven close: git issue d398180 (registry tip: da9aa30fb Konstantin Fedotov Closing Wontfix: premise stale. Fresh bun run plan:sync (task-mgmt-inte)
