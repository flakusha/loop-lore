<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI markup injection, unencoded URLs, and shutdown hygiene

**Status:** Done
**Priority:** Medium
**Effort:** Medium
**Epic:** epic-terminal-ui

**Summary:**

Five defects in the TUI; two are real and actionable, one is stale, one is out of scope, one is low-value.

## Defects

**Defect 1 (blessed markup injection) — REAL.** Lines to fix:
- `src/tui/chat/display.ts:14-16` — `message.actorName` and `message.role` interpolated into `{bold}...{/bold}` without escaping braces.
- `src/tui/chat/index.ts:330` (`showError`) — `message` parameter interpolated into `{red-fg}⚠ Error: ${message}{/red-fg}` without escaping braces.
- `src/tui/asset-view.ts:128-136` — `asset.filename`, `asset.asset_type`, `asset.mime_type`, `asset.alt_text` interpolated into blessed markup without escaping braces.
- `src/tui/harness/display.ts:61` — `task` (from `summary.task`) interpolated into markup without escaping.
- `src/tui/harness/display.ts:69-110` (`formatRunDetail`) — `detail.task`, `detail.error`, `detail.gitSha`, `detail.branch`, `detail.msg`, `detail.pattern`, `detail.patternDetail`, `detail.toolingGap`, `detail.tools`, `detail.runId`, `detail.ts`, `detail.model`, `detail.taskType`, `detail.result`, `detail.pid`, `detail.turnId` all interpolated without escaping.
- `src/tui/app.ts:175-177` — `API_BASE` interpolated into status bar content without escaping.

A crafted message or asset field can inject blessed tags to recolour or rearrange panels. Escape `{`/`}` in untrusted strings, or render data-driven panels with `tags: false`.

**Defect 2 (unencoded URL segments) — REAL.** Lines to fix:
- `src/tui/chat/api.ts:59` — `${API_BASE}/api/v1/chats/${host.chatId}/messages` — `host.chatId` is unencoded.
- `src/tui/chat/api.ts:107-108` — `host.chatId` in path and `host.cursor` in query string, both unencoded.
- `src/tui/asset-view.ts:227` — `this.chatId` unencoded in entity_id query param.
- `src/tui/harness/api.ts:72` — `runId` unencoded in path.

Percent-encode each dynamic segment with `encodeURIComponent`.

**Defect 3 (transport teardown) — STALE / NOT A TUI DEFECT.**
An exhaustive grep of `src/tui/` for `transport|WebSocket|ws://|wss://` returns **zero production matches**. The TUI opens no WebSocket; there is no `transport.close()` to call and no ping interval to leak. The shutdown path (`app.ts:212-215`) destroys the blessed screen and exits. Strike from actionable scope.

**Defect 4 (config DB filename) — OUT OF SCOPE.**
Lives in `src/scripts/log-query.ts` and `src/scripts/migrate-character-legacy.ts`, not `src/tui/`. Belongs to a scripts/DB-hardening ticket.

**Defect 5 (API_BASE unvalidated) — LOW VALUE / OPTIONAL.**
`src/tui/chat/api.ts:7` and `src/tui/harness/api.ts:5` use `LOOP_LORE_API_BASE_URL` verbatim. Misconfigured env vars fail at first fetch (visible in status bar). Optional fix: validate scheme+host on startup.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [x] Defect 1 (markup injection): all untrusted strings in blessed markup calls are brace-escaped
- [x] Defect 2 (unencoded URLs): all dynamic URL segments are wrapped in `encodeURIComponent`
- [x] Defects 1–2 implementation complete
- [x] Tests passing
- [x] Resolution recorded

## Resolution

**Markup escaping (Defect 1):**

New shared helper `src/tui/markup.ts` exports `escapeMarkup(text)` — a typed wrapper around `blessed.helpers.escape` (untyped in `@types/blessed`). Replaces `{` with `{open}` and `}` with `{close}` so blessed's tag parser renders literal braces.

Sites escaped:
- `src/tui/chat/display.ts` — `formatMessageLine`: `message.actorName`, `message.role`, truncated `message.content`
- `src/tui/chat/index.ts` — `showError`: `message` parameter
- `src/tui/asset-view.ts` — `renderCurrent`: `asset.filename`, `asset.asset_type`, `asset.mime_type`, `asset.alt_text`
- `src/tui/harness/display.ts` — `formatRunLine`: `task`, `model`, `result`; `formatRunDetail`: `runId`, `task`, `taskType`, `model`, `result`, `error`, `tools.join(", ")`, `pattern`, `patternDetail`, `toolingGap`, `branch`, `gitSha`, `turnId`, `msg`
- `src/tui/app.ts` — `updateStatus`: `msg`, `API_BASE`
- `src/tui/models-display.ts` — `formatProviderHealth`: provider `name`

**URL encoding (Defect 2):**

Sites wrapped with `encodeURIComponent`:
- `src/tui/chat/api.ts` — `handleSend`: `host.chatId`; `loadMessages`: `host.chatId`, `host.cursor`
- `src/tui/asset-view.ts` — `loadAssets`: `this.chatId` (entity_id query param)
- `src/tui/harness/api.ts` — `loadRuns`: `limit`; `loadRunDetail`: `runId`
- `src/tui/models-api.ts` — `loadProviderModels`: `provider` (path segment)

**Tests added:**
- `src/tui/chat/display.test.ts` — 4 escaping tests (actorName, role, content, both braces)
- `src/tui/harness/display.test.ts` — 6 escaping tests (task/model/result in formatRunLine; error/task/msg in formatRunDetail)
- `src/tui/chat/api.test.ts` — 4 URL encoding tests (chatId with `/`, `?`; cursor with `/` and `?`)
- `src/tui/harness/api.test.ts` — 2 URL encoding tests (runId with `/`, `?`)
- `src/tui/asset-view.test.ts` — 2 URL encoding tests (chatId with `/`, `?`)

**Verification:** `bun test src/tui/` — 174 pass, 106 skip, 0 fail. Typecheck, ESLint, and dprint all clean.
