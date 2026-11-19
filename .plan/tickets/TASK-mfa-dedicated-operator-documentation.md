<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MFA dedicated operator documentation

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-auth-access.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

MFA email/messenger delivery, factor enrollment and step-up verification are shipped, but the release ticket's Documentation updated acceptance box is intentionally unchecked because no dedicated operator docs section exists.

**Evidence (dev 2026-11-18):** TASK-1-0-0-mfa-email-messenger-code-channel-first-metaapplication.md Status Note; tracker verification reconciliation line at TASK-epic-release-1-0-0.md records the unchecked AC; report .tmp/intercom/plan-wave/13-search-mfa.md.

**Scope:** add an operator section covering SMTP/Telegram setup, factor enrollment, recovery and the TOTP deferral; link it from the release notes; no code changes.

**Acceptance Criteria:**

- [ ] operator docs section exists
- [ ] tracker Documentation updated AC can be checked
- [ ] i18n keys for any new UI strings reconciled

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Resolved:** 2026-11-19 registry-driven close: git issue 26384e0 (registry tip: ec4726203 Konstantin Fedotov Close issue)
