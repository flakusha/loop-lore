<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK-025: Text effects and overlays

**Status:** done
**Priority:** medium
**Effort:** Medium
**Summary:** Reusable text-effects primitives (shake, glow, typewriter, fade) plus overlay stack.
**Context:** Pure presentation layer; composes on existing surfaces without altering backend schema.
**Acceptance Criteria:** See ## Acceptance Criteria below.

**Status**: done
**Priority**: medium
**Effort:** Medium
**Labels**: text-effects, overlay, ui, immersion
**Assignee**:
**Epic**: epic-frontend-components
**Related**:

## Summary

Add inline text effects (shake, glow, typewriter, fade) and overlay layers (banner, toast, ambient ticker) usable across chat, narration, and scene HUDs.

## Context

Pure presentation layer. Effects compose on existing message and HUD surfaces without altering backend message schema. IN: CSS-driven effects library, overlay stack manager, reduced-motion fallback. OUT: LLM-side effect tagging, server-rendered animation frames.

## Acceptance Criteria

- [x] Effects library exposes shake, glow, typewriter, and fade via a single `<TextFx>` component
- [x] Overlay stack supports concurrent banner, toast, and ticker without z-index collisions
- [x] `prefers-reduced-motion` disables non-essential motion; essential UI feedback remains
- [x] Effects are testable via Playwright assertions on computed styles and aria-live regions
- [x] No regression in chat scroll position when overlays appear

## Related Files

- src/components/TextFx.vue (to be created)
- src/components/OverlayStack.vue (to be created)
- src/views/chat/ChatView.vue
- src/frontend/effects/

## Notes

- Coordinate with accessibility epic for reduced-motion semantics
- Avoid JS animation libraries where CSS keyframes suffice

Git issue: `b983dc4`
