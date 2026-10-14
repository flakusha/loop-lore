<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: buildRecentEvents matches chat ids with an unbounded LIKE prefix

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

The recent-events query filters on link with LIKE %chatId%, so a chat id that is a prefix of another chat id matches the wrong events: chat 'abc' matches /chat/abcd.

Evidence read on dev:

- src/notifications/service/crud.ts:161 — .where('link', 'like', `%%`)

Fix: match the exact link value (where link = '/chat/' + chatId) or anchor the LIKE with a trailing delimiter.

Source: .tmp/longcat/review-misc-services.md n4.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
