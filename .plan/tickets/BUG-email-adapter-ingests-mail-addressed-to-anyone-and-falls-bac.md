<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# BUG: Email adapter ingests mail addressed to anyone and falls back to an unvalidated first To entry as bridge target

**Status:** Done
**Status Note:** [2026-10-26 sweep-A verify] NOT-FIXED (issue 176dc92): Verified verbatim intact: src/integrations/email/adapter.ts:231-236 falls back to recipients[0] with no isEmailAddress filter on candidates and no default-deny; senderAddress (spam-gate.ts:93-95) still returns raw lowercased header values unvalidated.
**Priority:** high
**Effort:** Medium
**Epic:** epic-email-integration

**Summary:**

Location: src/integrations/email/adapter.ts:231-241.

Evidence: when the configured mailbox is not among the recipients, recipients[0] becomes the bridge target (:232-234) with no isEmailAddress check (the helper exists at :110-112 but guards only ownsTarget/send-side); the only guard is mailbox being undefined or empty (:236). All inbound entry points (webhook relay / IMAP poll) funnel here, so relay-facing this is unauthenticated ingestion of foreign mail with an attacker-influenced target/author taken raw from headers (:245) - senderAddress(undisclosed-recipients:;) returns the full lowercased raw value and passes the nonempty guard.

Verification: REPRODUCED - probe .tmp/glm-review/verify/sender-adapter.ts drives the real createEmailAdapter connected with mailboxAddress inbox@loop-lore.local: decisive output 'arm1 raw.to=[undisclosed-recipients:;] -> target = undisclosed-recipients:;' (a garbage group address accepted as bridge target) and 'arm2 raw.to=[Victim@anywhere.example] -> target = victim@anywhere.example' (mail addressed to a third party ingested; envelope.author = attacker@evil.io taken raw from the From header).

Impact: unauthenticated ingestion of third-party mail with attacker-controlled bridge target and author fields.

Fix: default-deny - require mailbox membership when mailboxAddress is configured; otherwise filter candidates through isEmailAddress before falling back.

Source: .tmp/glm-review/deep-integrations-1015.md F-3 (gitignored; recorded here verbatim).

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Acceptance Criteria:**

- [ ] Implementation complete
- [ ] Tests passing
- [ ] Documentation updated

**Resolved:** 2026-10-26 registry-driven close: git issue 176dc92 (registry tip: f6a8a6b14 Konstantin Fedotov Close issue)
