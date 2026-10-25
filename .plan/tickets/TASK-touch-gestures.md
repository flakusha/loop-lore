<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Touch gestures (mobile interaction surface)

**Status:** In Progress
**Priority:** low
**Effort:** Medium
**Summary:** Wire touch gesture handling (tap, swipe, pinch, long-press) for mobile chat surfaces so the mobile frontend matches the desktop keyboard-driven experience. Sub-feature of `epic-accessibility-input`.
**Context:** Today the chat composer, message list, and chat sidebar rely on hover + keyboard. Mobile users get only the OS-default touch handling — no swipe-to-reply, no pinch-to-zoom the chat view, no long-press for message actions. `epic-accessibility-input` Phase 2 (touch gestures) was removed 2026-08-14 because the corresponding `.plan/tickets/TASK-touch-gestures.md` file was never created. This ticket re-files it so the epic's gap entry can be cleared.
**Acceptance Criteria:** [ ] Touch event handlers (`touchstart` / `touchmove` / `touchend`) registered on the chat composer, message list, and chat sidebar. (2026-10-25: message list done via `src/frontend/alpine/chat-touch-gestures.ts`; composer and sidebar outstanding — the sidebar keeps its own inline swipe.) [ ] Swipe-right on a message bubbles a reply affordance; swipe-left marks read. (Delivered instead as the epic's canonical map: swipe-right → edit, swipe-left → archive-confirm dialog; no read-marking/reply affordance exists in the app.) [x] Long-press on a message opens the message-actions context menu. (2026-10-25, dispatched through the existing `openContextMenu` path.) [ ] Pinch-to-zoom is limited to the chat scroll container (not the whole page) so the chat sidebar/composer stay anchored. [ ] All gestures are no-op when the underlying touch is on a form input or selectable text. (2026-10-25: buttons/inputs/contenteditable carve-out done; selectable-text carve-out still open.) [x] Unit tests cover each gesture's hit/miss conditions and the input-element carve-out. (`src/frontend/touch.test.ts`, `src/frontend/alpine/chat-touch-gestures.test.ts`.) [ ] E2E test exercises a swipe on a real mobile viewport (`tests/e2e/browser/mobile-touch.browser.ts`). [ ] `bun run check` green.
**Epic:** epic-accessibility-input
**Tags:** mobile, touch, accessibility, frontend, gestures
**Related:** epic-accessibility-input (Phase 2),


git issue: d3a16bf
