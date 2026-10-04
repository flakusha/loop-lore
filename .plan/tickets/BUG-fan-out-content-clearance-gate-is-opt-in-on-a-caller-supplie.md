<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Fan-out content-clearance gate is opt-in on a caller-supplied chatId

**Status:** Not Started
**Priority:** medium
**Effort:** Small
**Tags:** security, federation

**Summary:**

fanOutContent (src/federation/fan-out.ts:162-172) runs authorizeChatExport only when content.chatId !== undefined; the field doc says chat content must set it, but nothing enforces the contract. Any future caller pushing chat-derived content without chatId replicates it with no consent check, defeating the default-deny guarantee (clearance.ts:6-8). The DEK path is type-gated via ChatClearance; content envelopes are not. No production caller exists yet, so the contract shape is cheap to fix. Fix: structural chat discriminator on chat content, or derive/verify chatId from the content envelope at the delivery layer.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
