<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: plan index — bidirectional tagging/binding + reconciliation reporting

**Status:** In Progress
**Priority:** medium
**Effort:** Medium (giwt change; touch sync-index + new tag CLI)
**Epic:** epic-task-management-integration
**Tags:** planning, giwt, tooling, index, tags, bindings, /find-work, admin-ui
**Related:** TASK-MANAGEMENT-INTEGRATION, TASK-plan-index-orphan-phantom-cleanup, EPIC-TASK-MANAGEMENT-INTEGRATION, EPIC-UNIFIED-SPEC-FRAMEWORK
**Summary:** Extend giwt's plan/ticket index to support a first-class tag and binding model where:
- editing the **frontmatter tags** in a `.plan/tickets/*.md` (or `.plan/epics/*.md`) updates the `tags` field in `.plan/tickets/index.json`,
- adding a binding (e.g. "this ticket belongs to epic X") in the frontmatter writes back to the index,
- the index reconciles orphan tags and orphan bindings on every `giwt sync`,
- a reporting command (repo-side `plan:*` script under `scripts/plan/` — giwt is a pinned external dependency, so not a new giwt subcommand) reports tickets-by-tag, tickets-by-epic, tickets-by-binding, tickets-with-orphan-tags (tags not declared anywhere), tickets-with-orphan-bindings.
**Context:** Today tags exist on tickets (free-text comma lists in the `Tags` header field) but are **not** propagated to the index. Bindings (`Epic` / `Related` header fields) live only in the `.md` frontmatter — the index doesn't know which tickets belong to which epic beyond `epic: "epic-foo"` (and only some tickets have that field). Future features (`/find-work`, admin panel filtering, agent routing by tag) need a queryable, parseable source of truth. giwt's ticket parser reads each header field as the FIRST bold-colon match inside the first 30 lines of the file (sync-parse.ts), so prose that re-spells a field verbatim — or a metadata block that drifts past line 30 — silently mis-parses: this entry's index tags were once prose fragments scraped from an inline field mention in this very paragraph. The header above is regrouped to keep the real fields inside the window and free of inline re-spellings.

This ticket is filed here per the 2026-09-24 user directive: "consider either filing to @../giwt to support tagging and binding (and reporting on it) from epics and from index". The companion orphan/phantom cleanup ticket is resolved (the phantom condition it targeted no longer exists on current dev), so this ticket carries the remaining tagging/binding/reporting scope.

**Acceptance Criteria:**
- [ ] `giwt sync` writes back `tags` array on every index entry from the `.md` `**Tags:**` line. Frontmatter wins; index loses its in-memory array (becomes derived).
- [ ] `giwt sync` writes back `epic` and `related` arrays on every ticket index entry. Multi-binding supported (a ticket can list multiple `**Related:**` lines).
- [x] `plan:report tags <tag>` lists every ticket whose `Tags` header field contains the tag (case-insensitive, comma-separated match). Output is one line per ticket: `EXT-ID  status  source-path`. Repo-side as `bun run plan:report tags <tag>`.
- [x] `plan:report epic <epic-id>` lists every ticket whose `Epic` header field lists that epic. Same format. Repo-side as `bun run plan:report epic <epic-id>`.
- [x] `plan:report orphans` lists (a) tickets with tag values that no other ticket or epic declares, (b) tickets whose `Epic` references a missing epic file, (c) tickets whose `Related` references a missing ticket file. Three sections, each with the offending ticket + the orphan value.
- [x] `plan:report` (no args) prints the aggregate summary: total tickets, total tags, total bindings, top-N tags by frequency, top-N epics by ticket count.
- [ ] The tag/binding model is round-trippable: editing `**Tags:**` and running `giwt sync` updates the index; editing the index directly and running `giwt sync` rejects the change with a clear "frontmatter is source of truth" message.
- [ ] Unit tests cover the round-trip, the report outputs, the orphan detection, and the index-edit rejection.
- [ ] The `tickets` gate in `giwt plan validate` reuses the new orphan detection to report orphan tags + orphan bindings alongside the remaining index reconciliation findings (so the gate gives operators a complete picture).
- [ ] `bun run check` green on giwt.

**Status note (2026-10-10 — repo-side delivery):** The md→index round-trip and the
reporting command ship in-repo under `scripts/plan/`; giwt stays a pinned external
dependency.

Shipped (this repo):
- Frontmatter-wins projection in `normalize-plan-metadata.ts` — backfills empty tag
  arrays and repairs divergent ones (including the prose-fragment corruption this
  entry once carried; regression-tested). The md→index direction is fully covered
  by scripts/plan + post-merge regeneration; no giwt change is needed for it.
- `bun run plan:report` (`scripts/plan/report-plan-metadata.ts`) — `tags <tag>`,
  `epic <epic-id>`, `orphans` (a/b/c sections), aggregate; reuses the shared
  parser (tagsOf/epicOf/relatedRefs, splitEpicCandidates); placeholder tag tokens
  (`(none)` etc.) treated as "no tags" throughout.

Post-merge regeneration chain (run on dev after finalize — giwt's own finalize
regeneration repairs hashes/sources only and never re-reads .md fields, so this
chain is what makes tags/epic reconcile):

    bun run plan:metadata && bun run plan:matrix && bun run plan:sync && \
    bun run plan:docs && bun run plan:map && bun run plan:validate

Still open (giwt-side, needs an upstream giwt change):
- `giwt sync` re-reading `tags`/`epic`/`related` fields for entries already in the
  index on every sync (AC 1 and 2 as originally written; today only orphan
  adoption reads them).
- Index-edit rejection with a "frontmatter is source of truth" message (AC 7
  second half; AC 8's tests for it).
- The `tickets` gate reusing orphan-tag/orphan-binding detection (final AC).
- `bun run check` green on giwt itself (final AC).

**PoC decomposition (task-management, 2026-10-10):** this ticket's repo-side work
was decomposed via the `task-management` skill and driven through its real CLI
(`scripts/task-cli.ts` under bun; `.tmp/tasks/` is ephemeral — quoted here as the
durable proof).

```
[plan-index-reporting] Plan index reporting (ticket 2 repo-side)
  Status: active | Progress: 100% (4/4)
  Pending: 0 | In Progress: 0 | Completed: 4 | Blocked: 0
=== Validation Results ===
[plan-index-reporting]
  ✓ All checks passed
```

Subtasks: 01 report-plan-metadata.ts (tags/epic/orphans/aggregate, shared
parser) → 02 fixture tests → 03 plan:report wiring + placeholder-tag filtering →
04 ticket-md shipped/open split + post-merge chain (deps: 01→02→03→04;
`context_files` pointed at this ticket, `scripts/plan/normalize-plan-metadata.ts`,
`scripts/plan/README.md`).


git issue: 158caaa
