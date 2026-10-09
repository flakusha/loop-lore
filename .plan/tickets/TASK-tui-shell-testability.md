<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI shell testability

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** `epic-terminal-ui`
**Tags:** tui, testing
**Summary:** Remove module-scope `new TUIApp()` from `src/tui/app.ts:157` and put screen construction behind an injectable factory so the TUI modules are constructible under test.
**Context:** `src/tui/app.ts:157` runs `new TUIApp()` at module scope and the constructor calls `blessed.screen()` at `src/tui/app.ts:41`, so importing the module blocks on terminal events in any non-TTY context. `src/tui/asset-view.ts:44` (`blessed.box()`) and `src/tui/harness/index.ts:53,67` have the same constructor problem. The pattern is already proven in-tree: the `createHarnessView` factory in `src/tui/harness/index.ts`. Consequence today: `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` are blocked ONLY because they live in untestable files, and `src/tui/chat/index.ts` carries a per-file coverage waiver in `scripts/check/coverage.mjs`.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [ ] Module-scope `new TUIApp()` removed from `src/tui/app.ts:157`, replaced by an exported factory mirroring the proven `createHarnessView` pattern in `src/tui/harness/index.ts`.
- [ ] Screen construction moved behind an injectable factory so `src/tui/asset-view.ts:44` and `src/tui/harness/index.ts:53,67` become constructible under a `mock.module('blessed')` stub — importing any `src/tui/` module must no longer touch a real terminal.
- [ ] The per-file coverage waiver for `src/tui/chat/index.ts` in `scripts/check/coverage.mjs` is retired once the shell is covered.
- [ ] `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` are unblocked (no other blocker remains).
- [ ] `bun run check` green with NO new coverage waiver added — the fix removes a waiver, it does not trade one for another.

## Related Files

- `src/tui/app.ts:41,157`, `src/tui/asset-view.ts:44`, `src/tui/harness/index.ts:53,67` (`createHarnessView`)
- `src/tui/chat/index.ts`, `scripts/check/coverage.mjs`
- `.plan/epics/epic-terminal-ui.md`
- `TASK-tui-dedupe-api-base.md`, `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`, `TASK-tui-chat-picker`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

git issue: 47b85ad
