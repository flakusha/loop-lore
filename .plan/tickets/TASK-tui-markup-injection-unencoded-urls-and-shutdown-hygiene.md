<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI markup injection, unencoded URLs, and shutdown hygiene

**Status:** In Progress
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

- [ ] Defect 1 (markup injection): all untrusted strings in blessed markup calls are brace-escaped or rendered with `tags: false`
- [ ] Defect 2 (unencoded URLs): all dynamic URL segments are wrapped in `encodeURIComponent`
- [ ] Defects 1–2 implementation complete
- [ ] Tests passing
- [ ] Documentation updated (markup escaping policy documented)
