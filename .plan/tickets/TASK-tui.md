<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Terminal UI (TUI) — modernize chat/api.ts + add unit tests

**Effort:** Medium
**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)


**Status:** open
**Priority:** Medium
**Epic:** epic-terminal-ui

## Summary

Modernize the TUI chat layer's request wiring and add coverage. The current `src/tui/chat/api.ts` builds an `Authorization` header manually via a local `getAuthHeaders` helper. The codebase already exposes `safeFetch`'s `auth: { sessionToken }` parameter (`src/utils/safe-fetch/headers.ts:29-31`) used by `src/frontend/fe-fetch.ts:69` and `src/frontend/alpine/transports/server.ts:45`. Switching to the shared helper drops duplicated logic. Three test files pin the contract.

## Linked Epics

- `epic-terminal-ui.md`

## Subtasks

- [x] Switch `chat/api.ts` `safeFetch` calls from `headers: getAuthHeaders(token)` to `auth: { sessionToken: token }`; delete the local helper.
- [x] Add `src/tui/chat/api.test.ts` — stub `globalThis.fetch`; cover `handleSend` and `loadMessages` happy + error paths; assert outgoing `Authorization` header.
- [x] Add `src/tui/chat/display.test.ts` — `formatMessageLine` truncation + prefix.
- [x] Add `src/tui/nsfw-filter.test.ts` — all four filter modes + `isNsfw` + keyword add/remove.

## Related (deferred to follow-up tickets)

- `BUG-tui-app-getlogger-throws-when-running-standalone.md` — F1 logger init in `app.ts`.
- `BUG-tui-app-never-threads-sessiontoken-into-chatwidget.md` — F2 session token wiring.
- `TASK-tui-dedupe-api-base.md` — F3 dedupe constant.
- `TASK-tui-asset-view-remove-silent-catch-and-void-async-iife.md` — F5/F6 cleanup.
- `TASK-update-terminal-ui-spec-to-actual-file-layout.md` — F8 spec drift.
- `TASK-tui-enabled-config-flag-never-read.md` — F9 dead config flag.

## Acceptance Criteria

- [x] `chat/api.ts` no longer declares a local `getAuthHeaders` function.
- [x] `safeFetch` call sites use `auth: { sessionToken: host.sessionToken }`.
- [x] Body pre-stringify (`safeJsonStringify` + `"{}"` fallback) preserved per codebase convention.
- [x] `bun test src/tui/` passes.
- [x] `bun run typecheck`, `bun run format`, `bun run lint:eslint`, `bun run dead:code` all RC=0.
- [x] Coverage ≥80% on touched files.
- [x] No behavior regression in `handleSend` / `loadMessages` wire format beyond the documented GET-drops-`Content-Type` delta.

## Resolution

Landed on `tui-updates` (2026-09-14). Diff: chat/api.ts (header injection swap), three new test files. GET requests no longer carry `Content-Type: application/json` (safeFetch omits it when body is undefined); no server-side impact since GET has no body to type.