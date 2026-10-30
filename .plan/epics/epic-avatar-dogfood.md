<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Avatar Dogfood Defaults

**Status:** Done
**Priority:** High
**Effort:** Medium
**Type:** Feature Epic
**Tags:** avatar, generation, seeding, assets, dogfood
**Overview:** (see sections below)

## Summary

Close the dogfood loop for default character avatars: fresh boot ships
placeholder avatars, the in-app assistant generates real character art through
the existing image pipeline, an operator promotes chosen generations to
git-tracked defaults, and a clean restart shows the promoted art via the
insert-once seeder. Storage masters move to lossless webp with png/jpg export.

## Motivation

Default characters (`CHARACTERS_DEFAULTS` in
`src/config/sections/characters/defaults.ts` — 6 templates: Elara
Nightwhisper, ARIA-7, Detective Morgan, Dr. Alexis Thorne, Yuki Tanaka,
Assistant) all ship `avatar: { type: "default" }`, which resolves to a
deterministic grey SVG placeholder (`src/characters/seed/avatar.ts` →
`resolveTemplateAvatar`). The `file` hook exists (`avatar: { type: "file",
path }` reads bytes off disk) and `configs/assets/characters/<slug>/default/`
holds inert PNGs, but nothing connects generation output to those defaults —
the app cannot yet produce its own face.

## Current State (verified 2026-10-23)

- `src/config/sections/characters/defaults.ts` — 6 templates, all
  `avatar: { type: "default" }`.
- `src/characters/seed/avatar.ts` — `resolveTemplateAvatar` handles
  `file` (disk read + `mimeFromExtension`) / `default` (SVG placeholder);
  `ensureSystemUser` satisfies the `assets.owner_id` FK for ownerless seeds.
- `src/characters/seed/templates.ts` — insert-once seeding
  (`findExistingActor` / `adoptExistingActor` / `stableTemplateId`);
  `linkTemplateAvatar` creates the primary "default"-label avatar.
- `/image` chat command → `POST /api/v1/generation/image` →
  `persistGeneratedImages` (`src/assets/service/persist-generated.ts`, PNG)
  — the persist path to reuse.
- `configs/assets/` — inert PNGs under `characters/<slug>/default/`;
  nothing references them.
- webp is accepted in storage (`mimeFromExtension`/`extensionForMime`,
  metadata + alpha detection) but sharp is thumbnail-only
  (`_thumb.webp` 256px via `src/assets/service/thumbnail.ts`).

## Dogfood Scenario (7 steps)

1. **Fresh boot** — empty DB, `seedCharacterTemplates` runs; all 6
   characters show the SVG placeholder.
2. **Assistant chat** — operator opens chat with a default character and
   asks the assistant for avatar art (e.g. "generate a portrait for Elara").
3. **Avatar generation** — assistant routes the prompt through the
   existing `/image` → `POST /api/v1/generation/image` →
   `persistGeneratedImages` path, bound to the actor as an avatar variant.
4. **Promote to git defaults** — operator picks a generated variant;
   tooling copies it to `configs/assets/characters/<slug>/default/` and
   rewrites that template's `avatar` to `{ type: "file", path }` in
   `defaults.ts`.
5. **Clean** — wipe DB + upload dir.
6. **Restart** — boot seeds from the promoted files via the `file` hook.
7. **Verify** — e2e check: each promoted character's primary avatar bytes
   equal the committed file.

## Slices

- **Slice 1 — dogfood loop on PNG masters.** Assistant→avatar generation
  wiring (ticket a) + promote-to-defaults tooling with
  `avatar: { type: "file" }` wiring (ticket b). No webp work; masters stay
  PNG, matching today's `persistGeneratedImages` output.
- **Slice 2 — webp masters + export.** Lossless-webp storage masters for
  promoted defaults + a png/jpg export op (ticket c). Builds on the promote
  path from slice 1; sharp already encodes webp (thumbnail path proves the
  dependency works).

## Work Items

- [x] Assistant→avatar generation wiring → `TASK-avatar-dogfood-assistant-generation` (landed as e57109ded on feat-avatar-dogfood)
- [x] Promote-to-defaults (generated asset → `configs/assets/characters/<slug>/` + `defaults.ts` file wiring) → `TASK-avatar-dogfood-promote-defaults` (landed as dev 946df0525; issue 9d91dd6 kept open pending the real-art flip of a template's `avatar:` line in defaults.ts — the op emits the paste literal, no real art exists yet. Note: that ticket's Status Note cites stale hash 2a960c696; 946df0525 is the landed commit)
- [x] Webp lossless masters + png/jpg export op → `TASK-avatar-dogfood-webp-export` (landed as 50703ddfc on feat-avatar-dogfood)
- [x] E2E dogfood verification (fresh DB → seed → verify) → `TASK-avatar-dogfood-e2e-verify` (landed as 9a1ac9387 on feat-avatar-dogfood)

## Non-Goals

- Prompt-editing UX for avatar descriptors; generation reuses the current
  `/image` prompt surface as-is.
- Cost budgeting / rate policy beyond existing generation limits.
- Emotion/wardrobe avatar variants — default primary avatar only.

## Acceptance Criteria

- [x] Fresh boot shows placeholders; after generation + promote + clean + restart, promoted characters show the promoted art (ticket d verifies) — pinned by `tests/e2e/flows/avatar-dogfood.test.ts` (slice 3, 9a1ac9387): fresh `:memory:` DB + empty upload dir → production `seedCharacterTemplates` → promoted primary avatar bytes byte-equal the master file (webp + png legs), unpromoted templates seed the SVG placeholder, reseed insert-once. Generation→variant binding pinned by slice 1 (e57109ded: `image-gen-route.test.ts`, `generated.test.ts`, `/avatar` command tests); promote pinned by dev 946df0525 + slice 2 (50703ddfc: `promote.test.ts`)
- [x] Slice 1 ships without touching webp/thumbnail paths — e57109ded touched no `thumbnail.ts`/webp code; webp arrived only in slice 2
- [x] Slice 2 stores promoted masters as lossless webp and exports png/jpg on demand — 50703ddfc: `promoteAvatarToDefault` defaults to `webp({lossless:true})` (pixel-exact round-trip pinned), `exportAvatarMaster({bytes, format: "png"|"jpg"})` in `master-export.test.ts`

## Related

- `epic-avatar-regeneration-control.md` — re-roll machinery this epic's
  generation step reuses (`single-generation.ts` persist path)
- `epic-wardrobe-avatar-variants.md` — outfit-scoped variants, out of scope here
- `epic-emotion-avatar-message-binding.md` — consumes avatar bindings
- `epic-asset-transform-metadata.md` — crop metadata for promoted art


git issue: 1ee81d2
