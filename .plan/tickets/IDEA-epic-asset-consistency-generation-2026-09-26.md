<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# IDEA-epic-asset-consistency-generation-2026-09-26: Reference-Conditioned Asset Consistency (matrix gap G21)

**Status:** Not Started
**Priority:** medium (matrix 🟢 Low severity, "Med difficulty, do not defer — clean pull candidate")
**Effort:** Medium
**Epic:** epic-asset-consistency-generation.md
**Type:** Research
**Summary:** Matrix gap G21 names asset-consistency generation — reference conditioning + in-chat image edit — as the **only emergent-sweep capability with no P6+ blocker**. The current generation pipeline (ComfyUI per `epic-comfyui-plugin.md`) generates each asset from a fresh prompt; characters and scenes drift visually between generations. No epic owns reference-conditioned re-generation or in-chat img-edit. Inspiration sources: Luma, Runway, Krea, RisuAI dynamic-assets.
**Context:** Source row: 2026-09-26 epic audit; matrix reference: `matrix-cross-mechanics.md` G21 (2026-08-14 emergent-platform sweep). Existing related: `epic-comfyui-plugin.md` (image generation, lacks reference conditioning), `epic-emotion-avatar-message-binding.md` (avatar regeneration control, narrow scope), `epic-frontend-gallery.md` (display only), `epic-asset-transform-metadata.md` (metadata, not regeneration).

## Suggested epic description

### Title

`epic-asset-consistency-generation.md` — Reference-Conditioned Re-Generation & In-Chat Image Edit

### Status / Priority / Effort / Type

- Status: Not Started
- Priority: Medium (matrix 🟢 Low severity; clean pull candidate per matrix)
- Effort: Medium (ComfyUI reference workflow + in-chat edit UI + cache invalidation)
- Type: Feature Epic

### Summary

Keep a character or scene's look across multiple generated images, and let the user (or GM) edit a generated image in-place from the chat view without losing reference fidelity. Uses the existing ComfyUI plugin (`epic-comfyui-plugin.md`) extended with reference-conditioning workflows (IP-Adapter, ReActor, InstantID, or provider-native equivalents), plus a chat-integrated img-edit affordance that reuses the same reference set.

### Scope

1. **Reference set management** — every generated asset stores its reference images (the previous assets in the character's appearance chain) in `assets.reference_assets[]`. Reference set updates when the user pins a canonical look.
2. **Reference-conditioned workflow** — extend `src/generation/providers/comfyui.ts` with reference-conditioned workflows (IP-Adapter / ReActor / InstantID) and config knobs. Default off; per-asset opt-in.
3. **In-chat img-edit affordance** — a button on every message-attached image that opens a "regenerate with reference" dialog. Re-uses the original reference set; user can adjust prompt + style hints.
4. **Cache invalidation** — when the user pins a new canonical look, regenerate the character's downstream assets (avatars, scene images) asynchronously.
5. **Provider abstraction** — wrap reference-conditioning behind a `ReferenceProvider` interface so non-ComfyUI providers (Luma, Runway, Krea) can plug in.

### Tasks

- [ ] `assets.reference_assets[]` column + migration
- [ ] Pin-canonical-look UI on character + scene
- [ ] Reference-conditioned ComfyUI workflow (IP-Adapter default)
- [ ] In-chat img-edit affordance
- [ ] Async downstream regeneration on pin
- [ ] `ReferenceProvider` interface
- [ ] Provider plugins for Luma / Runway / Krea (each as core plugin per `epic-platform-integrations.md` Tier-2 pattern)

**Acceptance Criteria:**
- [ ] A character regenerated 10 times with the same prompt produces visually consistent output (subjective, but a manual sanity check + a regression test that hashes perceptual similarity)
- [ ] In-chat img-edit on a message image re-generates with the character's reference set intact
- [ ] Pinning a new canonical look triggers async regeneration of downstream assets; UI shows progress
- [ ] `ReferenceProvider` interface is provider-agnostic; ComfyUI + Luma adapters ship as core plugins
- [ ] Reference set migration adds the column without breaking the existing `epic-emotion-avatar-message-binding.md` flow

### Related Epics

- `epic-comfyui-plugin.md` — current image-generation surface; this epic extends it
- `epic-emotion-avatar-message-binding.md` — narrow avatar regeneration (separate concern: emotion-driven, not reference-driven)
- `epic-asset-transform-metadata.md` — metadata for transformed assets
- `epic-frontend-gallery.md` — gallery UI for pinned canonical looks
- `epic-platform-integrations.md` — provider plugin pattern (this epic reuses Tier-2 plugin shape)

## Rationale

The matrix audit explicitly notes G21 as the only emergent-sweep capability **without a P6+ blocker** — "Med difficulty, do not defer — clean pull candidate." Today the pain is real: a character regenerated with a fresh prompt every turn produces visually drifting avatars and scene images, breaking immersion and forcing users to manually re-pin the canonical look via `epic-avatar-regeneration-control.md`.

Reference-conditioning (IP-Adapter family) is mature technology shipping in Luma / Runway / Krea today. The ComfyUI plugin already has the workflow infrastructure; adding reference conditioning is config + workflow, not greenfield code.

This epic also unlocks the `epic-emotion-avatar-message-binding.md` flow's *visual continuity* — without it, emotion-driven regeneration drifts.

## Open questions

1. **Reference set size** — how many reference images per character/scene? Memory footprint scales linearly; 5–10 is typical, but a character with 12 canonical outfits needs more.
2. **Cross-provider portability** — when a character is exported via `epic-io-formats.md`, does the reference set travel with the format header, or is it regenerated on import? Matrix G45 (model-agnostic representation) implies yes, but the format isn't specified.
3. **Style preservation** — if the user pins a canonical look in watercolor style, does in-chat img-edit force watercolor or allow deviation? Probably opt-in per regeneration.
4. **Performance** — reference-conditioned workflows are slower (typically 2–4× plain generation). Is that acceptable for the in-chat affordance, or should it be queued?
5. **Conflict with `epic-avatar-regeneration-control.md`** — that epic already owns regeneration control (frequency, opt-in). Does this epic consume it or duplicate it?
6. **Backfill** — existing characters (potentially 10k+ in production) have no reference set. Migrate via the first regeneration, or ship a one-shot backfill script?

**Tags:** idea, matrix-gap, g21, asset-consistency, reference-conditioning, image-generation, clean-pull
**Related:** .plan/matrix-cross-mechanics.md (G21), .plan/epics/epic-comfyui-plugin.md, .plan/epics/epic-emotion-avatar-message-binding.md, .plan/epics/epic-platform-integrations.md, .plan/epics/epic-frontend-gallery.md

git issue: 00000000
