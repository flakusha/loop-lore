<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Scene Art — Background Catalog & State-Driven Dynamic Generation

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ⬜ Not Started
**Priority:** Medium
**Effort:** High
**Type:** Feature Ticket
**Tags:** chat, feature, scene-art, backgrounds, generation, world-state
**Epic:** epic-chat-product-features

## Summary

Implement the research-flagged "Depict-style compiler" (`epic-platform-research` trend F, candidate #28): scene/background art produced on demand from persistent world/story state. Two layers: (a) a **background catalog** — curated/static backgrounds organized per world/location and served through the asset rendition pipeline; (b) **dynamic generation** — when no catalog entry fits, compile a generation prompt from structured state (location, time, party, active events) and produce scene art, dedup-cached like all generated assets. The research doc notes loop-lore "already owns the hard half (structured DB state); the render wrappers are the missing outer layer."

## Acceptance Criteria

- [ ] Backgrounds are catalog assets addressable by world/location; a location without a catalog entry renders a generated fallback (feature-flagged)
- [ ] The generation prompt is compiled deterministically from world/story state (same state → same prompt → cache hit), no ad-hoc prompt strings
- [ ] Generated scene art flows through the asset platform's dedup + rendition pipeline: chat bubbles never load original bytes (per `epic-asset-platform-capabilities` acceptance)
- [ ] Generation respects provider health/fallback (multi-provider text2img path reused from emotion avatars)
- [ ] Scene art injection is context-budget aware: prompt compile never inflates the LLM context
- [ ] Optional per-character voice axis follows the same state-driven compile pattern (trend F scope; may split into a follow-up ticket)
- [ ] Static catalog entries always win over generation for identical location+state keys

## Related Epics / Tickets

- Parent: `epic-chat-product-features`
- `epic-asset-platform-capabilities` — asset ops, dedup, renditions (note: its Non-Goals exclude an interactive canvas; this ticket composes primitives, it does not build an editor)
- `epic-game-frontend-scenes` — canvas/WebGL render surface for scenes
- `epic-platform-research` — trend F/G source of this ticket
- `epic-audio-video-sound` — voice-axis precedent

## Files

- `src/generation/` — scene-prompt compiler
- `src/assets/` — catalog storage, dedup, renditions
- `src/image-edit/` — provider fallback path
- `src/chat/service/` — location→background resolution at render time

## Research Inputs

- `epic-platform-research` trend F (DreamRunner Depict/Voice, Neta scene images) and trend G (world-as-project), recommendation to pull #28 (2026-09-11 re-verified: no ticket existed)

## Open Questions

- Does generation trigger automatically on location change, or only when the narration signals a scene shift?
- Who owns catalog curation — admin, gm, or per-user uploads?
