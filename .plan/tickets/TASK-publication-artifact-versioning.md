<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Artifact Versioning + Keep-or-Discard Regeneration

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-publication-artifact-schema.md`, `TASK-book-unit-editor-review-surface.md`, `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-publication-continuity-lint.md`, `TASK-markdown-canonical-intermediate-contract.md`, `epic-assistant-creative-studio-workflows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Regeneration produces a candidate; this ticket is the keep-or-discard decision.
A revision row per regenerated unit, a diff/compare view, and the restore path —
so an accepted chapter can never be lost to a regeneration the user did not
like.

## Context

Regeneration is per unit (the review surface from
`TASK-book-unit-editor-review-surface.md` re-enters the workflow for one unit id;
the comic equivalent re-renders one panel). The failure mode that must not
exist: a regeneration silently overwriting the accepted text, with no way back.
So the flow is write-then-offer, never overwrite-in-place.

Storage is a revision row per regenerated unit, not a copy of the artifact. A
publication of forty chapters with three regenerated chapters has three
revisions, not forty snapshots of everything. Shape:

```
publication_unit_revisions
  id, unit_id, previous_body?, previous_state, created_at, superseded_by?
```

A live revision means "a newer body exists that the user has not yet accepted".
The unit row keeps the accepted body until the revision is kept; keep writes the
revision body onto the unit and supersedes the revision, discard deletes it and
leaves the unit untouched. Either way the unit's `position` never changes.

Pinned units are excluded from regeneration sweeps
(`TASK-book-unit-editor-review-surface.md`), and a pinned unit with a live
revision is a contradiction the API must reject rather than silently resolve.

The repo has optimistic-locking machinery for concurrent row updates
(`src/db/optimistic-locking.ts`), but it is **not** reusable as-is for
publication units. `applyOptimisticUpdate` hardcodes the column name
`format_version` in both its SET clause (`:91`) and its WHERE clause (`:103`), and
`getCurrentVersion` selects `format_version` (`:157-159`). `publication_units` has
no version column: the schema ticket's DDL defines `data_version` on
`publications` and no version column at all on `publication_units` (the epic's
illustrative shape uses `data_version` too). So there is a real choice, and this
ticket owns it:

1. **Preferred** — add a `format_version` column to `publication_units` in the
   migration below and call `updateWithVersionCheck` unchanged. Smallest diff and
   the helper stays the single optimistic-locking implementation in the repo.
2. **Otherwise** — widen `applyOptimisticUpdate` / `getCurrentVersion` to take the
   version column name as a parameter, and update every existing caller.

Either way two tabs regenerating the same unit must not interleave a lost write,
and the choice is settled by the test in the acceptance criteria.

Full branching (fork an artifact, merge two forks, diff-and-choose per chapter)
is **explicitly out of scope**. Keep-or-discard for one unit is the v1 contract;
branching is a much larger feature and naming this ticket "versioning" does not
oblige it. If branching is wanted, it needs its own ticket.

## Acceptance Criteria

- [ ] `publication_unit_revisions` is added by a forward migration (append-only
      per `src/db/migrations/README.md`). Ownership is unconditional and
      non-contradictory: **this ticket owns `058_publication_unit_revisions.ts`
      (and, if needed, a `format_version` column on `publication_units`),
      unconditionally.** If `057_publication_artifacts.ts` from
      `TASK-publication-artifact-schema.md` has already shipped, this is a separate
      `058_*` migration and the schema ticket is not edited; if it has **not**
      shipped, this ticket's revision table is still its own `058_*` file — the two
      tickets do not co-own one migration file. Either ordering is acceptable, the
      shared file is not. Columns:
      `id, unit_id, previous_body, previous_state, created_at, superseded_by`
- [ ] Regenerating a unit writes a revision and leaves the unit's current body
      and state untouched until the user decides
- [ ] Keep writes the revision body onto the unit, marks the revision superseded,
      and changes no sibling unit (route test)
- [ ] Discard deletes the live revision and leaves the unit byte-identical to its
      pre-regeneration state (route test asserts equality, not just length)
- [ ] A pinned unit rejects regeneration outright, and a pinned unit with a live
      revision is rejected at the API boundary with a named reason
- [ ] Concurrent edits to one unit go through the repo's optimistic-locking mechanism in `src/db/optimistic-locking.ts`, so two tabs cannot interleave a lost write; covered by a test. The mechanism requires a `format_version` column on `publication_units` (see ## Context) — if option 2 is taken, the helper is widened once and every pre-existing caller still passes its tests
- [ ] The review surface shows a compare view of accepted vs candidate body for a
      unit with a live revision, and keep/discard are available from it
- [ ] Revisions do not change unit `position` under any path (test)
- [ ] Owner authorization enforced on every revision read, write, keep, and
      discard
- [ ] Out of scope, stated explicitly in the code header of the revision module:
      artifact-level branching, merging two forks, and multi-unit diff selection