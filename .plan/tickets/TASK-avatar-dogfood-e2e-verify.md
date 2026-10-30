<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — E2E Verification

**Summary:** Fresh-DB dogfood verification: seed → verify promoted art.
**Context:** Closes epic-avatar-dogfood (verifies the full 7-step scenario).
**Acceptance Criteria:** (see below)

**Status:** Done
**Priority:** High
**Effort:** Small
**Epic:** epic-avatar-dogfood

## Summary

End-to-end dogfood check over the 7-step scenario: wipe DB + upload dir,
boot, run `seedCharacterTemplates`, and assert each promoted character's
primary avatar bytes equal the committed file under
`configs/assets/characters/<slug>/default/`, while unpromoted characters
still resolve the SVG placeholder. Runs against slice-1 PNG masters first;
re-run for slice-2 webp masters.

## Acceptance Criteria

- [x] Fresh DB + empty upload dir → boot → seed → promoted characters' primary avatar bytes byte-equal the committed default files (tests/e2e/flows/avatar-dogfood.test.ts — `wipe → seed → promoted bytes byte-equal the committed master`, both master formats: slice-2 webp default + slice-1 png, byte-equality via character_avatars+assets storage_path read-back)
- [x] Unpromoted templates still seed the deterministic SVG placeholder (same test — Detective Morgan leg: PLACEHOLDER byte-equality + `image/svg+xml` mime)
- [x] Reseed is insert-once safe: second seed run changes nothing (same test — second `seedCharacterTemplates` run: created=0, skipped=6, avatar ids stable)
- [x] Test documents the 7-step scenario outcome (fresh boot, chat, generation, promote, clean, restart, verify) as the epic's done evidence (avatar-dogfood.test.ts header comment maps each scenario step to where it is exercised: steps 2–4 unit-pinned by slice 1 + deterministic sharp stand-in + real promoteAvatarToDefault, steps 5–7 driven for real in the test)

## Linked Epics

- `epic-avatar-dogfood.md`


git issue: e5fc3f7

**Resolved:** 2026-10-30 registry-driven close: git issue e5fc3f7 (registry tip: ea1f78785 Konstantin Fedotov Close issue)
