<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — WebP Masters + Export Op

**Summary:** Lossless-webp storage masters for promoted defaults + png/jpg export.
**Context:** Slice 2 of epic-avatar-dogfood (builds on the slice-1 promote path).
**Acceptance Criteria:** (see below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Small
**Epic:** epic-avatar-dogfood

## Summary

Promoted default avatars become lossless-webp masters (sharp already encodes
webp via the thumbnail path — reuse `encodeThumbnail`-style sharp usage with
lossless settings at full size). Add an export op that renders a master to
png/jpg on demand (download / seeding fallback for readers without webp).
Slice 1's promote tooling gains a `--webp` (or default-on) conversion step;
the `file` hook already resolves webp via `mimeFromExtension`.

## Acceptance Criteria

- [ ] Promote path converts masters to lossless webp (planned-new: webp-master conversion in promote; sharp is thumbnail-only today)
- [ ] Export op renders a webp master to png/jpg bytes on demand (planned-new: avatar export op, format param `png | jpg`)
- [ ] `resolveTemplateAvatar` `file` hook serves webp masters through the existing `mimeFromExtension` mapping (already accepted — verify, don't rebuild)
- [ ] Tests: webp-master byte round-trip (lossless: decode equals source pixels) + png/jpg export smoke test

## Linked Epics

- `epic-avatar-dogfood.md`
