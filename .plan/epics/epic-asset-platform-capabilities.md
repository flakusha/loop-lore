<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Asset Platform Capabilities (Messenger/Social Patterns)

**Status:** 🔴 Not Started
**Priority:** Medium
**Effort:** Large (batch-decomposable; each batch ships standalone value)
**Type:** Feature Epic
**Tags:** assets, messages, uploads, renditions, dedup, RAG, assistant

## Summary

Generic social-network / messenger / chat asset patterns, adapted to loop-lore
as **platform substrate** under the avatar/VN/generation features: content
addressing, renditions, upload UX, in-chat asset semantics, lifecycle/GC,
sharing hardening, and a machine-readable asset surface that later feeds RAG,
assistant deterministic-edit workflows, and communication features.

Positioning: the four avatar epics (regen / transforms / alpha / wardrobe) are
*consumers*; this epic is the *infrastructure* they keep reaching for (a
renditions row for baked crops, a pHash for sprite dedup, a backlink query for
"where is this avatar used"). Build it once here, feed every feature batch.

## Current State

- `src/assets/`: service (create/read/delete/links/detect/validate/store-file/
  upload-encryption), `metadata.ts` = **upload-time extract only** (dimensions,
  type — cf. `BUG-asset-webp-vp8x-dimension-truncation`), `shares.ts` =
  visibility + per-user share records. `assets` + `asset_links` polymorphic
  linking (`002_assets.ts`).
- Gallery (`epic-frontend-gallery.md`) renders full-size blobs at 4:3 cards —
  **no server-side rendition ladder**.
- `ModelRole.Captioning` exists in config but is a **dead role** (documented in
  `epic-aux-enrichment-pipeline.md` — nothing resolves it).
- No dedup/content-hash, no orphan GC, no alt/caption field, no albums, no
  sticker concept, no storage budget, no "recent assets" picker.

## Batches (each independently shippable)

### B1 — Content foundation: dedup, renditions, privacy strip

- **Content-addressed store:** BLAKE3 hash at upload; `assets.blake3` +
  unique-ish lookup — identical bytes stored once, linked many times. Big win
  here (larger than in stock messengers) because generation loops re-produce
  near-identical sets; pairs with edit-model img2img variants.
- **Renditions table:** `asset_renditions(asset_id, kind, path, width, height,
  bytes)` — `thumb_s | thumb_l | lqip (blurred placeholder) | poster (video
  frame) | baked` (the `derive` bake output of
  `epic-asset-transform-metadata.md` = a rendition, not a new root asset).
  Gallery + chat image bubbles switch to thumbs with LQIP progressive swap.
- **EXIF/GPS strip on share/attachment boundary** (privacy default like
  WhatsApp/Signal): keep original bytes for own gallery metadata view; serve
  stripped derivative to other users. `has_location` flag from `metadata.ts`
  extraction decides when the strip path fires.

### B2 — Chat/upload UX patterns

- **Optimistic upload**: local blob renders in composer/message instantly,
  server id backfills; failed sends queue with retry (messenger-standard;
  current flow blocks on upload).
- **Client-side downscale + paste/drag-drop multi-file** in composer.
- **Albums/carousels**: group N assets into one message unit (grid bubble,
  click-to-swipe) — generation batches ("send me 4 variants") map naturally.
- **Recent-assets picker** (recently-used tray in composer) — reuse of
  uploaded/generated assets instead of re-generating.
- **Shared-media tab per chat** (Telegram/WhatsApp group-info): assets linked
  to a chat, grouped by type/date — query over `asset_links`, no new storage.

### B3 — Lifecycle & governance

- **Orphan GC**: reference count over `asset_links` (+ renditions inherit);
  sweep job for zero-ref rows after retention window. Safety net under every
  regen/edit feature (epic-avatar-regeneration-control deletes-and-replaces
  constantly — GC makes that cheap and undoable).
- **Soft-delete + trash window** for assets (restore before GC finalizes).
- **Storage budget per user/world** + usage report + bulk cleanup tool
  (mirrors the `src/memory/` budget pattern, on-disk variant).
