<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Avatar Dogfood — WebP Masters + Export Op

**Summary:** Lossless-webp storage masters for promoted defaults + png/jpg export.
**Context:** Slice 2 of epic-avatar-dogfood (builds on the slice-1 promote path).
**Acceptance Criteria:** (see below)

**Status:** Done
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

- [x] Promote path converts masters to lossless webp — `promoteAvatarToDefault` (src/characters/seed/promote.ts) now defaults to a lossless-webp master (sharp, full size, `webp({ lossless: true })`); PNG input stays the promote contract, `master: "png"` preserves the slice-1 byte-for-byte cell. Pinned by `promote.test.ts` "converts to a lossless webp master by default" (raw-pixel round-trip) and "master: 'png' keeps the slice-1…".
- [x] Export op renders a webp master to png/jpg bytes on demand — new `exportAvatarMaster({ bytes, format: "png" | "jpg" })` (src/characters/seed/master-export.ts), webp-only input contract. Pinned by `master-export.test.ts` (pixel-exact png export, jpg smoke, non-webp refusal).
- [x] `resolveTemplateAvatar` `file` hook serves webp masters through the existing `mimeFromExtension` mapping — verified, not rebuilt: `promote.test.ts` "seed file hook reads back promoted webp and png masters with the right mime" asserts `image/webp` / `image/png`.
- [x] Tests: webp-master byte round-trip (lossless: decode equals source pixels, alpha-normalized because sharp omits an opaque alpha on webp decode) + png/jpg export smoke test — see the suites above (8 pass).

## Linked Epics

- `epic-avatar-dogfood.md`


git issue: b1b252a

**Resolved:** 2026-10-30 registry-driven close: git issue b1b252a (registry tip: fbf720843 Konstantin Fedotov Close issue)
