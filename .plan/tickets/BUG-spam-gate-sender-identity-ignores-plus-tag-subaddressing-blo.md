<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Spam-gate sender identity ignores plus-tag subaddressing: blocklist and per-sender bucket are bypassable

**Status:** Not Started
**Priority:** medium
**Effort:** Medium

**Summary:**

Location: src/integrations/email/spam-gate.ts:93-96 (senderAddress identity), consumed at :123 (blockList), :130 (per-sender bucket key), :142 (allowList).

Evidence: senderAddress() only angle-extracts and lowercases - no +tag local-part strip - so each subaddressed variant is a fresh identity: block/allow lists and the per-sender token bucket are bypassable via subaddressing.

Verification: REPRODUCED - probe .tmp/glm-review/verify/sender-adapter.ts: decisive output 'senderAddress(Attacker+tag@evil.io) = attacker+tag@evil.io' (tag retained) and, through the real createEmailSpamGate with blockList [attacker@evil.io], mail from Attacker+tag@evil.io -> deliver (not reject blocked_sender) - blocklist bypassed end-to-end.

Impact: a blocked sender re-gains delivery (and a fresh bucket) by appending +anything to their address.

Fix: normalize the local part (strip +suffix) before list lookup and bucket keying.

Source: .tmp/glm-review/deep-integrations-1015.md F-5 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
