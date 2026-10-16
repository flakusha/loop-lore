<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: TUI send inherits the 30s default safeFetch timeout against blocking LLM generation

**Status:** Done
**Priority:** critical
**Effort:** Medium
**Epic:** epic-terminal-ui

**Summary:** `ChatWidget.send()` used the default `safeFetch` timeout of 30 seconds, which is too short for LLM generation requests that can block for minutes. Long-running generations would time out client-side even when the server was actively processing.

**Context:** `src/tui/chat/api.ts` called `safeFetch` without an explicit `timeoutMs`, inheriting the 30s default. The `handleSend` path needed a configurable timeout tuned to generation workload duration.

**Fix:** `[tui].sendTimeoutMs` config key added to `src/config/sections/tui.ts` and threaded through `config.tui.sessionToken` and the `ChatHost` into `handleSend`. The default is now a longer, tunable value suited to blocking LLM generation.

**Resolution:** Fixed by `3cdc0cd0a` — `[tui].sendTimeoutMs` config, threaded into `handleSend` in `src/tui/chat/api.ts`. `src/tui/chat/send-timeout.test.ts` added to cover the timeout behavior.

**Acceptance Criteria:**

- [x] `[tui].sendTimeoutMs` config key exists and is read by the send path
- [x] `handleSend` passes explicit timeout to `safeFetch`
- [x] Timeout value is tunable via config

**git issue:** d07e0df
