<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Touch gestures (mobile interaction surface)

**Status:** open
**Priority:** low
**Effort:** Medium
**Summary:** Wire touch gesture handling (tap, swipe, pinch, long-press) for mobile chat surfaces so the mobile frontend matches the desktop keyboard-driven experience. Sub-feature of `epic-accessibility-input`.
**Context:** Today the chat composer, message list, and chat sidebar rely on hover + keyboard. Mobile users get only the OS-default touch handling — no swipe-to-reply, no pinch-to-zoom the chat view, no long-press for message actions. `epic-accessibility-input` Phase 2 (touch gestures) was removed 2026-08-14 because the corresponding `.plan/tickets/TASK-touch-gestures.md` file was never created. This ticket re-files it so the epic's gap entry can be cleared.
**Acceptance Criteria:** [ ] Touch event handlers (`touchstart` / `touchmove` / `touchend`) registered on the chat composer, message list, and chat sidebar. [ ] Swipe-right on a message bubbles a reply affordance; swipe-left marks read. [ ] Long-press on a message opens the message-actions context menu. [ ] Pinch-to-zoom is limited to the chat scroll container (not the whole page) so the chat sidebar/composer stay anchored. [ ] All gestures are no-op when the underlying touch is on a form input or selectable text. [ ] Unit tests cover each gesture's hit/miss conditions and the input-element carve-out. [ ] E2E test exercises a swipe on a real mobile viewport (`tests/e2e/browser/mobile-touch.browser.ts`). [ ] `bun run check` green.
**Epic:** epic-accessibility-input
**Tags:** mobile, touch, accessibility, frontend, gestures
**Related:** epic-accessibility-input (Phase 2), epic-frontend-mobile-composer


git issue: d3a16bf
