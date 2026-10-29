<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: web: preserve error bodies plus per-chat send timeout plus stream-never-opened fallback

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-shared-client-sdk
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

HarnessReuse Group-5 web port (T14): preserve error bodies + per-chat send timeout + stream-never-opened fallback.

**Ground state (TUI leads):** Create-error preservation — raw `fetch` in `src/tui/chat-create-api.ts:46-55` keeps the 403 body (`safeFetch` drops it, `:32-35`). Web `safeFetch` consumers (`src/tui/harness/api.ts`, `models-api.ts:144-158`, `asset-view.ts`) map to `HTTP <n>` / `admin only` — same body-loss class. Send-timeout override: `sendTimeoutMs` from `TUI_DEFAULTS` through `ChatWidgetOptions` (`src/tui/chat/types.ts:25-26`) → POST `timeout: host.sendTimeoutMs` (`api.ts:83`), pinned by `send-timeout.test.ts:99-120`; web generation POST has no per-chat override surfaced. Fallback: `showTyping`/`hideTyping` (`index.ts:352-370`) + `loadMessages` fallback (`api.ts:108`) when the stream never opens; web SSE path has spinner/`isGenerating` but no REST fallback.

**Adopt/adapt/defer:** Port direction TUI → web. Web-side equivalents are thin: MDN `EventSource.onerror` + comment keepalive for the fallback case; Elysia `.group(prefix, opts, cb)` for scoping the timeout/override options per route group instead of per call.

**Acceptance criteria:**

- [ ] Generation/message POST failures surface the server's `{error, code}` body instead of `HTTP <n>` (port of `chat-create-api.ts` raw-body rule, scoped to chat/generation calls).
- [ ] Per-chat send timeout override (port of `sendTimeoutMs`).
- [ ] SSE that never opens falls back to status-poll + transcript reload (port of TUI fallback), reusing Group-1 T2 `retry:` semantics.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
