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
