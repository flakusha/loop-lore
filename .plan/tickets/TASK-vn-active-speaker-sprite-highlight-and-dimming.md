<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: VN: active-speaker sprite highlight and dimming

**Status:** ⬜ Not Started
**Priority:** medium
**Epic:** Visual Novel Mode; Immersion & Presentation
**Effort:** Medium

## Summary

Visual focus states on the stage: speaking character highlighted (full alpha/brightness/scale-up), others dimmed/blurred/desaturated; highlight follows the current message speaker including narration (dim all), group scenes, and choice prompts. Implement in scene-renderer + vn.css; respect prefers-reduced-motion. Acceptance: highlight state derives from message stream, transitions animated, no layout shift, CSS-only fallback.

## Acceptance Criteria

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
