<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI: fire-and-forget `void` without `.catch()`

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** Not Started
**Priority:** low
**Effort:** Small
**Epic:** epic-terminal-ui

## Summary

The branch has several `void <asyncCall>()` sites whose rejection is not handled. The repo's `.agents/references/banned-patterns.md` bans "fire-and-forget `void` without `.catch()`".

However, many of these sites call functions that are already safe by design — they catch internally and surface errors via a Result return or via the UI (e.g., `showError`, `renderInfo`), never propagating a rejection. These require no change.

### Sites that ARE safe by design (no change needed)

These callees catch internally and never reject:
- `loadAssets` (`asset-view.ts:220-254`) — catches internally, calls `renderInfo` on failure
- `loadMessages` (`chat/api.ts:153-179`) — catches internally, calls `host.showError` on failure
- `handleSend` (`chat/api.ts:43-96`) — catches internally, calls `host.showError` on failure
- `loadPublicProviders` (`models-api.ts`) — returns `Promise<ModelsFetchResult<...>>`, a Result type that never rejects
- `commitCreate` (`chat-create-api.ts`) — returns `ChatCreateResult`, a Result type that never rejects; called in a context that handles the result

### Sites that MAY need `.catch()` (verify before fixing)

- `src/tui/app.ts:203-214` — `void (async () => { const result = await loadPublicProviders(); ... })()` — `loadPublicProviders` is a Result-returning function (never rejects), so technically safe; but the IIFE pattern is flagged by the banned-patterns rule. Consider refactoring to avoid the IIFE altogether, or add `.catch()` for compliance.

### Sites with explicit try/catch already in place (compliant)

- `src/tui/app-keys.ts:151-171` — `void (async () => { try { await chat.loadMessages(); } catch { ... } })()` — has explicit try/catch, not a silent catch

### Sites that are safe but use the pattern (documented)

The following sites call Result-returning or self-caching functions and are technically safe, but use the `void fn()` form:
- `src/tui/app.ts:116` — `void this.chat.loadMessages()` — `loadMessages` catches internally, safe by design
- `src/tui/chat/index.ts:169` — `void this.handleSend(...)` — `handleSend` catches internally, safe by design
- `src/tui/harness/index.ts:180` — `void this.showDetail(0,)` — called after a successful `loadRuns` result, `showDetail` catches internally
- `src/tui/chat-picker.ts:223` — `void this.refresh()` — `refresh` (from `src/tui/chat-picker.ts:100`) returns `ChatListResult`, catches internally
- `src/tui/chat-picker.ts:283` — `void this.commitCreate(...)` — returns `ChatCreateResult`, caller handles the result
- `src/tui/models-overlay.ts:146` — `void this.onSelect(...)` — `onSelect` catches internally, returns via `showStatus`
- `src/tui/models-overlay.ts:153` — `void this.onClear()` — `onClear` catches internally
- `src/tui/models-overlay.ts:157` — `void this.onRescan()` — `onRescan` catches internally
- `src/tui/models-overlay.ts:174` — `void this.onSelect(...)` — same as above
- `src/tui/models-overlay.ts:181` — `void this.onPing()` — `onPing` catches internally

## Acceptance Criteria

- [ ] All `void <asyncCall>()` sites audited; those calling Result-returning or self-caching functions documented as safe
- [ ] Any site whose callee can actually reject has a `.catch()` attached
- [ ] Lint clean (no banned patterns)

## Notes

- Safe-by-design sites should be left as-is; adding `.catch()` to them would be unnecessary churn
- The `app.ts:203` IIFE is the primary compliance gap worth addressing


git issue: 9ec5332
