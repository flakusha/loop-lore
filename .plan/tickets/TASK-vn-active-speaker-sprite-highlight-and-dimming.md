<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: active-speaker sprite highlight and dimming

**Status:** ✅ Complete (2026-09-10) — speaker-active/dimmed focus states from the message stream, narration dims all, reduced-motion respected
**Priority:** medium
**Epic:** Visual Novel Mode; Immersion & Presentation
**Effort:** Medium

## Summary

Visual focus states on the stage: speaking character highlighted (full alpha/brightness/scale-up), others dimmed/blurred/desaturated; highlight follows the current message speaker including narration (dim all), group scenes, and choice prompts. Implement in scene-renderer + vn.css; respect prefers-reduced-motion. Acceptance: highlight state derives from message stream, transitions animated, no layout shift, CSS-only fallback.

## Acceptance Criteria

- [x] Implementation complete — `applyStageHighlight`/`buildStageElement` derive focus from `scene.speakerId` (narration `null` dims all); `vn.css` adds `.vn-speaker-active` (full presence + subtle scale) and `.vn-speaker-dimmed` (brightness/saturate filter + lower opacity) with 250ms transitions; filter/opacity/scale-only so layout never shifts; `prefers-reduced-motion` disables transitions and the scale lift
- [x] Tests passing — speaker/dim/narration/hidden states in `sprite-stage.test.ts` + `stage.test.ts`; full `bun run check` green at CHECK_JOBS=2
- [x] Documentation updated — focus-state contract recorded here; choice-prompt highlight follows the same speaker path via scene state
