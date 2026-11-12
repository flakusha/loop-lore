<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# Epic: Ren'Py Conversion Export

**Overview:** (see sections below)


**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** renpy, export, plugin, vn
**Related:** `epic-2d-sprite-world.md`, `epic-visual-novel-mode.md`, `epic-conversation-branching.md`, `epic-import-export-io.md`, `epic-game-asset-pipeline-export.md`

## Summary

A core plugin (`plugins/core/renpy-export/`, origin `core` → self-approves, no
admin enable needed) that exports author-selected chats into a Ren'Py project
skeleton, so the author keeps creating in loop-lore (characters, worlds,
locations, story play-out in VN/chat mode) and continues editing in Ren'Py —
application-side editing stays out of scope for loop-lore.

## Scenario

1. The author creates all related items in the application (characters, world,
   locations, etc.).
2. The author plays out in VN/chat mode to create the game story / logic /
   branching.
3. Selected chats are exported into Ren'Py; further editing happens in Ren'Py.

## Export shape

One ZIP per export request, laid out as a Ren'Py project overlay:

```text
README.md                  # create project in Ren'Py Launcher, drop game/ over it
game/script.rpy            # generated: label start:, labels, dialogue, menus
game/characters.rpy        # define <slug> = Character("Display", image="images/<slug>")
game/images/<slug>.png     # copied character avatars
```

`label start:` lists the exported chats (one label each); only the played
(active-branch) path is written out inline. Sibling branches become `menu:`
options that jump to stub labels carrying a TODO comment for the author to
finish in Ren'Py.

## Mapping decisions

- **Dialogue source:** the chat's played path = root→tip walk of the active
  branch (`chats.active_branch_id` → `chat_branches.parent_message_id` →
  `walkMessagePath`). Role/actor → Ren'Py speaker: assistant/character lines via
  `define`d vars, user lines as narration, system lines skipped.
- **Branching source:** `chat_branches` rows (DB-anchored `parent_message_id`
  fork points) → Ren'Py `menu:` blocks. Sibling branches sharing a fork point
  jump to stub labels. This reuses `getMessagesForBranch` semantics.
- **Characters:** `chat_participants` joined to `actors` for display names and
  `avatar_asset_id`; avatar bytes via `getAssetData` with `loadConfig()`'s
  `uploadDir`. Encrypted assets are skipped (no chat key at export time).
- **Explicitly OUT of v1:** `vn_choices` → menu mapping. `vn_choices`
  `scene_index` is a client-side message-array ordinal (FE `msgToScene` over
  the loaded list), not a message-anchored FK — no reliable DB reconstruction.
  The authoring-branch structure above already carries the played story and
  fork points; VN-choice export is a follow-up ticket once a DB anchor exists.
- **Route path:** `POST /api/v1/renpy-export` (versioned — the catch-all
  308-redirects unversioned `/api/*` to `/api/v1/*`, and plugin dispatch matches
  the versioned path; the unversioned dice-roller/card-battle pattern is
  unreachable). `requiresAuth` + `caller.userId` row-level ownership filter
  (`chats.created_by`, same as `batchExportChats`).
- **UI:** one button in the chat-list batch bar beside `batchExport`,
  reusing the `selectedChats` multi-select.

## Acceptance Criteria

- [ ] Exported ZIP opens as a Ren'Py project overlay with working start label
- [ ] Played path renders as dialogue with named character speakers
- [ ] Fork points render as menus with playable path + author stubs
- [ ] Only caller-owned chats are included; unowned chat ids are excluded
- [ ] UI button exports the current multi-select and downloads the ZIP
- [ ] Tests passing, docs updated

## Tickets

- `TASK-renpy-export-script-generator-pure-function` (e472ddb)
- `TASK-renpy-export-model-gather-from-db` (dc2e726)
- `TASK-renpy-export-core-plugin-route-versioned-path` (43f862e)
- `TASK-renpy-export-button-in-chat-list-batch-bar` (d2bbfa1)
