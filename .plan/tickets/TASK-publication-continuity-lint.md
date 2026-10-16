<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Publication Continuity + Cross-Unit Consistency Lint

**Status:** Not Started
**Priority:** low
**Effort:** Medium
**Epic:** epic-narrative-publishing-workflows
**Related:** `TASK-book-outline-generation-workflow.md`, `TASK-publication-art-quality-gates.md`, `TASK-publication-viewer-read-mode.md`, `epic-assistant-gm-flows.md`, `epic-assistant-creative-studio-workflows.md`
**Summary:** See ## Summary below.
**Context:** See ## Context below.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Summary

A deterministic lint across a publication's units — names, appearance
descriptions, and timeline — that reports where a chapter contradicts an earlier
one. It runs over the whole artifact on demand and inline while a unit is being
reviewed, so a contradiction is caught at the chapter that introduces it rather
than at export.

## Context

The repo already scores narrative text; this ticket reuses that rather than
writing a new evaluator. `src/story/quality-evaluator.ts` and the scorers under
`src/story/quality/scorers/` (`lore-consistency.ts`, `narrative-quality.ts`,
`plot-coherence.ts`, `character-voice.ts`) already evaluate generated prose
against world/actor state. The lint composes them for the publication case and
adds only the checks that are publication-shaped.

The three checks, all deterministic and cheap:

- **Names** — a character referred to in unit N under a spelling not seen in the
  accepted units before it, or a name that resolves to two different identities.
  Cross-reference the accepted character/actor records rather than a fuzzy match
  when the id is known.
- **Appearance** — the same character's described hair/eye/build changing between
  accepted units without a stated in-fiction change. Compare against the
  canonical character record (`characters` table, reachable through the actor
  table) where one exists; flag prose that contradicts the record.
- **Timeline** — in-fiction dates or durations that run backwards across unit
  order. The repo has a timescale model to compare against
  (`src/db/schema-story.ts` — `world_timescale` / `world_timescale_history`,
  migration `052_world_timescale.ts`); compare against it when the publication
  is bound to a world, and fall back to relative ordering when it is not.

Hard requirement: **the lint reports, it does not rewrite.** A generated book
that silently "fixes" a name is worse than one that reports it. Findings carry
unit id, position, the conflicting span, and the earlier unit it contradicts, so
the review surface can jump straight to both.

Findings are advisory. They block nothing, and in particular they must not block
export (`TASK-publication-export-formats.md`) — a book with a name typo is still
a book the user is entitled to export.

Keep this separate from `TASK-publication-art-quality-gates.md`: that ticket
checks generated **images**, this one checks generated **text**.

## Acceptance Criteria

- [ ] A `lintPublication()` entry point returns findings across a publication's
      accepted units in one pass, each finding carrying unit id, position, the
      conflicting span, and the earlier unit it contradicts
- [ ] Name check: a character named inconsistently across accepted units is
      reported, with both unit positions named
- [ ] Appearance check: prose contradicting the canonical character record is
      reported, with the record's value quoted alongside the prose
- [ ] Timeline check: in-fiction dates running backwards across unit order are
      reported; when the publication is bound to a world, in-fiction dates are
      compared against `world_timescale`, and when it is not, relative ordering
      is the fallback
- [ ] A stated in-fiction change (a character is injured, a dye job) suppresses
      the appearance finding for the units after it
- [ ] The lint never modifies stored text — proven by a test asserting the unit
      bodies are byte-identical after a lint run
- [ ] Findings are advisory: no export or acceptance path is blocked by a
      finding
- [ ] Results reuse `src/story/quality-evaluator.ts` /
      `src/story/quality/scorers/` where a scorer already covers the dimension,
      instead of duplicating an evaluation
- [ ] The lint is exposed to the review surface so a finding links to the
      offending unit and to the unit it conflicts with
- [ ] Unit tests cover a clean publication (zero findings), each of the three
      check types, and a world-bound timeline regression