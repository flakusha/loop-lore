<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Avatar Alpha Channel + VN Layering

**Overview:** (see sections below)


**Status:** In Progress
**Status Note:** matting pipeline + alpha status machine + VN sprite stage shipped; provider transparency capability and alpha-aware chat styling pending
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** avatar, alpha, transparency, background-removal, visual-novel

## Summary

Make character avatars/emotion sprites **cut-out friendly**: true RGBA output
when the provider supports it, background removal as fallback, and a render
path that composites the character **on top of** VN backgrounds instead of
inside an opaque box.

## Motivation

Generated character images arrive opaque-rectangular. VN-mode presentation
(layered: background → character sprite → dialogue box) needs silhouettes with
alpha; today the character can only be a rectangle floating over the scene.
This also improves small placements (bubble avatar over textured chat
background).

## Current State (verified 2026-10-09)

- Matting fallback **shipped**: `src/generation/matting/` (pluggable backend via
  generation config) auto-enqueues opaque generated sprites
  (`enqueueAutoMatting`), keeps raw + matted as asset→asset derivative links,
  and is re-runnable; job routes serve status and re-run (`src/assets/matting-routes.ts`).
- Alpha tracking **shipped**: `assets.alpha_status` state machine
  (`unknown → raw → matting_pending → matted | matting_failed`; `native` for
  header-detected alpha — PNG tRNS, WebP ALPH/VP8L, GIF transparency in
  `src/assets/alpha-detect.ts`); deleting a matted derivative reverts the source
  to `raw`.
- VN sprite stage **shipped**: `src/frontend/alpine/vn/` (sprite-stage,
  sprite-anchor, scene-renderer) composites character over background;
  `TransformContext.Sprite` rows (anchor/scale) persist via the frontend asset
  anchor; serve paths resolve the matted derivative for sprite-stage consumers.
- Provider transparency **not started**: no `transparency` capability on image
  providers; generation still requests opaque rectangles only.

## Architecture

- **Provider capability first:** extend image-provider capability registry with
  `transparency: boolean` (Ark/gpt-image-class models accept transparent-background
  requests); request alpha when the selected model supports it, format `png`
  (webp later — check `Bun.image` encode support).
- **Fallback matting:** when provider returns opaque → post-process job in
  aux-pipeline: background-removal step (local rembg-class model or provider
  endpoint) producing alpha; **async** (job status), never inline in generate
  request; store both raw + matted as linked assets (`asset_links` self-relation
  or `derived_from` column) so matting is re-runnable with better models.
- **Asset flag:** realized as `assets.alpha_status` (state machine, not a
  boolean — computed at store time via header check) — render sites branch on
  it for frame styling (no circle-crop for sprites).
- **VN compositor contract:** sprite layer = `(asset + transform + anchor)`:
  standing-figure framing from `epic-asset-transform-metadata.md` context
  `sprite` (feet/belly anchor, scale-vs-stage), z-order above background, below
  dialogue box.
- **Cleanup rules:** matted derivative inherits emotion binding; deletion of
  raw keeps derivatives until GC of orphans (existing asset cleanup path).

## Work Items

- [ ] Capability: `transparency` flag on image providers + config schema;
      pass-through in generation request builder
- [ ] Generation: request alpha when supported; pick PNG/WebP accordingly;
      record provider transparency in avatar metadata
- [x] Matting fallback: pluggable background-removal job
      (`src/generation/matting/`), raw + matted asset pair, job status surface
      + re-run (`src/assets/matting-routes.ts`)
- [x] `assets.alpha_status` column + state machine + header-level alpha
      detection at store (supersedes the boolean `has_alpha` sketch); schema
      artifacts regenerated
- [ ] Render: emotion-avatar message binding + mood panel branch on alpha
      status (no background fill, no hard circle clip) — VN sprite stage done,
      chat bubble styling pending
- [x] VN scene renderer: sprite layer compositing (bg → sprite → UI), anchor +
      scale via `sprite` transform context (`src/frontend/alpine/vn/`)
- [x] Tests: alpha flag detection (png tRNS, webp vp8l/alff, gif transparency),
      alpha status transitions, matting-job lifecycle (success/fail keeps raw
      usable)

## Non-Goals

- Automatic pose/silhouette normalization beyond crop framing.
- Live2D/rigged sprites — static cut-outs only.
- Video/animated avatars.

## Acceptance Criteria

- Opaque generation still yields a usable cut-out (matting fallback) without
  blocking the chat flow
- VN mode shows character over background with clean edges; transparent
  messages don't render a rectangular halo
- Re-running matting with a newer model is possible without re-rolling the
  generation

## Related

- `epic-asset-transform-metadata.md` — sprite framing/anchor is a transform
  context; bake/derive feeds this pipeline
- `epic-emotion-avatar-message-binding.md` — per-message emotion sprites are the
  layer content
- `epic-avatar-regeneration-control.md` — regen inherits alpha preference
- `epic-visual-novel-mode.md` — host surface for compositing
- `epic-aux-enrichment-pipeline.md` — matting job carrier
