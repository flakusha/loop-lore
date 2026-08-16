<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Authoring & Creation

Builder-layer ideas. Inspiration: loop-lore's own creation pipelines.

## #15 Procedural asset pipelines

- **Inspiration**: roadmap creation pipelines
- **What**: Auto-generate maps / portraits / music / sfx from the existing item/NPC/
  location creation pipeline.
- **Fits**: `docs/spec/rpg-mechanics.md` pipelines (Description→Stats→Effects→Image→
  Placement); extend Image stage to music/audio.
- **Effort**: Med
- **Depends on**: image + audio generation providers

## #16 Plot autopilot

- **Inspiration**: roadmap quest-engine
- **What**: AI proposes next plot beats from `arc_plan`; player picks one.
- **Fits**: `quest-engine` already specced.
- **Effort**: Med
- **Depends on**: quest-engine

## #17 What-if branch simulator + diff/merge

- **Inspiration**: roadmap branching
- **What**: Fork world state, run alternate timelines, diff the resulting narratives;
  optionally merge a branch back.
- **Fits**: message tree (`docs/frontend/chat/messages.md`) + `WorldActorState`.
- **Effort**: High
- **Depends on**: conversation branching, world-state snapshots

## #18 Community template / lorebook share

- **Inspiration**: export.md
- **What**: Export worlds/templates/lorebooks; import community packs.
- **Fits**: `note-templates` export/import already specced
  (`docs/spec/rpg-mechanics.md` Notes Pipeline).
- **Effort**: Low
- **Depends on**: export/share infra
