<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# BUG: fix(auth): content-negotiate the 429 rate-limit response like other auth errors

**Status:** Done
**Priority:** low
**Effort:** Medium
**Epic:** epic-error-envelope

**Summary:**

Sources: stream-c #9 (narrowed: the htmx-200 half of the original finding is intentional per BUG-auth-login-silent-fail and is not contested). Where: src/routes/auth/request.ts:61-75 (rateLimitHtml, always HTML); src/routes/auth/responses.ts:40-53, :101-120 (wantsJson negotiation). Gap: errorResponse negotiates JSON-4xx vs HTML-200 by client, but the 429 path always returns text/html with no {error, code, meta} body - JSON clients that handle every other auth error as JSON break specifically on rate-limit backoff. Acceptance: wantsJson clients receive the JSON envelope (with Retry-After/X-RateLimit-* headers); htmx clients keep the HTML body. Priority: low - JSON-client robustness on the backoff path; headers already correct.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 7a46501 (registry tip: 19e1f5581 Konstantin Fedotov Close issue)
