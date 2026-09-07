<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Avatar Alpha Channel + VN Layering

**Status:** 🔴 Not Started
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

## Current State

- Generation path (`emotion-avatar-service/generation.ts`, aux-pipeline image
  providers) stores whatever bytes come back; no transparency request, no
  post-processing, format handling in `src/assets/service/` is type-detect only.
- `epic-visual-novel-mode.md` renders scenes with backgrounds + expression
  changes (emotion binding) — no sprite layering; no alpha anywhere in pipeline
  (grep: no matting/transparency handling).
- Storage/delivery: `src/assets/` store-file + encryption path — format-agnostic
  blobs; PNG/WebP fine already.

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
- **Asset flag:** `assets.has_alpha` (computed at store time, cheap header
  check) — render sites branch on it for frame styling (no circle-crop for
  sprites).
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
      record `provider_transparent: bool` in avatar metadata
- [ ] Matting fallback: aux-pipeline job (model pluggable), raw + matted asset
      pair, job status surface
- [ ] `assets.has_alpha` column + computation at store; regen schema artifacts
- [ ] Render: emotion-avatar message binding + mood panel respect alpha (no
      background fill, no hard circle clip)
- [ ] VN scene renderer: sprite layer compositing (bg → sprite → UI), anchor +
      scale via `sprite` transform context
- [ ] Tests: alpha flag detection (png rgba vs rgb, webp vp8l), capability
      negotiation, matting-job lifecycle (success/fail keeps raw usable), VN
      layer order unit test

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
