<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# BUG: Webhook dedup is recorded before dispatch, so a handler throw makes provider retries silently swallowed

**Status:** Not Started
**Priority:** high
**Effort:** Small
**Tags:** integrations

**Summary:**

src/integrations/bridge.ts:196-198 records the dedup key (seen.set) BEFORE handler(message); the JSDoc throw contract at bridge.ts:79-80 only holds for the inbound gate at :193. When the handler throws, the first delivery 500s (no catch around ingestWebhook at src/routes/v1/integrations-surface.ts:249-251), the provider retry is deduped at bridge.ts:184, and the surface answers 202 {ok:true,dispatched:false} (integrations-surface.ts:254-258) so the provider stops retrying: the message is permanently lost for the 24h dedup TTL (bridge.ts:86). Reproduced by executing .tmp/verify-concerns.ts: F1 firstThrew true, dispatch attempts 1, redelivery dispatched false. Same swallowed-redelivery class 89ead11d0 fixed for the gate, left unfixed one line later for the handler. Fix: move seen.set after handler(message), or seen.delete(key) in a catch that still propagates; add a handler-throws regression test mirroring bridge.test.ts:415-434.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
