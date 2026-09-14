<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: tui: dedupe API_BASE constant between app.ts and chat/api.ts

**Status:** ⬜ Not Started
**Priority:** low
**Effort:** trivial

## Summary

`src/tui/app.ts:17` declares `const API_BASE = process.env.LOOP_LORE_API_BASE_URL ?? "http://localhost:3000";` (used only for display in the status bar at line 114). `src/tui/chat/api.ts:7` declares the same constant (used in 3 request URL constructions). `API_BASE` is already re-exported from `src/tui/chat/index.ts:21` (`export { API_BASE } from "./api"`), so `app.ts` could import from `./chat` instead of redeclaring.

## Acceptance Criteria

- [ ] `src/tui/app.ts` deletes its local `API_BASE` and imports from `./chat` (the existing re-export).
- [ ] Both sites show identical values at runtime (verify with `console.log` smoke or unit test).
- [ ] No behavior change.

## Notes

- Deferred from `tui-updates` worktree (2026-09-14 review pass): trivial but the edit lives in untestable `app.ts`.
- Pure deduplication; no contract change.