- **Share-link hardening**: expiry, max-views, single-use tokens on top of
  existing `shareAsset`; view/download separation.

### B4 — Machine-readable surface (RAG + assistant feeds)

- **Alt text / caption fields** on assets: user-set alt (a11y — complements
  `epic-accessibility-input.md`) + **VLM auto-description** — finally wire the
  dead `ModelRole.Captioning` into `caption-route.ts` per
  `epic-aux-enrichment-pipeline.md` batch 1.
- **Asset → RAG index**: descriptions, captions, OCR text (docs/images), tags
  become retrievable context (`epic-rag-*` family); chat images stop being
  black boxes to recall/summarization.
- **Perceptual hash** (`pHash/dHash` on store): find-similar, duplicate
  generation detection, "same avatar under different crop".
- **Backlinks API**: `GET /assets/:id/usage` — where is this asset referenced
  (messages, characters, worlds, cards) — debugging + safe-delete + GC input.

### B5 — Deterministic asset ops (assistant workflow substrate)

- **Ops language**: JSON transform program per asset —
  `{ op: "crop|rotate|flip|resize|annotate|stack|filter", params: ... }[]` —
  stored as metadata, applied **server-side deterministically** to produce a
  rendition. `asset_transforms` (context framing epic) becomes the single-op
  special case of this list.
- Assistant/GM can emit ops (deterministic, auditable, replayable) where today
  it can only re-roll a whole generation; re-running an ops list on a new
  generation = the "inherit previous crop" rule in
  `epic-avatar-regeneration-control.md` generalized.
- **Sticker packs**: pre-cut transparent assets + recently-stuck history —
  composition of B1 renditions + `epic-avatar-alpha-vn-layering.md` alpha +
  ops language (auto-cutout = a stored op).

## Work Items

- [ ] B1: `assets.blake3` + dedup-on-store; `asset_renditions` table + thumb/LQIP
      pipeline (Bun.image) + gallery/bubble switch; EXIF strip path on
      external serve
- [ ] B2: optimistic upload state machine + retry queue; client downscale;
      album message kind; recent-picker; shared-media tab
- [ ] B3: ref-count view + GC sweep job; soft-delete column + restore; budget
      checker (structured-logging + admin report); share token expiry/views
- [ ] B4: `alt_text`/`description` columns; Captioning role wiring; pHash on
      store; usage/backlinks query + endpoint; RAG ingestion adapter
- [ ] B5: ops-list storage + deterministic executor (sandboxed sharp-class ops
      only); assistant tool emitting ops; sticker kind atop alpha + recents
- [ ] Tests per batch: dedup identity + ref-count math, GC never touches
      referenced rows, strip-on-serve keeps own copy intact, ops executor
      determinism (same input+program → same bytes), backlinks completeness
      fixture

## Non-Goals

- CDN/edge infrastructure (single-node Bun serving stays; renditions prepare
  for it).
- Full media editing suite (ops language is deterministic primitives, not a
  canvas).
- E2E encrypted media relay semantics (crypto epic owns transport).

## Acceptance Criteria

- Each batch ships behind its own gate with green `bun run check`
- Re-generated avatar sets consume zero extra bytes for identical outputs
  (dedup proof)
- Chat image bubbles never load original bytes (renditions proof)
- A generated image is searchable by description in RAG recall (B4 proof)
- Assistant can produce a correct avatar crop **without** any image-model call
  (B5 proof: ops list → rendition)

## Related

- `epic-asset-transform-metadata.md` — single-context crop rows ⊂ B5 ops lists;
  bake/derive → B1 rendition
- `epic-avatar-regeneration-control.md` — replace/delete churn → B3 GC
- `epic-avatar-alpha-vn-layering.md` — matting = stored op; stickers reuse alpha
- `epic-wardrobe-avatar-variants.md` — variant grids render via B1 thumbs
- `epic-aux-enrichment-pipeline.md` — B4 wires its dead Captioning role
- `epic-frontend-gallery.md` — first consumer of renditions + shared-media
- `epic-rag-ingestion.md` / `epic-rag-context-sources.md` — B4 adapter target
- `epic-messages.md` — album kind + optimistic send surface
