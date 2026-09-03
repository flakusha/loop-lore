<!-- SPDX-License-Identifier: LGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Adopt View Transitions API for page navigation

**Status:** ⬜ Not Started
**Priority:** medium
**Effort:** Small
**Epic:** epic-frontend-modernization.md

## Summary

The View Transitions API provides native animated page transitions for SPAs and MPA-style navigation. Currently loop-lore uses htmx for navigation with no transition animations. Adding view transitions improves perceived performance and provides smooth visual continuity between views.

## Current state

- htmx handles all navigation (full page swaps or partial replacements)
- No transition animations between pages
- `document.startViewTransition()` not used anywhere
- CSS `::view-transition-*` pseudo-elements not used

## Direction

1. **Phase 1 — Cross-document transitions**: Add `meta name="view-transition" content="same-origin"` for MPA-style transitions
2. **Phase 2 — htmx integration**: Wrap htmx swaps in `document.startViewTransition()` for animated partial updates
3. **Phase 3 — Named transitions**: Use `view-transition-name` for specific elements (chat messages, character cards) that persist across navigation
4. **Phase 4 — CSS animations**: Add `@keyframes` for `::view-transition-old` and `::view-transition-new` pseudo-elements
5. **Graceful degradation**: Feature-detect `document.startViewTransition`; fall back to instant swap

## Acceptance criteria

- [ ] Page navigation has smooth cross-fade or slide transition
- [ ] htmx partial swaps use `startViewTransition()` wrapper
- [ ] Persistent elements (chat input, sidebar) use `view-transition-name`
- [ ] No transition in browsers without support (instant swap)
- [ ] Reduced motion preference respected (`prefers-reduced-motion`)

## Browser support

- Chrome 111+, Edge 111+ (2023+)
- Firefox 126+ (2024+)
- Safari 18+ (2024+)
- ~90% global coverage as of 2025

## Related

- `TASK-adopt-dialog-api-for-modals` — dialogs can use view transitions for open/close

