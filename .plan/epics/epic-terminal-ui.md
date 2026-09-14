<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# EPIC: Terminal UI (TUI)

**Status:** 🟡 Partially Built — blessed + blessed-contrib scaffolding shipped; integration hardening in progress
**Priority:** Low

## Summary

Implementation epic for Terminal UI (TUI). See `docs/spec/terminal-ui.md` for specification. Code lives in `src/tui/` (entry `app.ts`, chat split into `chat/{index,api,display,types}.ts`, asset sidebar `asset-view.ts`, NSFW filter `nsfw-filter.ts`).

## Scope

### Shipped (dev as of 2026-09)

- `src/tui/app.ts` — blessed screen + status bar + global shortcuts
- `src/tui/chat/` — ChatWidget class + dispatcher modules (handleSend, loadMessages) + formatMessageLine
- `src/tui/asset-view.ts` — asset sidebar with left/right nav
- `src/tui/nsfw-filter.ts` — NSFW content filter (pure logic, no live consumer yet)
- `src/config/sections/tui.ts` + env map — `tui.enabled` flag (mapped but not gated)

### Landed on `tui-updates` (2026-09-14)

- `src/tui/chat/api.ts` — switched to `safeFetch`'s `auth: { sessionToken }` parameter; dropped local `getAuthHeaders`.
- `src/tui/chat/api.test.ts` (NEW) — chat/api.ts contract coverage.
- `src/tui/chat/display.test.ts` (NEW) — formatMessageLine coverage.
- `src/tui/nsfw-filter.test.ts` (NEW) — NsfwFilter contract coverage.

### Deferred / Open

- `BUG-tui-app-getlogger-throws-when-running-standalone.md` — runtime crash on F5 failure.
- `BUG-tui-app-never-threads-sessiontoken-into-chatwidget.md` — auth header never sent.
- `TASK-tui-dedupe-api-base.md` — `API_BASE` declared twice.
- `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` — banned patterns in `setChatId`.
- `TASK-update-terminal-ui-spec-to-actual-file-layout.md` — spec drift (references `chat.ts` / `input.ts`).
- `TASK-tui-enabled-config-flag-never-read.md` — config flag has no runtime consumer.
- `TASK-adopt-bun-color-for-tui-colors.md` — adopt `Bun.color()` for theme.
- `TASK-adopt-bun-stringwidth-for-tui.md` — adopt `Bun.stringWidth()` for safe truncation (fixes `formatMessageLine` surrogate-pair split).

### Future (spec § "Future")

Theming, mouse support, thumbnails, command history, split views, custom keybindings, NsfwFilter integration into the live render path.

## Testability constraint

`src/tui/app.ts` and `src/tui/asset-view.ts` instantiate blessed widgets at module load; they are not importable in non-TTY environments (the blessed `screen()` call blocks waiting for terminal events). Direct unit-test coverage of these files requires either: (a) a TTY harness under Playwright, (b) a coverage waiver with a tracked ticket, or (c) refactor extracting the testable logic into pure helpers. Future TUI changes touching these files must budget for one of these options.

## Related Epics

- `docs/spec/tui.md` (note: spec file is `terminal-ui.md`; the link is historical)

## Tickets

- `TASK-tui.md` — umbrella task for the chat/api modernization + tests batch
- `BUG-tui-app-getlogger-throws-when-running-standalone.md`
- `BUG-tui-app-never-threads-sessiontoken-into-chatwidget.md`
- `TASK-tui-dedupe-api-base.md`
- `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`
- `TASK-update-terminal-ui-spec-to-actual-file-layout.md`
- `TASK-tui-enabled-config-flag-never-read.md`
- `TASK-adopt-bun-color-for-tui-colors.md`
- `TASK-adopt-bun-stringwidth-for-tui.md`