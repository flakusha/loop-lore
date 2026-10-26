<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — Promote to Defaults

**Summary:** Promote a generated avatar variant to a git-tracked default.
**Context:** Slice 1 of epic-avatar-dogfood (dogfood loop on PNG masters).
**Acceptance Criteria:** (see below)

**Status:** In Progress
**Status Note:** Slice-1 vertical landed as 2a960c696 — promoteAvatarToDefault op + tests; no avatar: lines flipped yet (blocked on real art from ticket a); restart-verify belongs to ticket (d).
**Priority:** High
**Effort:** Medium
**Epic:** epic-avatar-dogfood

## Summary

Operator tooling (CLI or admin op) that copies a chosen generated avatar
variant into `configs/assets/characters/<slug>/default/` and rewrites that
template's `avatar` in `src/config/sections/characters/defaults.ts` from
`{ type: "default" }` to `{ type: "file", path }`. After promote, a clean
restart seeds the promoted art through the existing `file` hook
(`resolveTemplateAvatar` + `linkTemplateAvatar`, insert-once). PNG masters
only — no webp in this slice.

## Acceptance Criteria

- [ ] Promote op copies the generated asset bytes to `configs/assets/characters/<slug>/default/` (planned-new: promote command/op)
- [ ] Promote op rewrites the template's `avatar` to `{ type: "file", path }` pointing at the committed file (planned-new: `defaults.ts` file wiring per template)
- [ ] Clean restart after promote seeds the promoted art as the character's primary avatar via the existing `file` hook; insert-once seeding leaves already-seeded actors untouched
- [ ] Promote is idempotent: re-promoting the same variant is a no-op; promoting a different variant replaces the file + wiring

## Linked Epics

- `epic-avatar-dogfood.md`


git issue: 9d91dd6
