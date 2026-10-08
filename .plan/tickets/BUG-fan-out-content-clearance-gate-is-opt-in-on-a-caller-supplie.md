<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Fan-out content-clearance gate is opt-in on a caller-supplied chatId

**Status:** Wontfix
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


## Resolution

Not reachable: `fanOutContent` (`src/federation/fan-out.ts:143`) has zero
production callers. The only references are `src/federation/clearance.test.ts`,
`src/federation/sharing.test.ts`, and
`docs/review/federation-local-multi-instance-review.md:63`. No production path
can pass chat-derived content without `chatId`, so the opt-in gate cannot be
bypassed today.

Latent issue recorded for whoever wires the sender trigger: `chatId?: string`
on `FanOutContent` (`src/federation/fan-out.ts:49`) is held only by the doc
comment at `:43-48`. When a federation sender trigger is wired, `chatId` must
become REQUIRED at the chat-content entry point — enforced by the call site's
type, not by inverting this condition. Inverting `content.chatId !== undefined`
would break the deliberate non-chat blob path exercised by
`src/federation/sharing.test.ts:555` and `src/federation/clearance.test.ts:177`.
