<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: tui.enabled config flag mapped from env but never read at runtime

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Done
**Priority:** low
**Effort:** small
**Epic:** epic-terminal-ui

## Summary

`src/config/schema-class/env-map.ts:110` maps `ENABLE_TUI` → `tui.enabled`. `src/config/schema/tui.ts` declares `TuiConfig { enabled: boolean }`. Default is `true` (`src/config/sections/tui.ts:9`).

But no runtime code reads `config.tui.enabled`. The TUI binary is gated solely by the `bun run tui` script invocation; an admin who sets `ENABLE_TUI=false` expecting the binary to refuse or no-op gets silent acceptance.

Either:
- (a) Wire the flag: TUI startup reads `loadConfig().tui.enabled` and exits with a clear message if false.
- (b) Remove the flag: delete `TuiConfig.enabled`, the env mapping, the section default, the schema entry, and the JSON Schema fragment.
- (c) Leave as-is and document: the flag is reserved for future gating (e.g., "TUI disabled in production").

## Acceptance Criteria

- Decision recorded in ticket resolution block.
- If (a): `bun run tui` with `ENABLE_TUI=false` exits 0 with message `"TUI disabled by config"`. Config gate at app startup.
- If (b): all references to `tui.enabled` / `TuiConfig.enabled` removed from `src/`. Config schema regenerates cleanly. No other code path breaks.
- If (c): no-op.
- Tests: a small unit test on the chosen path (or removal doesn't break any existing test).

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): requires design decision; default (c) is fine but should be deliberate.
**Resolved:** 2026-10-16 registry-driven close: git issue 74304e5 (registry tip: 1246b2197 Konstantin Fedotov Auto-closed: appended .md marker marks TASK-TUI-ENABLED-CONFIG-FLAG-NEV)

## Related Files

- `src/tui/app.ts` (`TUIApp` constructor gate, `TUI_DISABLED_STATUS`)
- `src/config/sections/tui.ts` (`TUI_DEFAULTS.enabled`)
- `src/tui/app.test.ts` (gate + unreadable-config fallback)

**Resolved:** 2026-10-16 — option (a), wire the flag. `TUIApp` reads `loadConfig().tui.enabled`; when false it paints `TUI_DISABLED_STATUS` on the status bar and exits 0 before any widget is built. An unreadable config falls back to `TUI_DEFAULTS.enabled` (true) so a broken file never silences the shell. `shutdown()` is typed `never` (`process.exit` is), which is what lets the constructor return early without leaving `chat`/`assets`/`harness`/`chatPicker` half-typed.
