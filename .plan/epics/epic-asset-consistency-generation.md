<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Asset Consistency Generation — Reference-Conditioned Re-Generation and In-Chat Image Edit

**Overview:** (see sections below)

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium
**Type:** Feature Epic
**Tags:** image-generation, reference-conditioning, comfyui
**Related:** epic-comfyui-plugin.md, epic-emotion-avatar-message-binding.md, epic-asset-transform-metadata.md

## Summary

Keep a character/scene look stable across generations and allow in-place
image edit from chat without losing reference fidelity. Extends the ComfyUI
plugin with reference-conditioned workflows (IP-Adapter family or provider
equivalents) behind an opt-in, provider-agnostic surface.

## Scope

- Reference set management: `assets.reference_assets[]` + pin-canonical-look.
- Reference-conditioned ComfyUI workflow (IP-Adapter default), per-asset opt-in.
- In-chat img-edit affordance reusing the original reference set.
- Async downstream regeneration on pin with progress UI.
- `ReferenceProvider` interface for non-ComfyUI providers.

## Tasks

- [ ] `assets.reference_assets[]` column + migration.
- [ ] Pin-canonical-look UI on character + scene.
- [ ] Reference-conditioned ComfyUI workflow (IP-Adapter default).
- [ ] In-chat img-edit affordance (prompt + style hints).
- [ ] Async downstream regeneration on pin.
- [ ] `ReferenceProvider` interface + ComfyUI adapter.

## Acceptance Criteria

- [ ] 10 regenerations, same prompt: visually consistent (perceptual-hash regression).
- [ ] In-chat edit preserves character reference set.
- [ ] Pin triggers async downstream regeneration with progress.
- [ ] Provider-agnostic interface; ComfyUI adapter ships.
- [ ] Migration does not break emotion-avatar binding flow.

## Linked Tickets

| # | Ticket |
| - | ------ |
| 1 | `TASK-asset-rag-caption-freshness-and-strip-before-index-privacy.md` |
| 2 | `TASK-in-chat-asset-edit-flow.md` |
| 3 | `TASK-caption-variants-create-recreate-pick-best-scenario.md` |
| 4 | `IDEA-epic-asset-consistency-generation-2026-09-26.md` |
| 5 | `TASK-matrix-cross-mech-g21-asset-consistency-generation.md` |
