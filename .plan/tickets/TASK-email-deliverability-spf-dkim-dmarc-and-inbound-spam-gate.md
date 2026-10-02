<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- SPDX-FileCopyrightText: 2026 giwt Contributors -->

# TASK: Email deliverability (SPF/DKIM/DMARC) and inbound spam gate

**Status:** Not Started
**Priority:** medium
**Effort:** Medium
**Epic:** epic-email-integration

**Summary:**

Adopted component: ground-up (policy) over nodemailer/imapflow. Seam: src/integrations/email/deliverability.ts (new) + src/integrations/email/spam-gate.ts (new). Outbound: SPF/DKIM/DMARC guidance + DKIM signing hook when sending from the operator's own domain; deliverability docs. Inbound: sender allow/block lists, per-sender rate limit, spam-score threshold, quarantine folder for mail failing the moderation gate. Cross-link: epic-auth-channel-provisioning.md F5 (address-change re-verification). AC: DKIM signing fixture test; spam gate quarantine fixture; sender blocklist consulted by bridge; docs/spec/federation-email-channel.md §7 updated. Epic: epic-email-integration.md

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated
