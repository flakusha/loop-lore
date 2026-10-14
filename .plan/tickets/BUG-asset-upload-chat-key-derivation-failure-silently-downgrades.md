<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Asset upload chat-key derivation failure silently downgrades to public storage

**Status:** Not Started
**Priority:** Medium
**Effort:** Medium

**Summary:**

handleUpload catches deriveChatKeyForChat failure and falls through to chatKey = null, which stores the asset unencrypted. The catch cannot distinguish 'chat has no encryption configured' (expected) from 'key derivation threw' (a real error), so an infrastructure failure silently downgrades an encrypted-chat upload to public storage with no log line.

Evidence read on dev:

- src/assets/controller.ts:547-552 — catch { `/* Not in an encrypted chat - fall through to public storage */` chatKey = null; }

This is separate from the add-a-log family: the fix is to classify the failure (expected vs unexpected), not merely log it.

Source: .tmp/longcat/review-consolidated.md nit 4; .tmp/longcat/review-assets-db-frontend.md N13.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
