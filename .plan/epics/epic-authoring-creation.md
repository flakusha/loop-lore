<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Authoring & Creation Tools

**Effort:** Medium
**Type:** epic
**Tags:** authoring, creation, procedural-assets, plot-autopilot, what-if, community-share, builder-tools
**Overview:** (see sections below)

**Status:** Done
**Status Note:** Done — three modules landed (plot-autopilot, whatif-simulator, asset-pipeline, all with unit tests); community template share is verify-only Done under `epic-import-export-io.md`. Audit surfaced one real gap (actor lorebook export missing → `BUG-community-share-missing-lorebook-export.md`, git issue 1485a72, still open); worlds/templates/characters/world-lore/chats/locations/story/assets all verified covered.
**Priority:** Medium
**Plan.md:** §47
**Issue:** `EPIC-047`

## Summary

Builder-layer tools: procedural asset generation, plot autopilot, what-if branching,
community template sharing.

## Tasks

| Task                                              | Files                              | Effort | Source    |
| ------------------------------------------------- | ---------------------------------- | ------ | --------- |
| Procedural asset pipeline glue                    | `src/generation/asset-pipeline.ts` | Med    | ideas #15 |
| Plot autopilot (AI proposes next beats)           | `src/story/plot-autopilot.ts`      | Med    | ideas #16 |
| What-if branch simulator + diff/merge             | `src/story/whatif-simulator.ts`    | High   | ideas #17 |
| Community template / lorebook share (verify-only) | —                                  | Low    | ideas #18 |

### Task Detail

#### Procedural asset pipeline glue

- New module `src/generation/asset-pipeline.ts`.
- Extends the auto-gen cascade output to audio by reusing the prompt builders in
  `src/generation/audio-prompt-templates.ts`.
- Reuses the existing image-engine providers rather than introducing new
  generation backends; the module is glue + orchestration only.
- Exports wired into the `src/generation/index.ts` barrel.

#### Plot autopilot

- New module `src/story/plot-autopilot.ts`.
- AI proposes next plot beats derived from active quests in `src/story/quest-engine/`
  plus accumulated history in `src/story/timeline/world-timeline.ts`.
- Player picks from the proposed beats; nothing is auto-committed to the narrative
  without an explicit player choice.

#### What-if branch simulator

- New module `src/story/whatif-simulator.ts`.
- Forks world state via a snapshot from `src/story/world-state/` and timeline
  `world_timelines` rows, then diffs the resulting narrative against the live branch.
- Reuses `world_timelines` branching so a what-if fork behaves like an ordinary
  timeline fork downstream.

#### Community template share (verify-only)

- No new code in this epic.
- `FEAT-community-template-world-share-export-import.md` is Done under
  `epic-import-export-io.md`; this epic only links it and records how community
  template/world share fits the builder layer.

## Reconciled Tickets

The following duplicate stubs in `.plan/tickets/` were closed as duplicates into
this epic (they exist as stubs marked Done, each with a "Duplicate of existing plan
artifact(s)" resolution pointing here):

- `FEAT-plot-autopilot-ai-proposes-next-plot-beats.md`
- `FEAT-what-if-branch-simulator-fork-world-state-diff-narratives.md`
- `FEAT-procedural-asset-pipelines-maps-portraits-music-sfx.md`
- `FEAT-community-template-world-share-export-import.md` (verify-only in this epic;
  the implementation lives in `epic-import-export-io.md`)

## Ideas Merged

- `docs/ideas/authoring-creation.md` — ideas #15 (procedural assets), #16 (plot autopilot), #17 (what-if simulator), #18 (community share)

## Related Epics

- `epic-conversation-branching.md` — conversation fork machinery underpins the what-if simulator
- `epic-import-export-io.md` — import/export infra behind community template share
- `epic-entity-generation-workflows.md` — generation workflows feeding procedural assets
- `epic-assistant-creative-studio-workflows.md` — assistant tooling adjacent to authoring flows
- `epic-actor-autonomy-story-drive.md` — story-drive actors interact with plot autopilot
- `epic-audio-video-sound.md` — audio generation provider coverage for procedural assets
- `epic-auth-access.md` — ownership indicator ticket `TASK-authoring-creation.md` also lives there; the file split reflects that access-control angle, while narrative/domain work belongs to this epic

## Dependencies

- Image + audio generation providers for procedural assets
- Quest engine for plot autopilot
- Conversation branching for what-if simulator
- Export/share infra for community templates

## Linked Tasks

- `TASK-authoring-creation.md` — implementation tasks
- `BUG-community-share-missing-lorebook-export.md` — new gap from the community-share audit (actor lorebook export missing, import-only), implementation not in this branch
- `FEAT-plot-autopilot-ai-proposes-next-plot-beats.md` — duplicate stub (closed)
- `FEAT-what-if-branch-simulator-fork-world-state-diff-narratives.md` — duplicate stub (closed)
- `FEAT-procedural-asset-pipelines-maps-portraits-music-sfx.md` — duplicate stub (closed)
- `FEAT-community-template-world-share-export-import.md` — duplicate stub (closed)
