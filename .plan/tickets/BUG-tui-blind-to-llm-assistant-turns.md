<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: TUI blind to LLM assistant turns

**Status:** Done
**Priority:** high
**Effort:** Medium
**Epic:** epic-terminal-ui

**Resolution:** `src/tui/chat/api.ts` — when the 201 omits `assistantMessage`, `handleSend` now awaits `loadMessages()` so the streamed reply appears without a manual F5. Test: transcript-refresh case in `src/tui/chat/api.test.ts` (18 pass).
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

TUI reads only data.assistantMessage (src/tui/chat/api.ts:82). With LLM configured, reply.ts:91-107 fires triggerAutoGeneration detached and returns 201 {id,context} WITHOUT assistantMessage; the reply arrives over SSE, which the TUI has no client for. Assistant turn invisible until F5 (src/tui/app-keys.ts:156). Evidence: tree/interaction-surfaces-audit/.tmp/interaction-cycles.md ## Chat turn. Epic: epic-interaction-surfaces-audit.

**Context:**
Same POST /api/v1/chat/:id/reply endpoint serves both plain-reply and LLM paths; TUI only handles the plain shape.

**Acceptance Criteria:**
- [ ] Fix, or explicitly wontfix with reason

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
