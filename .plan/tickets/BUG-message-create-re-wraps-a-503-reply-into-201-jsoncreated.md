<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Message create re-wraps a 503 reply into 201 jsonCreated

**Status:** Not Started
**Priority:** high
**Effort:** Medium

**Summary:**

src/routes/messages/create.ts:227-229 spreads reply.response?.json() into jsonCreated when the rule-based reply exhausted swipe retries - reply.ts:221-228 returns a 503 jsonError Response there, so the client gets 201 with an error body lacking the declared id: t.String() (response validation blows up) and the 503 is never seen. Fix: inspect reply.response.status; propagate non-2xx verbatim (plus context) instead of re-wrapping in jsonCreated.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

## Review 2026-10-04

OPEN on dev - src/routes/messages/create.ts:227-228 still does return jsonCreated({ ...(await reply.response?.json?.()), context }) whenever reply.replied; reply.ts returns a 503 jsonError on swipe-insert exhaustion (src/routes/messages/reply.ts:200, insert-message.ts:121-122), so the client still gets 201 with an error body. No worktree modifies create.ts.
