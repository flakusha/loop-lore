<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: tui/app.ts calls getLogger() without prior createLogger() — runtime crash on first F5 failure

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** ✅ Done
**Priority:** medium
**Effort:** small

## Summary

`src/tui/app.ts:86-88` calls `getLogger().child({ module: "tui" }).error(...)` inside the F5 catch block. The TUI runs as a standalone binary (`bun run src/tui/app.ts`); the global logger is never initialized. On the first F5 keypress where `loadMessages()` throws, the `getLogger()` call itself throws `"Logger not initialized — call createLogger() first"`, which propagates as an unhandled rejection inside the `void (async () => { ... })()` IIFE and crashes the process.

Reproduction:

```bash
bun run src/tui/app.ts
# in TUI: press F5 (with backend unreachable) → process crashes
```

Verified with `bun -e "import { getLogger } from './src/logger'; getLogger()"` → throws.

## Acceptance Criteria

- [ ] Logger initialized before any code path can call `getLogger()`. Add `createLogger({ level: "warn" })` at module top of `src/tui/app.ts` (above `const app = new TUIApp()`).
- [ ] Pressing F5 against an unreachable backend no longer crashes the TUI process; the failure is surfaced as a status-bar message.
- [ ] No regression: TUI startup, screen layout, asset toggle, message send/load all behave as before when logger is initialized.

## Notes

- `src/tui/app.ts` and `src/tui/asset-view.ts` instantiate blessed widgets at module load; they are not unit-testable without a TTY. This ticket is therefore untestable in isolation — verification is via manual smoke run + the F5 failure reproduction.
- Deferred from `tui-updates` worktree (2026-09-14 review pass): not landed alongside the `chat/api.ts` `auth:` migration because that change kept coverage gates green; this one would require an entry-point coverage waiver or refactor of `app.ts` to make it testable.

## Resolution

- `src/tui/app.ts:14,137-141` — `createLogger({ level: "warn" })` added at module top, above `const app = new TUIApp()` (the ticket's own prescribed fix).
- Empirical proof (2026-09-15): `.tmp` script reproducing the startup shape — without `createLogger`, the constructor's `loadConfig()` throws from `runTemplateExpansion` (`getLogger()` is called unconditionally at `src/config/template-expansion/run.ts:37` via `src/config/load/load.ts:125`) and the catch block's `getLogger().warn` rethrows → process exit 1; with `createLogger` first, config loads and the run exits clean.
- Landing via `tui-logger-init` (same session as the sessiontoken batch) — the sessiontoken diff's `loadConfig()` call in the constructor had converted this latent F5-path crash into an unconditional startup crash; this fix resolves both.