<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Vector Graphics & Animated Image Generation

**File:** `.plan/epics/epic-vector-graphics-generation.md`
**Status:** Not Started
**Type:** Feature Epic
**Tags:** assets, svg, vector, animation, smil, image-generation, sanitization
**Priority:** Medium
**Effort:** Medium (phased; each phase ships standalone value)

## Background

Image generation entry (`src/generation/image-gen-route.ts`
`handleImageGeneration` → `src/generation/image-engine/index.ts`
`generateImages` with `openai|sdapi|sdcpp|comfyui` backends, no SD
failover) persists via `src/assets/service/persist-generated.ts` +
`createAsset`. Asset schema carries `mime_type` + `AssetType` enum
(`Image/Audio/Video/Memory/Other`, `src/db/enums-content.ts`) with no
animated split and no rendition table (B1 TODO in
`epic-asset-platform-capabilities.md`).

The mime allowlist in `src/assets/service/validate.ts` blocks
`image/svg+xml` — deliberate stored-XSS hardening (see
`.plan/tickets/BUG-asset-serve-public-immutable-cache-inline-svg-exposure.md`:
gallery sidebar renders image thumbs via `/thumb`, preview modal serves
`img/audio/video` via `/raw`, thumbs are sharp 256px WebP best-effort).
Any vector support must pass through that gate, not around it.

Two facts shape this epic: (1) LLM text providers already emit text, so
SVG-via-LLM needs only a prompt template + persist path through the
existing `src/generation/providers/registry.ts` + `callWithFailover`
path — no new provider; (2) the ComfyUI image path is reusable as the
raster source for any raster-to-vector step.

## Scope

### (1) Vector generation USING existing functionality

- **SVG-via-LLM:** prompt template producing well-formed SVG document
  text via existing text-provider path (`registry.ts` +
  `callWithFailover`); output flows into existing persist path
  (`persist-generated.ts` + `createAsset`). No new provider, no new
  failover logic.
- **Raster inputs via ComfyUI:** reuse existing ComfyUI image path as
  the raster source for vectorization (generate-then-trace); no new
  image backend.
- **Gallery/serve reuse:** thumbs via `/thumb`, full view via `/raw`
  modal — same contract as raster images (`epic-frontend-gallery.md`).

### (2) NEW implementations

- **SVG sanitization gate:** allowlist-based SVG scrubber (elements,
  attributes, CSS properties, URL schemes) enforced at persist/serve
  time; resolves the stored-XSS constraint behind the
  `validate.ts` `image/svg+xml` block. Gate owns: script/event-handler
  stripping, `foreignObject` policy, external-reference policy,
  size/complexity caps (billion-laughs / path-bomb guard).
- **Raster-to-SVG tracer integration point (optional):** single seam where
  a tracer (e.g. potrace-class centerline/color tracer, local binary or
  lib) converts ComfyUI/SD raster output to SVG; behind a flag, off by
  default. Tracer itself is swappable — epic defines the seam, not the
  algorithm.
- **SMIL/CSS animation subset policy:** explicit allowlist of animatable
  constructs (`<animate>`, `<animateTransform>`, CSS `@keyframes` on
  presentation attributes within the sanitizer allowlist); everything
  else (JS-driven, declarative event-triggered unbounded loops beyond
  cap) rejected. Policy states duration/loop caps and preview behavior
  (first-frame poster via `/thumb`).

### (3) Non-goals

- **Full video generation** — owned by `epic-video-generation.md`
  (Wan/LTX); animated SVG/SMIL is frame-less vector animation, not
  video, and never routes through the video pipeline.
- **Rendition table** — owned by asset-platform B1
  (`epic-asset-platform-capabilities.md`); vector thumbs/posters reuse
  whatever B1 builds, this epic adds no parallel rendition store.
- New image provider backends, SD failover, animated raster formats
  (APNG/WebP-animated/GIF policy unchanged).

## Work Items

### Phase 1 — SVG-via-LLM on existing rails

- [ ] SVG prompt template (constrained viewport, element budget, style
  scoping) wired through `registry.ts` + `callWithFailover`
- [ ] Persist path: template output → `persist-generated.ts` +
  `createAsset` with `mime_type=image/svg+xml` (gated on Phase 2
  sanitizer passing)
- [ ] Gallery render: `/thumb` poster + `/raw` modal display for SVG
  assets

### Phase 2 — Sanitization gate (stored-XSS)

- [ ] Allowlist scrubber: elements / attributes / CSS / URL schemes;
  `script`, event handlers, `foreignObject`, external refs per policy
- [ ] Complexity caps: byte size, element count, entity-expansion guard
- [ ] `validate.ts` allowlist updated to admit `image/svg+xml` only
  post-scrub; regression test from
  `BUG-asset-serve-public-immutable-cache-inline-svg-exposure.md`
- [ ] Serve headers: SVG via `/raw` with `Content-Security-Policy:
  sandbox` + no-inline-script posture

### Phase 3 — Animation subset

- [ ] SMIL/CSS allowlist + duration/loop caps in sanitizer
- [ ] Preview contract: first-frame `/thumb` poster, animated playback
  only in `/raw` modal behind user gesture
- [ ] img2vid handoff note: animated SVG as storyboard input to
  `epic-multimodal-asset-reuse.md` (no implementation here)

### Phase 4 — Optional raster-to-SVG tracer seam (flagged off)

- [ ] Tracer integration point: raster asset in → SVG asset out via
  ComfyUI raster source; flag-gated, provider-swappable
- [ ] Tests: trace determinism fixture, sanitizer bypass attempts,
  animation-cap enforcement

## Acceptance Criteria

- [ ] SVG generated via existing LLM text path with no new provider;
  green `bun run check`
- [ ] `image/svg+xml` persists and serves only post-sanitizer; known
  stored-XSS payloads from the BUG ticket render inert
- [ ] Animated SVG subset plays in preview modal, poster thumb is
  static first frame, loop/duration caps enforced
- [ ] No video-pipeline code touched; no rendition-table migration in
  this epic
- [ ] Tracer seam exists behind a flag (or documented as deferred with
  the seam stubbed)

## Related

- `.plan/epics/epic-frontend-gallery.md` — `/thumb` + `/raw` display
  contract for SVG/poster assets
- `.plan/epics/epic-video-generation.md` — owns full video (Wan/LTX);
  this epic explicitly excludes it
- `.plan/epics/epic-asset-platform-capabilities.md` — owns rendition
  table B1; vector posters/thumbs are consumers
- `.plan/epics/epic-multimodal-asset-reuse.md` — img2vid / storyboard
  reuse of vector outputs
- `.plan/epics/epic-asset-transform-metadata.md` — deterministic
  transforms; vector bake/derive follows its rules
- `src/generation/providers/registry.ts` — existing failover path
  SVG-via-LLM reuses
- `src/assets/service/validate.ts` — mime allowlist owning the SVG block
- `.plan/tickets/BUG-asset-serve-public-immutable-cache-inline-svg-exposure.md`
  — stored-XSS constraint driving the sanitization gate


git issue: f459705
