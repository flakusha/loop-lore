<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — E2E Verification

**Summary:** Fresh-DB dogfood verification: seed → verify promoted art.
**Context:** Closes epic-avatar-dogfood (verifies the full 7-step scenario).
**Acceptance Criteria:** (see below)

**Status:** Not Started
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

- [ ] Fresh DB + empty upload dir → boot → seed → promoted characters' primary avatar bytes byte-equal the committed default files (planned-new: e2e dogfood test harness)
- [ ] Unpromoted templates still seed the deterministic SVG placeholder
- [ ] Reseed is insert-once safe: second seed run changes nothing (existing `findExistingActor` / `adoptExistingActor` behavior asserted)
- [ ] Test documents the 7-step scenario outcome (fresh boot, chat, generation, promote, clean, restart, verify) as the epic's done evidence

## Linked Epics

- `epic-avatar-dogfood.md`
