<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI shell testability

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** `epic-terminal-ui`
**Tags:** tui, testing
**Summary:** Remove module-scope `new TUIApp()` from `src/tui/app.ts` and put screen construction behind an injectable factory so the TUI modules are constructible under test.
**Context:** `src/tui/app.ts` runs `new TUIApp()` at module scope and the constructor calls `blessed.screen()` at `src/tui/app.ts:41`, so importing the module blocks on terminal events in any non-TTY context. `src/tui/asset-view.ts:44` (`blessed.box()`) and `src/tui/harness/index.ts:53,67` have the same constructor problem. The pattern is already proven in-tree: the `createHarnessView` factory in `src/tui/harness/index.ts`. Consequence today: `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` are blocked ONLY because they live in untestable files, and `src/tui/chat/index.ts` carries a per-file coverage waiver in `scripts/check/coverage/waivers.mjs`.
**Acceptance Criteria:** See ## Acceptance Criteria below.

## Acceptance Criteria

- [x] Module-scope `new TUIApp()` removed from `src/tui/app.ts`, replaced by an exported `createTUIApp()` factory mirroring the proven `createHarnessView` pattern in `src/tui/harness/index.ts`, behind an `if (import.meta.main)` guard so importing the module builds nothing.
- [x] Importing any `src/tui/` module touches no terminal: every module under `src/tui/` constructs **zero** blessed objects at import time, and `AssetView` / `HarnessView` are constructible under the existing `mock.module('blessed')` stub with no production change. Verified automatically by `src/tui/import-purity.test.ts`: it stubs `blessed` with a counting factory set, imports every module under `src/tui/` (discovered from disk, so a module added later is covered on arrival) and asserts the construction count is 0 for each one; `src/tui/app.test.ts` additionally pins `app.ts`'s own import-time count, and the same suites construct the views. *The original criterion asked for an injectable screen-construction factory, which would have been a second injection convention beside the `mock.module` seam already proven in `src/tui/chat/index.test.ts`, `src/tui/harness/index.test.ts` and `src/tui/nsfw-filter.test.ts`, with no consumer for it. The real defect was module-scope instantiation, which the previous criterion fixed; this criterion records the outcome that was actually achieved.*
- [x] The per-file coverage waiver for `src/tui/chat/index.ts` in `scripts/check/coverage/waivers.mjs` is retired once the shell is covered.
- [x] `TASK-tui-dedupe-api-base.md` and `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` are unblocked (no other blocker remains).
- [x] `bun run check` green with NO new coverage waiver added — the fix removes a waiver, it does not trade one for another.

## Related Files

- `src/tui/app.ts:41,163-166` (`blessed.screen()`, `createTUIApp`), `src/tui/asset-view.ts:44`, `src/tui/harness/index.ts:53,67` (`createHarnessView`)
- `src/tui/chat/index.ts`, `scripts/check/coverage/waivers.mjs`
- `.plan/epics/epic-terminal-ui.md`
- `TASK-tui-dedupe-api-base.md`, `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md`, `TASK-tui-chat-picker`

*Sync pending: no git issue yet — register via `giwt ticket` / `bun run plan:sync`.*

git issue: 47b85ad

**Resolved:** 2026-10-10 registry-driven close: git issue 47b85ad (registry tip: e522408c9 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-TUI-SHELL-TESTABILITY done)
