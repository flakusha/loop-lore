<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Add consent route and UI to grant and revoke chat federation consent

**Status:** Not Started
**Priority:** high
**Effort:** Medium
**Epic:** epic-local-multi-instance-federation

**Summary:**

grantChatFederationConsent and revokeChatFederationConsent (src/federation/clearance.ts:114,130) have no HTTP route, so chats.federation_consented_at can never be set and authorizeChatExport (src/federation/clearance.ts:74-107) is permanently default-deny. Nothing can cross instances without this, and no path exists to open the gate. Add an authenticated route plus a per-chat control that calls grant/revoke. Default-deny must be preserved: consent is explicit opt-in, never implicit, and never granted by default on chat creation. Assumption pending decision D4 in docs/review/federation-local-multi-instance-review.md: chat owner only. Acceptance: a chat owner can grant and revoke consent from the chat UI; authorizeChatExport flips from deny to allow on grant and back on revoke; a non-owner cannot grant; the existing TOCTOU behaviour tracked by BUG-consent-toctou-revoking-a-chat-consent-during-a-fan-out-roun.md is not regressed.

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
