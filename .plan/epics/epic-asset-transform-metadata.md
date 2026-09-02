<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Asset Transform Editing + Metadata

**Status:** 🔴 Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** assets, avatar, crop, centering, metadata, editor

## Summary

In-browser editing of avatars and other image assets — primarily **centering /
crop / zoom** so a generated image sits correctly inside its render frame
(avatar circle, message-bubble portrait, card, gallery tile) — with the edit
stored as **asset metadata**, not baked pixels, so one source image serves many
contexts.

## Motivation

text2img output framing is unreliable: heads clip at the circle edge, subjects
sit off-center. Current pipeline serves the raw asset everywhere, so a bad crop
ruins every placement at once. Generated-image *semantics* (what is depicted)
stay correct while *presentation* (framing) needs human correction — cheap to
fix with a crop rect, expensive to re-roll.

Metadata-first (store rect/zoom/rotation, apply at render) means:
- per-context framing: avatar-circle centering ≠ gallery crop, same asset
- lossless: original bytes untouched; user can re-adjust forever
- re-roll-safe: new generation can auto-inherit the previous crop as starting
  guess

## Current State

- `src/assets/` service: `create/read/links/detect/validate` +
  `metadata.ts` — extraction on **upload** (dimensions/type), immutable after.
- DB: `assets`, `asset_links` (`src/db/migrations/parts/002_assets.ts`) —
  polymorphic linking; **no transform/crop storage**.
- Frontend: static `object-fit`/CSS per component; no editor UI; no per-context
  framing.

## Architecture

- **Schema:** new `asset_transforms` table —
  `(asset_id, context, crop_x, crop_y, crop_w, crop_h, zoom, rotation,
  focal_point_x, focal_point_y, updated_at)` with `context` enum:
  `default | avatar_circle | chat_bubble | card | gallery | sprite`
  (nullable context = base transform; context rows override it). Context, not
  free-form: render sites resolve `(asset, context) → transform`.
- **Auto-center seed:** on upload, compute a focal point (cheap heuristic or
  existing aux-pipeline) → base transform defaults to centered-on-focal crop;
  user edits override.
- **API:** `PUT /assets/:id/transforms/:context` (idempotent upsert, validated),
  `GET /assets/:id/transforms`, delete-to-reset. Ownership check via
  `asset_links` — never accept blind asset ids (IDOR class already ticketed for
  avatars: `fix-character-avatar-idor`).
- **Render:** frontend resolves transform → CSS `object-position`/`transform`
  (no server crop on hot path); optional **export/bake** endpoint
  (`POST /assets/:id/derive`) producing a cropped asset for consumers that need
  real pixels (downloads, VN sprites).
- **Editor UI:** shared Alpine cropper component (drag rect, zoom, before/after
  preview per context); mounted on avatar grid (emotion slots), character
  portrait, gallery, attachment pickers.

## Work Items

- [ ] Migration: `asset_transforms` + `TransformContext` enum; regen generated
      schema artifacts (`db:sync-types`, `db:sync-manifest`)
- [ ] Service: upsert/read/derived-default transform; focal-point auto-seed on
      upload
- [ ] Routes + validation schemas + ownership authz
- [ ] Cropper component (Alpine) + integration points: emotion avatar grid,
      character/portrait, gallery tile, message-bubble avatar
- [ ] Render path: `resolveTransform(assetId, context)` used by chat message
      loop + cards (falls back to CSS default when no row)
- [ ] Bake endpoint `POST /assets/:id/derive` (server-side crop via Bun.image)
- [ ] Re-roll inheritance: regeneration (see
      `epic-avatar-regeneration-control.md`) copies previous transform to the
      new asset when prompt/emotion unchanged
- [ ] Tests: upsert idempotency, context-override precedence, authz on foreign
      asset, derive output dimensions, frontend resolve unit tests

## Non-Goals

- Full image editor (brush, filters, inpaint) — framing transforms only.
- Editing provider-side generation params (that is the edit-model ticket,
  `TASK-emotions-avatar-edit-model`).

## Acceptance Criteria

- A mis-centered generated avatar is fixed in-browser in one interaction and
  renders correctly in circle **and** bubble **and** card simultaneously
- Original asset bytes unchanged; reset restores raw render
- Transforms survive regeneration of the slot (inherited as starting guess)
- No unowned/foreign asset can be mutated (authz test green)

## Related

- `epic-emotion-avatar-message-binding.md` — message loop is the main render
  consumer
- `epic-avatar-regeneration-control.md` — re-roll ↔ transform inheritance
- `epic-avatar-alpha-vn-layering.md` — sprite bake output feeds VN layering;
  alpha assets share the transform store
- `epic-inventory-ui.md` / `epic-assets*` where card/gallery frames consume
  transforms
- `epic-asset-platform-capabilities.md` — B5 generalizes this epic's transform
  rows into deterministic ops lists; B1 renditions host the bake/derive output
