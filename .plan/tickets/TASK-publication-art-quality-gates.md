<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Art Quality Gates + Character Consistency Check

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-comic-storyboard-panel-generation-workflow.md`, `TASK-illustrated-book-reference-pass.md`, `TASK-publication-continuity-lint.md`, `epic-assistant-creative-studio-workflows.md`, `epic-assistant-gm-flows.md`, `epic-comfyui-plugin.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

Extends the existing quality-gate mechanism from text-shaped checks to
image-shaped ones: a per-artifact character-consistency gate plus the schema and
duplicate checks a generated illustration or panel needs before it is offered
for acceptance.

## Context

The mechanism already exists and this ticket widens it rather than inventing a
parallel one. `ENTITY_QUALITY_GATES` is the closed set
`["schema", "consistency", "duplicate"]` (`src/config/sections/templates-workflow.ts:82`);
`EntityTypePreset.qualityGates` declares which subset a workflow runs, and
`validateEntityTypeConfig` (`src/config/templates-loader/validation-entity-types.ts:61-71`)
throws on any entry outside the set. The runtime consumer is
`src/assistant/quality/entity-creation-gates.ts`, invoked as `runQualityGates()`
from the `/create` path.

The gate vocabulary is closed by a validator, so adding an image-specific gate
name is a real change to that set and to its validator — it cannot be a
per-template free-form string. Two options, both acceptable:

1. reuse `consistency` with a publication-scoped implementation that compares a
   panel/illustration against the publication's accepted reference set; or
2. add a new member (e.g. `character-consistency`) to `ENTITY_QUALITY_GATES`
   and to the validator's allow-list.

Option 1 is the smaller diff and is preferred. Whichever is chosen, the prose
gates keep working unchanged for entity creation — this is additive.

What "consistency" means for art is concrete and cheap to check, and it should
not be a vision-model call on every panel. Available signals already in the
asset layer:

- `assets.width` / `assets.height` (`src/db/schema-content.ts:46-47`) — a
  dimension drift against the publication's declared aspect ratio is a real,
  zero-cost failure.
- `assets.alt_text` — the VLM captioning path is live
  (`src/generation/caption-route.ts`, wired to `ModelRole.Captioning`). A
  caption naming a different character than the reference set is the strongest
  available consistency signal and needs no new model.

Gate verdicts must be explainable: a rejected panel says *what* diverged, not
just "failed". A gate that returns an opaque boolean is unactionable at the
review surface.

Do not conflate this with `TASK-publication-continuity-lint.md`: that ticket
checks names, appearance descriptions, and timeline across *text* units. This
ticket checks *generated images*.

## Acceptance Criteria

- [ ] Character consistency is expressed through the existing gate mechanism
      (`ENTITY_QUALITY_GATES` + `EntityTypePreset.qualityGates` +
      `runQualityGates`), either by reusing `consistency` with a
      publication-scoped implementation or by extending the allow-listed set and
      the validator in lockstep
- [ ] Entity-creation gates keep their current behavior and their tests — the
      change is additive, and `src/assistant/quality/entity-creation.test.ts` (the
      suite covering `entity-creation-gates.ts`; there is no
      `entity-creation-gates.test.ts`) is untouched
- [ ] A consistency check runs against the publication's accepted reference set
      and returns a verdict carrying the reason (dimension drift, missing caption,
      caption names a different subject), not a bare boolean
- [ ] A schema gate validates a generated asset before acceptance: non-null
      `art_asset_id`, positive `width`/`height`, and an `assets` row that
      actually exists
- [ ] A duplicate gate detects a panel whose asset content hash already appears on
      another panel of the same publication, reusing the existing
      `assets.content_hash` dedup column (`src/db/schema-content.ts:55`) rather
      than hashing bytes again
- [ ] The gate runs on the dispatch path before an image is offered for
      acceptance, and a failing gate leaves the panel unaccepted with the reason
      surfaced
- [ ] Gate verdicts are returned to the review surface (book editor and comic
      authoring) so a user sees why an image was held back
- [ ] Unit tests cover: consistent panel passes; dimension drift fails with a
      named reason; a caption naming a different character fails; a duplicate
      content hash on a second panel fails
- [ ] No vision-model call is introduced as a blocking gate — captioning is
      optional and its absence degrades to a weaker verdict, not a hard failure