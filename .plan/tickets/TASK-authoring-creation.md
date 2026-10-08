<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: EPIC: Authoring & Creation Tools

**Summary:** Builder-layer authoring tools: procedural asset pipeline glue, plot autopilot, what-if branch simulator, and community template share (verify-only).
**Context:** Builder-layer tools from `docs/ideas/authoring-creation.md` ideas #15–#18. Four subtasks: three new modules (asset pipeline glue, plot autopilot, what-if simulator) plus one verify-only item (community template share, already Done under `epic-import-export-io.md`).
**Acceptance Criteria:** `src/generation/asset-pipeline.ts` (extends the auto-gen cascade to audio via `src/generation/audio-prompt-templates.ts`), `src/story/plot-autopilot.ts` (beat proposals from `src/story/quest-engine/` + `src/story/timeline/world-timeline.ts`, player picks), and `src/story/whatif-simulator.ts` (world-state fork + narrative diff) each exist, add no new generation backends or deps, wire into the `src/generation/index.ts` / `src/story/index.ts` barrels, and carry unit tests at >=80% line coverage; `FEAT-community-template-world-share-export-import.md` verified Done under `epic-import-export-io.md`; documentation updated if user-visible behavior changed.

**Status:** Done
**Status Note:** Done — all three modules landed on dev (`27d186c20` + `bb85b81ef`, closed by `1ba8de1b`): `src/generation/asset-pipeline.ts`, `src/story/plot-autopilot.ts`, `src/story/whatif-simulator.ts`, unit tests, barrel wiring. Community template share is verify-only Done under `epic-import-export-io.md`. Known open gap tracked separately: actor lorebook export missing → `BUG-community-share-missing-lorebook-export.md` (git issue `1485a72`, still open).
**Priority:** Medium
**Effort:** Large
**Epic:** epic-authoring-creation

## Summary

Builder-layer authoring tools: procedural asset pipeline glue, plot autopilot,
what-if branch simulator, and community template share (verify-only).

## Linked Epics

- `epic-authoring-creation.md`

## Context

Builder-layer tools from `docs/ideas/authoring-creation.md` ideas #15–#18. Four
subtasks: three new modules (asset pipeline glue, plot autopilot, what-if
simulator) plus one verify-only item (community template share, already Done under
`epic-import-export-io.md`).

## Acceptance Criteria

### Procedural asset pipeline glue

- [x] `src/generation/asset-pipeline.ts` exists and extends auto-gen cascade
      output to audio via the existing prompt builders in
      `src/generation/audio-prompt-templates.ts`.
- [x] Image-engine providers are reused; no new generation backends added.
- [x] Exports wired into the `src/generation/index.ts` barrel.
- [x] Unit tests pass with ≥80% line coverage for the new module; no new deps.

### Plot autopilot

- [x] `src/story/plot-autopilot.ts` exists and proposes next plot beats from
      active quests in `src/story/quest-engine/` plus
      `src/story/timeline/world-timeline.ts` history.
- [x] Player picks from proposed beats; no beat auto-commits without player choice.
- [x] Exports wired into the `src/story/index.ts` barrel.
- [x] Unit tests pass with ≥80% line coverage for the new module; no new deps.

### What-if branch simulator

- [x] `src/story/whatif-simulator.ts` exists and forks world state via
      `src/story/world-state/` snapshot plus timeline `world_timelines` rows, and
      diff narratives between the fork and the live branch.
- [x] Exports wired into the `src/story/index.ts` barrel.
- [x] Unit tests pass with ≥80% line coverage for the new module; no new deps.

### Community template share (verify-only)

- [x] `FEAT-community-template-world-share-export-import.md` verified Done under
      `epic-import-export-io.md`; this epic only links it, no new code.

### General

- [x] Documentation updated if user-visible behavior changed.
