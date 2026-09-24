<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: plan index — prune 297 pre-existing phantom entries

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small (giwt change + manual review)
**Summary:** Audit and drop the 297 phantom entries in `.plan/tickets/index.json` — entries where the index has `extid` + `git_issue` but the corresponding `.plan/tickets/*.md` (or `.plan/epics/*.md`) file does not exist with that exact extid. These phantoms predate `giwt sync --fix --import` adoption; the entries are uppercase-cased extids (`EPIC-2D-SPRITE-WORLD`) whose lowercase `.md` files (`epic-2d-sprite-world.md`) never made it into the index because the sync dropped them on a case-sensitive match.
**Context:** Every `giwt sync` (without `--fix`) reports 297 phantom entries. The `tickets` gate in `giwt plan validate` uses `giwt sync` exit code as its pass/fail signal, so the gate stays red until the phantoms are pruned. The phantoms are stale uppercase names; the real `.md` files exist with lowercase names. Sync `--fix` tries to relocate them via case-variant patterns but does NOT drop them when relocation fails. This ticket closes the gap.

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


git issue: d398180
