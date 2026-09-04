<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: char-growth-prompt

**Status:** ⬜ Not Started
**Priority:** High
**Effort:** Small

## Summary

Implement `actorGrowthSection` in `src/assistant/prompt/sections/actor-growth.ts` and register it in `src/assistant/prompt/registry.ts` after `internalTraitsSection`. Emits current arc + last 5 growth log entries + growth-mode directive (static anti-drift or dynamic encouragement). PRIORITY = 1 (behavior-critical, never dropped).

## Acceptance Criteria

- [ ] Section emits when arc OR log exist; returns `[]` otherwise
- [ ] Static-mode directive explicitly forbids drift
- [ ] Dynamic-mode directive honors recorded evolution
- [ ] `PRIORITY.actorGrowth` is set in `src/assistant/prompt/types.ts`
