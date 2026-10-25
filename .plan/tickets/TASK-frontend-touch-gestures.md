<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Frontend touch gesture system — wire recovered utility into mobile UI

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-accessibility-input, epic-3d-generation

## Summary

The touch-gesture utility (`src/frontend/touch.ts` — `onSwipe`/`onTap`/`onLongPress`,
complete, reduced-motion + click fallbacks) was **deleted 2026-08-14 (`915842dc`)** as
"dead code, zero imports" and recovered to `tree/recover-deleted-features` (branch
`recover-deleted-features`, commit `1cc36b9c`). It is implementable: the deletion was
correct only in that nothing *consumes* it — the module itself is finished and matches
the gesture→action mapping already specified in `epic-accessibility-input.md` (Phase 2).

This task wires the recovered utility into concrete mobile surfaces and adds the
missing unit tests, per epic Phase 2 ("Touch gesture system … swipe/tap/long-press").

## Current State (verified 2026-08-14)

- `src/frontend/touch.ts` — 148 lines, exports `onSwipe`, `onTap`, `onLongPress`,
  `SwipeDirection`, plus options interfaces. Zero imports anywhere in `src/`.
  No test file. Redundant with epic "Files to Create: `src/frontend/a11y/touch-gestures.ts`".
- `src/frontend/alpine/sidebar.ts` has its own inline swipe logic (36-43) — a
  candidate to consolidate onto the shared util, but not required for this task.
- Epic-canonical gesture map: swipe-left → delete/archive (chat, inventory);
  swipe-right → reply/edit (chat); long-press → context menu; tap → activate.

## Acceptance Criteria

- [x] `src/frontend/touch.ts` imported by ≥1 built bundle (registered through
      `src/frontend/alpine/index.ts` or `alpine-init.ts`) so it is no longer dead code
      (2026-10-25: imported by `src/frontend/alpine/chat-touch-gestures.ts` →
      `chat/bootstrap.ts` → `chat/index.ts`, part of the `alpine/index.ts` bundle)
- [x] Wire `onSwipe` into a real chat surface (chat message swipe-left → delete/
      archive; swipe-right → reply/edit, matching epic gesture map). If chat
      integration is out of scope for the first pass, wire into gallery
      swipe-between-images instead and state the choice in the ticket.
      (2026-10-25: swipe-left → archive-confirm dialog, swipe-right → edit on
      `#message-list` — the same actions the 📦 Archive and ✏️ Edit buttons dispatch)
- [x] Wire `onLongPress` into at least one context-menu surface (or document why skip)
      (2026-10-25: long-press on a message row opens the existing message context
      menu via `openContextMenu`)
- [x] `src/frontend/touch.test.ts` unit tests defending observable contract:
      swipe direction + threshold, tap click-fallback under reduced-motion/non-touch,
      long-press timer + cleanup on cancel/unmount. Run `bun test src/frontend/touch.test.ts`.
- [x] `bun run check` green; no lint errors introduced
- [ ] Sidebar inline swipe logic may be consolidated onto the util (optional,
      non-blocking) so there is one touch implementation, not two (skipped:
      optional AC; the sidebar swipe tracks mid-gesture and stays as-is)

## Notes / Risks

- Do **not** restore `app.ts`/`vendor.ts` — they are superseded by `alpine-init.ts`
  (single bundle; reverting would reintroduce the Alpine module-copy bug).
- The recovered util is the *implementation seed*; wire it, don't fork it into
  `a11y/touch-gestures.ts` without consolidating (one source of truth per epic).
- Touch handlers must remain passive + cleanup-safe (they already return cleanup fns).

## Linked Epics

- `epic-accessibility-input.md` (Phase 2)
- `epic-frontend-component-architecture.md`
