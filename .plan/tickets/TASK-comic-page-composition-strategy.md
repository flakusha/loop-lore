<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Comic Page Composition Strategy — per-panel compose, sequence, or one-shot

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-comic-page-panel-layout-model.md`, `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-publication-artifact-versioning.md`, `TASK-publication-viewer-read-mode.md`, `TASK-publication-artifact-schema.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Land the page-composition decision made in the epic: generation stays
per-panel; the presentation mode — a composed page (`composed`) or an
uncomposited sequence (`sequence`) — becomes a per-page choice carried on
`publication_units`, defaulting to `composed`. The work is one column, one
guard, and the storyboard plumbing that records which mode a page is in.

## Context

The decision and its reasoning live in the epic's
`### Page composition strategy (review 2026-10-16)` section in
`.plan/epics/epic-narrative-publishing-workflows.md`; this ticket is that
section's implementation boundary and does not reopen it. Read it first — it
is the decision record.

What the decision settles: three modes were on the table, (A) per-panel
images composed into one page, (B) per-panel images sequenced with no
compositing, and (C) one-shot page generation. Regeneration granularity
decided it — this epic's model is per-unit regenerate with pin/accept/reject
backed by the keep-or-discard revision row in
`TASK-publication-artifact-versioning.md`, which only per-panel generation
preserves. Generation is therefore per-panel (A/B), and `composed` vs
`sequence` is a presentation-layer choice. Mode C (one-shot whole-page
generation) is deferred and capability-gated, not rejected: it is recorded so
a later model-capability change can enable it without reopening the artifact
model. The mention of a high-context model ("nano banana") in the review is an
unverified external observation, not a measured property of anything in this
repo, and nothing in this ticket assumes such a model exists or is reachable.

The three pieces this ticket owns:

- **The column.** `presentation` on `publication_units`, typed
  `composed` | `sequence`, defaulting to `composed`. It lands in this ticket's
  own append-only migration (see the numbering note below), not in the
  sibling's file. The shape follows `TASK-publication-artifact-schema.md`'s
  stated precedent for a small enum-valued column on a publication table:
  plain `text NOT NULL DEFAULT 'composed'`, **no CHECK constraint** —
  `publication_status` is stored exactly that way (`worlds` and `locations` in
  `src/db/migrations/001_init.ts`), with validity enforced in application
  code. `PresentationMode` is a new vocabulary, not a fork of
  `PublicationStatus` (`src/db/enums-story/items.ts:45`) or `PinnedState`
  (`src/db/enums-core/flags.ts:8`).
- **The guard.** `layout_json` on `publication_panels` carries meaning only
  when the unit is `composed`. The layout resolver owns the geometry
  (`TASK-comic-page-panel-layout-model.md` owns `PanelLayout`, its serializer,
  and every write to `layout_json`); this ticket adds the refusal at its
  boundary so a `sequence` unit is never handed to the composer.
- **The plumbing.** The `comic-storyboard` dispatch from
  `TASK-comic-storyboard-panel-generation-workflow.md` writes one unit per
  page and must record the mode on it. Today that path has no notion of the
  choice at all; the default is `composed`, so current behavior is unchanged.

Migration numbering is a genuine ordering hazard, and it is settled here the
same way `TASK-publication-artifact-versioning.md` settled it for the same
table: ownership is unconditional and non-contradictory. **This ticket owns
`059_publication_unit_presentation.ts` unconditionally,** so the column never
rides `057_publication_artifacts.ts` — that file belongs to
`TASK-publication-artifact-schema.md`, `058_publication_unit_revisions.ts`
belongs to the versioning ticket, and the two tickets do not co-own one
migration file. `057` and `058` are reserved by the siblings; the number is
picked against the real `src/db/migrations/` HEAD at implementation time
(HEAD is `056_xp_ledger_dedupe_unique.ts` as of 2026-10-16, so `059` is the
slot), one `addColumn` per statement per `src/db/migrations/README.md`, and
the chain stays gapless `001..N`.

Owner authorization on every read and write of the column follows the
publication repository layer from `TASK-publication-artifact-schema.md`; no
new authorization path is introduced.

## Acceptance Criteria

- [ ] `presentation` is added to `publication_units` as `text NOT NULL DEFAULT 'composed'` by this ticket's own append-only migration `059_publication_unit_presentation.ts`, numbered against the real `src/db/migrations/` HEAD per ## Context — `057_publication_artifacts.ts`, owned by `TASK-publication-artifact-schema.md`, is not edited. No CHECK constraint is added — matching `worlds.publication_status` and `locations.publication_status` in `src/db/migrations/001_init.ts`
- [ ] The two values are named once: a `PresentationMode` (`"composed" | "sequence"`) alongside `PublicationStatus` (`src/db/enums-story/items.ts:45`) and `PinnedState` (`src/db/enums-core/flags.ts:8`); no second enum and no ad-hoc literal at a route boundary
- [ ] A `sequence` unit is never passed to the layout composer: the resolver entry point from `TASK-comic-page-panel-layout-model.md` refuses a unit whose `presentation` is `sequence` with a named error rather than reading its `layout_json` (unit test)
- [ ] A `sequence` unit's `layout_json` is never written and never read — the guard above is the single place that decides this, not a check repeated per caller
- [ ] The confirmed-storyboard dispatch from `TASK-comic-storyboard-panel-generation-workflow.md` records the mode on each unit it creates, defaulting to `composed` when the storyboard payload does not carry one, and a storyboard that specifies a mode per page is accepted rather than rejected — the choice is per-page by design
- [ ] Every read path that resolves panels through a unit propagates `presentation`, so the viewer and the editor agree on which mode a page is in; no caller re-derives the presentation mode from `publications.kind`
- [ ] Owner authorization enforced on every read and write of the column, reusing the publication repository layer's existing checks — no new authorization path
- [ ] `bun run db:sync-types && bun run db:sync-manifest` has been run and `bun run schemas:check` passes, so `src/db/schema.ts` and `src/db/schema-manifest.ts` carry the column
- [ ] `bun test src/db/migrations.test.ts src/db/migration-roundtrip.test.ts` passes — the same two suites the migration README names (`src/db/migrations/README.md:65`)
- [ ] `bun run md:lint` passes for the `.plan/**` and `docs/**` globs
- [ ] The epic section `### Page composition strategy (review 2026-10-16)` in `.plan/epics/epic-narrative-publishing-workflows.md` remains the decision record and is cited in this ticket's module header; if the decision changes, the epic section is edited first and this ticket follows it
- [ ] No new panel column, no second layout mode, and no change to `layout_json`'s schema — `TASK-comic-page-panel-layout-model.md` keeps sole ownership of that shape and its write path
- [ ] Mode C (one-shot page generation) is not implemented, not half-implemented, and not capability-probed by this ticket; it stays deferred and capability-gated as the epic section records


git issue: 6e938fe
