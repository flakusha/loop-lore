<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: OpenAI-compatible streaming body has no idle/read timeout after headers

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

src/generation/providers/openai-compatible/http.ts:151: after response headers, the streaming body read has no idle/read timeout - a provider that stalls mid-stream (headers sent, no body progress) hangs the SSE connection forever, pinning the client request and the generation slot. Fix: idle timer on body chunks (reset per chunk, abort on expiry) or an overall stream deadline; cover with a fake stalled-provider test.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/generation/providers/openai-compatible/http.ts:151-171 has a single setTimeout(state.timeout) around fetch(), cleared in finally immediately after headers, with no coverage of the body read; src/generation/providers/openai-compatible/core.ts:71 response.body?.getReader() loop has no per-chunk timer/deadline. Worktree scan across all 38 trees: zero idle/per-chunk/deadline timers in that file.
