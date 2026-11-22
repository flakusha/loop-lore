<!-- SPDX-License-Identifier: Apache-2.0-->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors-->

# TASK: MFA dedicated operator documentation

**Status:** Done
**Priority:** low
**Effort:** Small
**Epic:** epic-auth-access.md
**Caveats:** TOCTOU, security, authorization, parallelism, lock/unlock lifecycle, partial failure, rollback, stale state, data races, idempotency, observability

**Summary:**

MFA email/messenger delivery, factor enrollment and step-up verification are shipped, and the dedicated operator documentation now exists (`docs/guide/mfa.md:4-32`). The filed premise ("no dedicated operator docs section exists", therefore the release tracker's Documentation updated box stays unchecked) was stale.

**Evidence (dev 2026-11-22):** `docs/guide/mfa.md:4-32` is the operator guide (SMTP/Telegram setup, factor enrollment, recovery, TOTP deferral); tracker MFA line reconciled in `TASK-epic-release-1-0-0.md` by the same reconciliation pass.

**Scope:** add an operator section covering SMTP/Telegram setup, factor enrollment, recovery and the TOTP deferral; link it from the release notes; no code changes.

**Acceptance Criteria:**

- [x] operator docs section exists (`docs/guide/mfa.md:4-32`)
- [x] tracker Documentation updated AC can be checked (`TASK-epic-release-1-0-0.md` MFA line reconciled)
- [x] i18n keys for any new UI strings reconciled (docs-only change, no new UI strings)

**Context:**

(fill in before starting: why this change, constraints, alternatives considered.)

**Resolved:** 2026-11-19 registry-driven close: git issue 26384e0 (registry tip: ec4726203 Konstantin Fedotov Close issue)
