<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: TUI markup injection, unencoded URLs, and shutdown hygiene

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

Five defects in the TUI and transport layer, all verified on dev.

1. Blessed markup injection. src/tui/chat/display.ts:11-16, src/tui/chat/index.ts:224, src/tui/asset-view.ts:107-114, src/tui/harness/display.ts:48-58 and :97-103, src/tui/app.ts:135 all render with tags enabled while interpolating message.content, actorName, asset.filename and alt_text, result.error and status strings without escaping braces. A crafted message or asset field can recolour or rearrange the panel. Escape braces in untrusted strings, or render data-driven panels with tags disabled.

2. Unencoded URL segments. src/tui/chat/api.ts:32 and :77 interpolate host.chatId into a path and cursor into a query string; src/tui/asset-view.ts:206 and src/tui/harness/api.ts:57,:70 do the same with runId. Percent-encode each dynamic segment.

3. No transport teardown on shutdown. src/tui/app.ts:145-148 exits after destroying the screen without calling transport.close(), so the ping interval at src/transport/ws.ts:69-72 (cleared only inside close at :139-149) and the one-shot open listener at :89 survive until process death. Sequence destroy-screen, await close, then exit.

4. Config-supplied DB filename is trusted. src/scripts/log-query.ts:209-218 and src/scripts/migrate-character-legacy.ts:200-207 open sqliteFilename directly; readonly helps in log-query but not everywhere. Resolve against a configured root and reject traversal.

5. API base URL is unvalidated. src/tui/chat/api.ts:7 and src/tui/harness/api.ts:5 use LOOP_LORE_API_BASE_URL verbatim, with no scheme or host validation, so the TUI can be pointed at any endpoint.

Source: .tmp/cat-jam/review-tui-scripts.md P1-2, P1-3, P2-1, P2-2, P2-3.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
